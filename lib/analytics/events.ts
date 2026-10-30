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
 * 事件体里只有「匿名 id + 事件名 + 工具名」。文字内容、标题、字数一律不发。
 */

import { TOOLS } from '@/lib/site';

export const EVENTS = ['open', 'check', 'run', 'done', 'take'] as const;
export type EventName = (typeof EVENTS)[number];

export const EVENT_LABEL: Record<EventName, string> = {
  open: '打开工具',
  check: '免费检查出结果',
  run: '点生成',
  done: '生成成功',
  take: '复制或下载',
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
