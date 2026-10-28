/**
 * 把原文切成段和句，并记住每一处在原文里的下标。
 *
 * 下标必须准确：界面上点一条命中项要能高亮到原文对应位置，用段序号做不到。
 * 所以这里只做 normalizeInput（统一换行、去零宽字符），不做任何会改变长度的清理。
 */

import { isHeadingLike, normalizeInput } from '@/lib/cards/clean';
import type { Para, Segmented, Sentence } from './types';

const SENTENCE_BREAK = /[。！？!?；;…]+["'”’』」）】)]*/g;
const CLAUSE_BREAK = /[。！？!?；;…，,、]+["'”’』」）】)]*/g;
const WHITESPACE = /\s/g;

export function segment(input: string): Segmented {
  const text = normalizeInput(input);
  const paras = splitParas(text);
  return {
    text,
    paras,
    bodyParas: paras.filter((p) => !p.heading),
    sentences: paras.flatMap((p) => splitBy(p, SENTENCE_BREAK)),
    clauses: paras.flatMap((p) => splitBy(p, CLAUSE_BREAK)),
    charCount: text.replace(WHITESPACE, '').length,
  };
}

function splitParas(text: string): Para[] {
  const paras: Para[] = [];
  let cursor = 0;

  for (const raw of text.split('\n')) {
    const start = cursor;
    cursor += raw.length + 1; // +1 是被 split 吃掉的 \n
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!body) continue;
    paras.push({
      text: body,
      start: start + lead,
      end: start + lead + body.length,
      index: paras.length,
      heading: isHeadingLike(body),
    });
  }

  return paras;
}

function splitBy(para: Para, breaker: RegExp): Sentence[] {
  const out: Sentence[] = [];
  let from = 0;

  const push = (to: number) => {
    const raw = para.text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) {
      out.push({
        text: body,
        start: para.start + from + lead,
        end: para.start + from + lead + body.length,
        paraIndex: para.index,
      });
    }
    from = to;
  };

  breaker.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = breaker.exec(para.text))) {
    push(m.index + m[0].length);
  }
  push(para.text.length);

  return out;
}

/** 变异系数 = 标准差 / 平均值。衡量"长度是不是过于整齐"，不受整体长短影响 */
export function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** 去掉句末标点，用于比较句子的首尾结构 */
export function stripEdgePunctuation(s: string): string {
  return s
    .replace(/^[\s"'“”‘’「『（(【\[《]+/, '')
    .replace(/[\s。！？!?；;…，,、"'“”‘’」』）)】\]》]+$/, '');
}
