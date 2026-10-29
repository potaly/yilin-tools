/**
 * 「新生成内容」共用的闸门。
 *
 * 和改写（rewrite.ts）的闸门是两套口径，差别来自 playbook.md 第七节：
 *
 *   改写  —— 原文是用户的稿子。soft 词（绝对化、功效宣称）留着不算失败，
 *            标出来让他自己决定。
 *   生成  —— 标题、正文、选题都是工具新写的。soft 词一个都不该有，
 *            工具没有理由主动吐出一个「祛湿」或者「最有效」。
 *
 * 所以这里比那边严。拦下来之后把具体的词回传给模型重写一次。
 */

import { riskHits } from './scan';

export interface GenerateGate {
  ok: boolean;
  hard: string[];
  soft: string[];
}

/** 把一次生成的所有文本（标题 + 正文 + 标签 + 选题）合起来过一遍 */
export function gateGenerated(...texts: string[]): GenerateGate {
  const joined = texts.filter(Boolean).join('\n');
  const { hard, soft } = riskHits(joined);
  return {
    ok: hard.length === 0 && soft.length === 0,
    hard: [...new Set(hard)],
    soft: [...new Set(soft)],
  };
}

/** 回传给模型的那句话：这几个词不能用，换个说法重写 */
export function retryHint(gate: GenerateGate): string {
  const parts: string[] = [];
  if (gate.hard.length) {
    parts.push(`${gate.hard.map((w) => `「${w}」`).join('、')}（必须避开）`);
  }
  if (gate.soft.length) {
    parts.push(`${gate.soft.map((w) => `「${w}」`).join('、')}（换成个人体验或场景描述）`);
  }
  return (
    `上一版用了这些不能出现在新写内容里的词：${parts.join('；')}。` +
    '这次一个都不要用，换个说法把同一个意思说出来，不要只是删掉。'
  );
}
