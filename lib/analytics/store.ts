/**
 * 埋点的 Redis 数据层。
 *
 * 三个键：
 *   events:day:<天>              hash，字段 `<工具>|<事件>` → 计数。一次 hgetall 拿到当天整条漏斗
 *   visitors:day:<天>            set，成员是匿名 id。集合大小 = 日活，交集 = 留存
 *   doers:<天>:<工具>:<事件>      set，成员是匿名 id
 *
 * 为什么要第三个：上面那个 hash 记的是**次数**，而方案 v4.1 §6 的决策口径
 * 要的是**人数**和**交集** —— 口径①「触发 check 的独立访客数」、
 * 口径②「①里又触发 run 或 take 的比例」。用次数算这两个口径会被少数人
 * 反复操作带偏，样本越小偏得越狠，而第 14 天恰恰是小样本。
 * 集合天生能做这件事（SINTERCARD），所以多存一份。
 *
 * doers 只服务这两个决策点，留 45 天就够（复盘窗口是 14 / 21 天）。
 *
 * 和 lib/account/store.ts 的 stats:* 分开：那套记的是 AI 调用的成本，
 * 这套记的是人的行为。混在一起两边都会变难读。
 */

import 'server-only';
import { getRedis, nsKey } from '@/lib/redis';
import { EVENTS, type EventName } from './events';

const K = {
  events: (day: string) => nsKey(`events:day:${day}`),
  visitors: (day: string) => nsKey(`visitors:day:${day}`),
  doers: (day: string, tool: string, event: string) => nsKey(`doers:${day}:${tool}:${event}`),
};

const EVENTS_TTL = 60 * 60 * 24 * 400;
/** 访客集合只用来算近期留存，留 120 天足够，也避免无限堆积 */
const VISITORS_TTL = 60 * 60 * 24 * 120;
/** 决策窗口是 14 / 21 天，45 天足够覆盖，也不让这些集合无限堆 */
const DOERS_TTL = 60 * 60 * 24 * 45;
const FIELD_SEP = '|';

export function dayKey(offset = 0): string {
  return new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);
}

export async function recordEvent(vid: string, event: EventName, tool: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const day = dayKey();
  try {
    await Promise.all([
      r.hincrby(K.events(day), `${tool}${FIELD_SEP}${event}`, 1),
      r.sadd(K.visitors(day), vid),
      r.sadd(K.doers(day, tool, event), vid),
    ]);
    await Promise.all([
      r.expire(K.events(day), EVENTS_TTL),
      r.expire(K.visitors(day), VISITORS_TTL),
      r.expire(K.doers(day, tool, event), DOERS_TTL),
    ]);
  } catch (e) {
    console.error('[analytics] 写事件失败:', (e as Error).message);
  }
}

/* ---------- 聚合（纯函数，可单测） ---------- */

export type Funnel = Record<EventName, number>;

/** 从 EVENTS 派生，别手写字面量 —— 加事件时漏掉一处就会在别处炸 */
export function emptyFunnel(): Funnel {
  return Object.fromEntries(EVENTS.map((e) => [e, 0])) as Funnel;
}

export interface DayEvents {
  day: string;
  /** 工具 slug → 漏斗 */
  byTool: Record<string, Funnel>;
  total: Funnel;
}

/** 把扁平 hash（字段形如 "ai-flavor|open"）还原成按工具分组的漏斗 */
export function parseEventDay(day: string, raw: Record<string, unknown> | null): DayEvents {
  const byTool: Record<string, Funnel> = {};
  const total = emptyFunnel();

  for (const [field, value] of Object.entries(raw ?? {})) {
    const at = field.lastIndexOf(FIELD_SEP);
    if (at <= 0) continue;
    const tool = field.slice(0, at);
    const event = field.slice(at + 1) as EventName;
    if (!(EVENTS as readonly string[]).includes(event)) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;

    byTool[tool] ??= emptyFunnel();
    byTool[tool][event] += n;
    total[event] += n;
  }

  return { day, byTool, total };
}

export function intersectCount(a: string[], b: string[]): number {
  const set = new Set(a);
  let n = 0;
  for (const x of new Set(b)) if (set.has(x)) n++;
  return n;
}

export interface Retention {
  /** 上一个 7 天来过的人 */
  lastWeek: number;
  /** 其中这 7 天又回来了的 */
  returned: number;
  /** returned / lastWeek，lastWeek 为 0 时是 null */
  rate: number | null;
}

export function computeRetention(lastWeekIds: string[], thisWeekIds: string[]): Retention {
  const lastWeek = new Set(lastWeekIds).size;
  const returned = intersectCount(lastWeekIds, thisWeekIds);
  return { lastWeek, returned, rate: lastWeek ? returned / lastWeek : null };
}

/* ---------- 读取 ---------- */

