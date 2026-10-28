/**
 * 规则清单。顺序即界面上的默认顺序（同严重度时）。
 *
 * 前 5 条是锚规则，来自已验证的内容选题，不要删。
 * 后 4 条是扩展规则，如果误报变高，优先降权或从这里摘掉。
 */

import type { Rule } from '../types';
import { parallelRule } from './parallel';
import { pairsRule } from './pairs';
import { endingRule } from './ending';
import { emojiRule } from './emoji';
import { uniformRule } from './uniform';
import { densityRule } from './density';
import { connectivesRule } from './connectives';
import { hollowRule } from './hollow';
import { openingRule } from './opening';

export const ANCHOR_RULES: Rule[] = [
  parallelRule,
  pairsRule,
  endingRule,
  emojiRule,
  uniformRule,
];

export const EXTRA_RULES: Rule[] = [densityRule, connectivesRule, hollowRule, openingRule];

export const ALL_RULES: Rule[] = [...ANCHOR_RULES, ...EXTRA_RULES];

export const TOTAL_WEIGHT = ALL_RULES.reduce((acc, r) => acc + r.weight, 0);
