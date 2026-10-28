/**
 * 跑全部规则，产出体检报告。
 *
 * 纯函数、纯规则、零网络请求 —— 断网能跑是这个工具的硬判据。
 */

import { countConcrete } from './rules/density';
import { ALL_RULES } from './rules';
import { coefficientOfVariation, segment } from './segment';
import { levelOf, scoreOf } from './score';
import type { Finding, Report } from './types';

const EMOJI_G = /\p{Extended_Pictographic}/gu;

export function analyze(input: string): Report {
  const seg = segment(input);

  const findings: Finding[] = ALL_RULES.map((rule) => rule.detect(seg)).filter(
    (f): f is Finding => f !== null
  );
  findings.sort((a, b) => b.severity - a.severity);

  const score = scoreOf(findings);
  EMOJI_G.lastIndex = 0;
  const emojiCount = seg.text.match(EMOJI_G)?.length ?? 0;

  return {
    text: seg.text,
    score,
    level: levelOf(score),
    findings,
    stats: {
      charCount: seg.charCount,
      paraCount: seg.paras.length,
      paraLenCv: coefficientOfVariation(seg.bodyParas.map((p) => p.text.length)),
      emojiRate: seg.paras.length ? emojiCount / seg.paras.length : 0,
      numberPer100: seg.charCount ? (countConcrete(seg.text).length / seg.charCount) * 100 : 0,
    },
  };
}
