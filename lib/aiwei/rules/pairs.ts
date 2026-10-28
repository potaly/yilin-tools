/**
 * R2 「不仅…而且」类句式（锚规则）
 *
 * 配对词必须落在同一句里才算，且全文出现 ≥2 次才命中 —— 偶尔用一次是正常中文。
 * 故意没收「不是…而是」：它在好文章里同样高频，收进来误报太多。
 */

import type { Rule, Segmented, Span } from '../types';

const PAIRS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['不仅', ['而且', '还', '也']],
  ['不但', ['而且', '还', '也']],
  ['既', ['又', '也']],
  ['既要', ['又要', '还要']],
  ['一方面', ['另一方面']],
  ['无论', ['都']],
];

const MIN_HITS = 2;

export const pairsRule: Rule = {
  id: 'pairs',
  label: '「不仅…而且」句式',
  weight: 2,

  detect(seg: Segmented) {
    const spans: Span[] = [];

    for (const s of seg.sentences) {
      for (const [head, tails] of PAIRS) {
        const at = s.text.indexOf(head);
        if (at === -1) continue;
        const tail = tails.find((t) => s.text.indexOf(t, at + head.length) !== -1);
        if (!tail) continue;
        const end = s.text.indexOf(tail, at + head.length) + tail.length;
        spans.push({ start: s.start + at, end: s.start + end });
        break; // 一句只记一次
      }
    }

    if (spans.length < MIN_HITS) return null;

    return {
      rule: 'pairs',
      label: '「不仅…而且」句式',
      severity: 2,
      spans,
      detail: `${spans.length} 句用了固定关联句式`,
      hint: '拆成两个短句，或直接说后半句',
    };
  },
};
