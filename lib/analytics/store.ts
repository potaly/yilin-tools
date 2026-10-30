/**
 * 埋点的 Redis 数据层。
 *
 * 两个键就够了：
 *   events:day:<天>    hash，字段 `<工具>|<事件>` → 计数。一次 hgetall 拿到当天整条漏斗
 *   visitors:day:<天>  set，成员是匿名 id。集合大小 = 日活，交集 = 留存
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
};

const EVENTS_TTL = 60 * 60 * 24 * 400;
/** 访客集合只用来算近期留存，留 120 天足够，也避免无限堆积 */
const VISITORS_TTL = 60 * 60 * 24 * 120;
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
    ]);
    await Promise.all([
      r.expire(K.events(day), EVENTS_TTL),
      r.expire(K.visitors(day), VISITORS_TTL),
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
