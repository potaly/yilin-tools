/**
 * R4 emoji 当装饰（锚规则）
 *
 * 判的不是"用了 emoji"，是"每段开头挂一个当项目符号"。
 * 真人发小红书本来就爱用 emoji，所以只看两种机械用法：
 * 段首固定挂、或者密度高到接近一段一个。
 */

import type { Rule, Segmented, Span } from '../types';

const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_G = /\p{Extended_Pictographic}/gu;
/** 段首带 emoji 的段落数阈值 */
const MIN_LED = 3;
/** emoji 数 / 段落数 */
const MAX_RATE = 0.8;

export const emojiRule: Rule = {
  id: 'emoji',
  label: 'emoji 当装饰',
  weight: 2,

  detect(seg: Segmented) {
    if (!seg.paras.length) return null;

    const led: Span[] = [];
    for (const p of seg.paras) {
      const first = [...p.text][0];
      if (first && EMOJI.test(first)) {
        led.push({ start: p.start, end: p.start + first.length });
      }
    }

    const total = countEmoji(seg.text);
    const rate = total / seg.paras.length;
    const byLed = led.length >= MIN_LED;
    const byRate = rate >= MAX_RATE && total >= MIN_LED;
    if (!byLed && !byRate) return null;

    return {
      rule: 'emoji',
      label: 'emoji 当装饰',
      severity: 2,
      spans: led.length ? led : allEmojiSpans(seg.text),
      detail: byLed
        ? `${led.length} 段用 emoji 开头`
        : `全文 ${total} 个 emoji，平均每段 ${rate.toFixed(1)} 个`,
      hint: 'emoji 留给真的需要情绪的地方，别当项目符号用',
    };
  },
};

function countEmoji(text: string): number {
  EMOJI_G.lastIndex = 0;
  return text.match(EMOJI_G)?.length ?? 0;
}

function allEmojiSpans(text: string): Span[] {
  const spans: Span[] = [];
  EMOJI_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_G.exec(text))) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}
