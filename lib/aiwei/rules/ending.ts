/**
 * R3 万能结尾（锚规则）
 *
 * 只在最后两段里找 —— 这些话出现在正文中间往往是正常的，出现在收尾才是套路。
 * 没有收「欢迎在评论区」：引导评论是有效的运营动作，不该被判成 AI 味。
 */

import { findPhrases } from '../match';
import type { Rule, Segmented, Span } from '../types';

const PHRASES = [
  '希望对你有帮助',
  '希望能帮到你',
  '希望这篇',
  '让我们一起',
  '未来可期',
  '值得期待',
  '不妨试试',
  '不妨一试',
  '相信你也能',
  '相信你一定',
  '快来试试',
  '赶紧行动起来',
  '行动起来吧',
  '一起加油',
  '共勉',
  '你学会了吗',
  '你get到了吗',
] as const;

const TAIL_PARAS = 2;

export const endingRule: Rule = {
  id: 'ending',
  label: '万能结尾',
  weight: 3,

  detect(seg: Segmented) {
    const tail = seg.paras.slice(-TAIL_PARAS);
    if (!tail.length) return null;

    const spans: Span[] = tail.flatMap((p) => findPhrases(seg.text, PHRASES, p.start, p.end));
    if (!spans.length) return null;

    return {
      rule: 'ending',
      label: '万能结尾',
      severity: 3,
      spans,
      detail: `结尾出现 ${spans.length} 处套话`,
      hint: '换成一个具体的下一步，或者一个真能回答的问题',
    };
  },
};