export async function getEventStats(days = 14): Promise<DayEvents[]> {
  const r = getRedis();
  if (!r) return [];
  const out: DayEvents[] = [];
  for (let i = 0; i < days; i++) {
    const d = dayKey(i);
    try {
      out.push(parseEventDay(d, await r.hgetall(K.events(d))));
    } catch (e) {
      console.error('[analytics] 读事件失败:', (e as Error).message);
      out.push(parseEventDay(d, null));
    }
  }
  return out;
}

async function visitorsOf(offsets: number[]): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  const lists = await Promise.all(
    offsets.map(async (i) => {
      try {
        return (await r.smembers(K.visitors(dayKey(i)))) ?? [];
      } catch {
        return [];
      }
    })
  );
  return lists.flat();
}

/** 近 days 天的日活（去重匿名访客数） */
export async function getDailyVisitors(days = 14): Promise<{ day: string; count: number }[]> {
  const r = getRedis();
  if (!r) return [];
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = dayKey(i);
    try {
      out.push({ day: d, count: new Set((await r.smembers(K.visitors(d))) ?? []).size });
    } catch {
      out.push({ day: d, count: 0 });
    }
  }
  return out;
}

/** 次周留存：上一个 7 天来过的人，这 7 天回来了几个 */
export async function getRetention(): Promise<Retention> {
  const [thisWeek, lastWeek] = await Promise.all([
    visitorsOf([0, 1, 2, 3, 4, 5, 6]),
    visitorsOf([7, 8, 9, 10, 11, 12, 13]),
  ]);
  return computeRetention(lastWeek, thisWeek);
}

/* ---------- 第 14 天复盘口径（方案 v4.1 §6） ---------- */

/** 某一天做过某个事件的人 */
async function doersOnDay(tool: string, event: EventName, day: string): Promise<Set<string>> {
  const r = getRedis();
  if (!r) return new Set();
  try {
    return new Set<string>(((await r.smembers(K.doers(day, tool, event))) ?? []) as string[]);
  } catch {
    /* 读不到就当这天没有，不要让整块报表挂掉 */
    return new Set();
  }
}

export interface CheckFunnel {
  /** 口径①：检查出过结果的独立访客数。**绝对值，不读比例** */
  checked: number;
  /** 口径②的分子：①里**在同一天**又点了改写或复制走的人 */
  acted: number;
  /** 分母够不够。不够就别读比例 —— 见下面的注释 */
  enough: boolean;
  /** 读比例需要的最小分母 */
  floor: number;
  days: number;
  /** 口径③：说有用的人数 / 提交过反馈的人数 */
  said: { useful: number; useless: number };
}

/**
 * 分母门槛。
 *
 * 低于这个数一律不读比例：个位数样本上的百分比是噪音，而第 14 天恰恰是
 * 小样本。方案 v4.1 §6 写死了处理规则 —— 不够就是「继续观察」，
 * 日期到了不等于必须下判断，更不能拿一个 2/3 去说服自己。
 */
export const CHECK_FLOOR = 30;

/**
 * 口径①②。注意是**人数**不是次数。
 *
 * 交集按**天**取，不是拿整个窗口的两个大集合相交 —— 后者会把「第 1 天改写、
 * 第 10 天才检查」的人也算成「检查之后采取了行动」，方向正好反了。
 *
 * 同日仍然不等于同一次会话，但在这个工具上已经足够准：`rewrite()` 被
 * `ready` 挡着，复制按钮所在的整块结果区也只在 `ready` 之后渲染，
 * 而 `check` 正是 `ready` 时发的 —— **同一次页面加载里 check 必然在前**。
 * 要做到严格排序得给每个 (人, 事件) 存时间戳，成本远高于它能多纠正的那点偏差。
 */
export async function getCheckFunnel(days = 14, tool = 'check'): Promise<CheckFunnel> {
  const checked = new Set<string>();
  const acted = new Set<string>();

  for (let i = 0; i < days; i++) {
    const day = dayKey(i);
    const [c, ran, took] = await Promise.all([
      doersOnDay(tool, 'check', day),
      doersOnDay(tool, 'run', day),
      doersOnDay(tool, 'take', day),
    ]);
    for (const vid of c) {
      checked.add(vid);
      if (ran.has(vid) || took.has(vid)) acted.add(vid);
    }
  }

  // 口径③的两头各自是独立的人，不需要和 check 对齐，所以整窗口取并集就行
  const [useful, useless] = await Promise.all([
    unionOver(tool, 'useful', days),
    unionOver(tool, 'useless', days),
  ]);

  return {
    checked: checked.size,
    acted: acted.size,
    enough: checked.size >= CHECK_FLOOR,
    floor: CHECK_FLOOR,
    days,
    said: { useful: useful.size, useless: useless.size },
  };
}

/** 整个窗口里做过某事件的人，去重 */
async function unionOver(tool: string, event: EventName, days: number): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < days; i++) {
    for (const vid of await doersOnDay(tool, event, dayKey(i))) out.add(vid);
  }
  return out;
}
