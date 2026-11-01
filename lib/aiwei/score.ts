/**
 * 算分与分级。**这两个值不出现在界面上，也不随接口返回。**
 *
 * 分数留着是因为它是规则引擎灵敏度的内部信号（见 tests/aiwei-engine.test.ts：
 * AI 样本要高、真人样本要是 0）。但它不能给用户看 —— 一个 0–100 的数字会被
 * 当成「这篇 95 分，能发」的凭据，而词表命中和平台判违规本来就是两回事。
 * 原来的 LEVEL_TEXT（「一眼就是 AI 写的」）和 SCORE_FORMULA 就是这种判词，
 * 合并成「发布前检查」时已经删掉，别再加回来。
 */

import { TOTAL_WEIGHT } from './rules';
import type { Finding, Level } from './types';

export function scoreOf(findings: Finding[]): number {
  const hit = findings.reduce((acc, f) => acc + f.severity, 0);
  return Math.min(100, Math.round((100 * hit) / TOTAL_WEIGHT));
}

export function levelOf(score: number): Level {
  if (score <= 20) return 'clean';
  if (score <= 45) return 'light';
  if (score <= 70) return 'obvious';
  return 'heavy';
}

