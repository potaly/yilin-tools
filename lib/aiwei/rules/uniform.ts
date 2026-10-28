/**
 * R5 段落长度过于均匀（锚规则）
 *
 * 人写东西长短不齐：想透的地方写长，顺带一提的地方写短。
 * AI 倾向于每段都差不多长，这是最难自己察觉、也最容易量化的一条。
 *
 * 只统计正文段，标题行会把变异系数抬高，反而掩盖问题。
 */

import { coefficientOfVariation } from '../segment';
import type { Rule, Segmented } from '../types';

const MIN_PARAS = 4;
/** 变异系数低于此值即判定为过于整齐 */
const MAX_CV = 0.25;

export const uniformRule: Rule = {
  id: 'uniform',
  label: '段落长度过于均匀',
  weight: 3,

  detect(seg: Segmented) {
    const paras = seg.bodyParas;
    if (paras.length < MIN_PARAS) return null;

    const cv = coefficientOfVariation(paras.map((p) => p.text.length));
    if (cv === null || cv >= MAX_CV) return null;

    const lens = paras.map((p) => p.text.length);
    return {
      rule: 'uniform',
      label: '段落长度过于均匀',
      severity: 3,
      spans: paras.map((p) => ({ start: p.start, end: p.end })),
      detail: `${paras.length} 段长度几乎一致（${Math.min(...lens)}–${Math.max(...lens)} 字）`,
      hint: '把最重要的那段写长，次要的砍成一句话',
    };
  },
};
