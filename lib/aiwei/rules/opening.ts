/**
 * R9 开场寒暄
 *
 * 只在前两段里找。小红书的前 3 行是信息流预览区，用来铺垫等于把唯一的钩子位浪费掉。
 */

import { findPatterns, findPhrases } from '../match';
import type { Rule, Segmented, Span } from '../types';

const PHRASES = ['众所周知', '在当今社会', '在这个快节奏的', '相信很多人都', '相信大家都'] as const;

const PATTERNS = [
  /在这个[^，。！？\n]{0,12}的时代/,
  /随着[^，。！？\n]{0,14}的(?:发展|普及|到来)/,
  /说到[^，。！？\n]{0,12}[，,][^，。！？\n]{0,6}大家都/,
] as const;

const HEAD_PARAS = 2;

export const openingRule: Rule = {
  id: 'opening',
  label: '开场寒暄',
  weight: 2,

  detect(seg: Segmented) {
    const head = seg.paras.slice(0, HEAD_PARAS);
    if (!head.length) return null;

    const spans: Span[] = head.flatMap((p) => [
      ...findPhrases(seg.text, PHRASES, p.start, p.end),
      ...findPatterns(seg.text, PATTERNS, p.start, p.end),
    ]);
    if (!spans.length) return null;

    return {
      rule: 'opening',
      label: '开场寒暄',
      severity: 2,
      spans: spans.sort((a, b) => a.start - b.start),
      detail: `开头 ${spans.length} 处铺垫`,
      hint: '删掉，直接从结论或冲突开始',
    };
  },
};
