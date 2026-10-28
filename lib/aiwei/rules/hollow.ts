/**
 * R8 空心词
 *
 * 这些词看着很专业，但替换成任何行业都成立 —— 也就是什么都没说。
 * 偶尔用一个是正常的，所以要 ≥2 个不同的词、或同一个词出现 ≥3 次才命中。
 */

import { dedupe, findPhrases } from '../match';
import type { Rule, Segmented } from '../types';

const PHRASES = [
  '赋能',
  '助力',
  '打造',
  '全方位',
  '底层逻辑',
  '闭环',
  '抓手',
  '颗粒度',
  '场景化',
  '精准触达',
  '无缝衔接',
  '极致体验',
  '深度融合',
  '数字化转型',
  '生态闭环',
  '降本增效',
] as const;

export const hollowRule: Rule = {
  id: 'hollow',
  label: '空心词',
  weight: 2,

  detect(seg: Segmented) {
    const distinct = PHRASES.filter((p) => seg.text.includes(p));
    const spans = dedupe(findPhrases(seg.text, PHRASES));
    if (distinct.length < 2 && spans.length < 3) return null;

    return {
      rule: 'hollow',
      label: '空心词',
      severity: 2,
      spans,
      detail: `${spans.length} 处：${distinct.slice(0, 4).join('、')}${distinct.length > 4 ? '…' : ''}`,
      hint: '换成这件事具体做了什么，或者直接删掉',
    };
  },
};
