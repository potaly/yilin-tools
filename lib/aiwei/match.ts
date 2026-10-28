/** 词表扫描：规则文件共用，统一返回带下标的命中区间 */

import type { Span } from './types';

/** 在 text 里找出所有词表命中，按出现顺序返回 */
export function findPhrases(text: string, phrases: readonly string[], from = 0, to = text.length): Span[] {
  const hay = text.slice(from, to);
  const spans: Span[] = [];

  for (const phrase of phrases) {
    let at = hay.indexOf(phrase);
    while (at !== -1) {
      spans.push({ start: from + at, end: from + at + phrase.length });
      at = hay.indexOf(phrase, at + phrase.length);
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** 模板命中，如「在这个…的时代」。中间部分限制长度，避免跨句误配 */
export function findPatterns(text: string, patterns: readonly RegExp[], from = 0, to = text.length): Span[] {
  const hay = text.slice(from, to);
  const spans: Span[] = [];

  for (const re of patterns) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(hay))) {
      spans.push({ start: from + m.index, end: from + m.index + m[0].length });
      if (m[0].length === 0) g.lastIndex += 1;
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** 命中区间去重合并，同一处被多个词表命中时只留一个 */
export function dedupe(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}
