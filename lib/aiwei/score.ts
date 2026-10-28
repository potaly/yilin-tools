/**
 * 算分与分级。
 *
 * 公式故意做得简单到可以印在页面上：命中规则的权重之和 ÷ 全部规则权重之和。
 * 别人做黑箱检测器，这里公开算法 —— 和"规则写进代码"是同一个姿态。
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

export const LEVEL_TEXT: Record<Level, string> = {
  clean: '基本没有 AI 味',
  light: '有一点痕迹，改两处就行',
  obvious: 'AI 味明显',
  heavy: '一眼就是 AI 写的',
};

/** 印在页面上的算法说明 */
export const SCORE_FORMULA = `AI味指数 = 100 × 命中规则的权重之和 ÷ ${TOTAL_WEIGHT}（全部 9 条规则的权重之和）`;
