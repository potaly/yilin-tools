/**
 * 文字测量与中文避头尾断行。
 *
 * 测量函数以接口注入：浏览器注入 Canvas 测量器，单元测试注入假测量器，
 * 于是断行规则可以在 node 下直接断言，不需要 jsdom 或 node-canvas。
 */

import { COLORS, type BlockKind, type Metrics } from './spec';

/** 给定 CSS font 简写与文字，返回像素宽度 */
export type Measurer = (font: string, text: string) => number;

export interface Unit {
  /** 这个单元的文字，空白统一规整为一个空格 */
  t: string;
  font: string;
  color: string;
  space: boolean;
  w: number;
}

export interface Line {
  units: Unit[];
  w: number;
}

/** 不能出现在行首的标点 */
export const NO_START = new Set([...'，。、；：？！）》」』】〕”’…—·,.;:?!)%～']);
/** 不能出现在行尾的标点 */
export const NO_END = new Set([...'（《「『【〔“‘(']);

export function fontOf(weight: number, fs: number, family: string): string {
  return `${weight} ${fs}px ${family}`;
}

/** 带缓存的 Canvas 测量器；整个应用里只有这里接触 canvas */
export function createCanvasMeasurer(): Measurer {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (font, text) => {
    if (!ctx) return text.length * 16;
    const key = `${font}\u0000${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

/** 英文单词、数字（含小数与百分号）整体成一个单元，中文逐字成单元 */
const TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9.,:%/'’+\-]*|\s+|[\s\S]/gu;

export function tokenize(
  text: string,
  kind: BlockKind,
  metrics: Metrics,
  measure: Measurer,
  fontFamily: string,
): Unit[] {
  const spec = metrics[kind];
  const units: Unit[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const content = bold ? part.slice(2, -2) : part.replace(/\*\*/g, '');
    const weight = kind === 'p' && bold ? spec.bw : spec.w;
    const color = kind === 'p' ? (bold ? COLORS.bold : COLORS.body) : COLORS[kind];
    const font = fontOf(weight, spec.fs, fontFamily);
    for (const m of content.matchAll(TOKEN_RE)) {
      const s = m[0];
      const space = /^\s+$/.test(s);
      const t = space ? ' ' : s;
      units.push({ t, font, color, space, w: measure(font, t) });
    }
  }
  return units;
}

function sumW(arr: Unit[]): number {
  return arr.reduce((n, u) => n + u.w, 0);
}

function trimEnd(arr: Unit[]): Unit[] {
  while (arr.length && arr[arr.length - 1].space) arr.pop();
  return arr;
}

/** 按最大宽度断行，遵守避头尾，不拆开英文单词与数字 */
export function breakLines(units: Unit[], maxW: number): Line[] {
  const lines: Line[] = [];
  let cur: Unit[] = [];
  let w = 0;
  for (const u of units) {
    if (!cur.length && u.space) continue;
    if (w + u.w <= maxW || !cur.length) {
      cur.push(u);
      w += u.w;
      continue;
    }
    let carry: Unit[] = u.space ? [] : [u];
    // 把行尾挤不下的标点连同前一个字一起挪到下一行，直到不违反避头尾
    while (
      cur.length > 1 &&
      ((carry.length && NO_START.has(carry[0].t)) || NO_END.has(cur[cur.length - 1].t))
    ) {
      carry.unshift(cur.pop() as Unit);
    }
    trimEnd(cur);
    lines.push({ units: cur, w: sumW(cur) });
    cur = carry;
    w = sumW(cur);
  }
  trimEnd(cur);
  if (cur.length) lines.push({ units: cur, w: sumW(cur) });
  return lines;
}
