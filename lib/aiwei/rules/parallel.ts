/**
 * R1 排比堆叠（锚规则）
 *
 * AI 爱用整齐的三连句。判定刻意收紧：同一段里连续 ≥3 个分句，
 * 且这几句**共享句首或句尾的两个字**，长度还相近。
 * 只靠"长度相近"会把正常的工整写作也扫进来，所以必须叠加首尾同构这一条。
 *
 * 按分句而不是整句来找：「不断学习，不断迭代，不断优化」在一个句号里，
 * 按句号切分根本看不见。
 */

import { stripEdgePunctuation } from '../segment';
import type { Rule, Segmented, Sentence } from '../types';

const MIN_RUN = 3;
const MIN_LEN = 3;
const MAX_LEN = 30;
/** 最长句 / 最短句的上限，超过说明长短不齐，不算排比 */
const MAX_LEN_RATIO = 1.6;

export const parallelRule: Rule = {
  id: 'parallel',
  label: '排比堆叠',
  weight: 3,

  detect(seg: Segmented) {
    const runs: Sentence[][] = [];

    for (const para of seg.paras) {
      const list = seg.clauses.filter((s) => s.paraIndex === para.index);
      let run: Sentence[] = [];

      for (const s of list) {
        if (run.length && isHomogeneous([...run, s])) {
          run.push(s);
          continue;
        }
        if (run.length >= MIN_RUN) runs.push(run);
        run = inRange(s) ? [s] : [];
      }
      if (run.length >= MIN_RUN) runs.push(run);
    }

    if (!runs.length) return null;

    const count = runs.reduce((acc, r) => acc + r.length, 0);
    return {
      rule: 'parallel',
      label: '排比堆叠',
      severity: 3,
      spans: runs.map((run) => ({ start: run[0].start, end: run[run.length - 1].end })),
      detail: `${runs.length} 处连续同构短句，共 ${count} 个分句`,
      hint: '留一句最有信息量的，其余两句删掉或合并',
    };
  },
};

function inRange(s: Sentence): boolean {
  const len = stripEdgePunctuation(s.text).length;
  return len >= MIN_LEN && len <= MAX_LEN;
}

function isHomogeneous(run: Sentence[]): boolean {
  if (!run.every(inRange)) return false;

  const bodies = run.map((s) => stripEdgePunctuation(s.text));
  const lens = bodies.map((b) => b.length);
  if (Math.max(...lens) / Math.min(...lens) > MAX_LEN_RATIO) return false;

  const sameHead = bodies.every((b) => b.slice(0, 2) === bodies[0].slice(0, 2));
  const sameTail = bodies.every((b) => b.slice(-2) === bodies[0].slice(-2));
  return sameHead || sameTail;
}
