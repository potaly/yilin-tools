/**
 * 埋点的事件定义与校验。前后端共用，所以这里不能引 server-only。
 *
 * 事件表刻意不做成可扩展的字符串 —— 一旦放开就会长成一堆没人看的噪音。
 * 要加一个，先回答"它能回答哪个我现在答不了的问题"。
 *
 * check 是这么加进来的：「发布前检查」的规则检查**不调 AI、不扣额度**，
 * 原来的 run 只在点 AI 改写时才报，于是免费检查这条核心路径在漏斗里完全
 * 看不见 —— 而它恰恰是这一轮要验证的东西。有了 check，才答得了两个问题：
 * 粘进来的人里有多少真的看到了结果（check / open），
 * 看到结果之后又有多少要了 AI 改写（run / check）。
 *
 * 后三个各自答的问题：
 *
 * - input：**首页的粘贴框原来完全没有埋点**，它现在是主入口却是盲的。
 *   有了 input 才分得清「没人粘」和「粘了但没往下走」—— 方案 v4.1 §4.2
 *   把粘贴率定成漏斗诊断（判断首页看不看得懂），**不是价值指标**，
 *   任何「粘贴率涨了 = 产品变好」的推论都是错的。
 * - handoff：工具之间的交接有没有人真的走（v4.1 §6 第 21 天口径⑦）。
 *   选题→文案→检查这条链一直是凭空设计的，没有一个数字说过有人走完。
 * - useful / useless：结果到底有没有用（§6 口径③）。前面那些都只能说明
 *   「他把东西拿走了」，说明不了拿走的东西是好的。
 *
 * **为什么是两个事件而不是一个 feedback 带方向字段**：事件体只认
 * `{vid, event, tool}` 三个字段，放开第四个就等于放开任意负载，而这张表
 * 最该守住的就是「不收正文」。拆成两个事件名既不动 schema，后台漏斗表
 * 也能直接读出来。
 *
 * 一个 feedback 是不够的：§6 口径③ 的分子是「反馈为**有帮助**的人数」、
 * 分母是「提交反馈的人数」，只发一个事件的话分子恒等于分母，比例永远
 * 100%，这个口径根本算不出来。界面上还写着「没帮上忙的会拿去调规则」——
 * 那是一个数据兑现不了的承诺。
 *
 * 再加第十个之前，先回答同样的问题。
 *
 * 事件体里只有「匿名 id + 事件名 + 工具名」。文字内容、标题、字数一律不发。
 */

import { TOOLS } from '@/lib/site';

export const EVENTS = [
  'open', 'input', 'check', 'run', 'done', 'take', 'handoff', 'useful', 'useless',
] as const;
export type EventName = (typeof EVENTS)[number];

export const EVENT_LABEL: Record<EventName, string> = {
  open: '打开工具',
  input: '开始输入',
  check: '免费检查出结果',
  run: '点生成',
  done: '生成成功',
  take: '复制或下载',
  handoff: '带去下一个工具',
  useful: '说了有用',
  useless: '说了没用',
};

/** crypto.randomUUID() 的格式 */
const VID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TrackInput {
  vid: string;
  event: EventName;
  tool: string;
}

/** vid 是不是合法的匿名 id。接口入口共用，别在各处再手写一遍正则 */
export function isVid(x: unknown): x is string {
  return typeof x === 'string' && VID_RE.test(x);
}

export function isEvent(x: unknown): x is EventName {
  return typeof x === 'string' && (EVENTS as readonly string[]).includes(x);
}

export function isTool(x: unknown): x is string {
  return typeof x === 'string' && TOOLS.some((t) => t.slug === x);
}

/** 接口入口的校验：任何一项不合法就整条丢掉，不做部分接受 */
export function parseTrack(body: unknown): TrackInput | null {
  if (!body || typeof body !== 'object') return null;
  const { vid, event, tool } = body as Record<string, unknown>;
  if (typeof vid !== 'string' || !VID_RE.test(vid)) return null;
  if (!isEvent(event)) return null;
  if (!isTool(tool)) return null;
  return { vid: vid.toLowerCase(), event, tool };
}
