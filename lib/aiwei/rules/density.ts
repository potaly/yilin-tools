/**
 * R6 信息密度过低
 *
 * 这条是整套规则里最有价值的一条。别人判"语气像不像人"，这条判
 * **读完到底有没有拿到东西**：格式漂亮、分点整齐、通篇没有一个具体的数字、
 * 产品名、单位 —— 这才是 AI 文案一眼假的真正原因。
 *
 * "具体物"用可以机器判定的三类近似：阿拉伯数字、中文数字+量词、拉丁词（产品名多属此类）。
 */

import type { Rule, Segmented, Span } from '../types';

/** 太短的文本统计不出密度，直接跳过 */
const MIN_CHARS = 200;
/** 每 100 字的具体物数量下限 */
const MIN_PER_100 = 1;

const CONCRETE =
  /\d+(?:\.\d+)?%?|[一二三四五六七八九十两半]+(?:个|条|种|次|天|年|月|周|分钟|小时|秒|元|块|倍|成|折|页|张|步|层|轮)|[A-Za-z][A-Za-z0-9.+-]{1,}/g;

export const densityRule: Rule = {
  id: 'density',
  label: '信息密度过低',
  weight: 3,

  detect(seg: Segmented) {
    if (seg.charCount < MIN_CHARS) return null;

    const hits = countConcrete(seg.text);
    const per100 = (hits.length / seg.charCount) * 100;
    if (per100 >= MIN_PER_100) return null;

    return {
      rule: 'density',
      label: '信息密度过低',
      severity: 3,
      spans: hits.length ? hits : [],
      detail: `全文 ${seg.charCount} 字，只有 ${hits.length} 处具体数字或名称`,
      hint: '每个分点至少补一个数字、一个产品名，或一件真发生过的事',
    };
  },
};

export function countConcrete(text: string): Span[] {
  const spans: Span[] = [];
  CONCRETE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONCRETE.exec(text))) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}
