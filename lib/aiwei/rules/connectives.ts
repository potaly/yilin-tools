/**
 * R7 关联词密度过高
 *
 * 看密度不看出现。这些词本身没问题，问题是 AI 几乎每段都要来一个，
 * 把本来并列的句子硬接成"逻辑严密"的样子。
 *
 * 故意没收「首先 / 其次 / 最后」：干货笔记里分步骤是正当写法。
 */

import { findPhrases } from '../match';
import type { Rule, Segmented } from '../types';

const PHRASES = [
  '然而',
  '因此',
  '此外',
  '总之',
  '综上所述',
  '值得一提的是',
  '值得注意的是',
  '不难看出',
  '由此可见',
  '换言之',
  '总而言之',
  '与此同时',
  '更重要的是',
] as const;

const MIN_CHARS = 200;
/** 每 200 字超过这个数量算过密 */
const MAX_PER_200 = 2;

export const connectivesRule: Rule = {
  id: 'connectives',
  label: '关联词过密',
  weight: 2,

  detect(seg: Segmented) {
    if (seg.charCount < MIN_CHARS) return null;

    const spans = findPhrases(seg.text, PHRASES);
    const per200 = (spans.length / seg.charCount) * 200;
    if (per200 <= MAX_PER_200) return null;

    return {
      rule: 'connectives',
      label: '关联词过密',
      severity: 2,
      spans,
      detail: `${spans.length} 个关联词，平均每 200 字 ${per200.toFixed(1)} 个`,
      hint: '删掉一半。句子之间的关系，读者读得出来',
    };
  },
};
