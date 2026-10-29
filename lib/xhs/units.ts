/**
 * 小红书的硬约束：标题单位数与正文字符额度。
 *
 * 两条都是平台前端写死的，超了直接截断 —— 所以这是「必须改」而不是「建议改」。
 * 全部是纯函数、不依赖运行环境，前端能实时算，后端能当闸门用同一套。
 *
 * 最容易算漏的地方是**标签占用正文的同一个额度**。
 * 这不是口径问题，是真的发不出去：1000 字符包含标签连同 # 号。
 */

import { WIDE_RANGES } from './wide-ranges';

/** 标题上限，单位数而非字符数 */
export const TITLE_MAX_UNITS = 20;
/** 正文字符上限，**标签计入同一额度** */
export const BODY_MAX_CHARS = 1000;
/** 搜索型笔记，核心词应落在标题前 6 个字内 */
export const KEYWORD_HEAD = 6;
/** 标签建议区间 */
export const TAG_MIN = 3;
export const TAG_MAX = 10;
/** 低于这个单位数的标题在双列信息流里信息量不够 */
export const TITLE_MIN_UNITS = 8;

/** 这个码点的 East Asian Width 是不是 F/W/A（算 1 个单位） */
export function isWide(codePoint: number): boolean {
  let lo = 0;
  let hi = WIDE_RANGES.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = WIDE_RANGES[mid * 2];
    const end = WIDE_RANGES[mid * 2 + 1];
    if (codePoint < start) hi = mid - 1;
    else if (codePoint > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * 标题单位数：全角 1，半角 0.5。
 *
 * 按码点遍历而不是按 UTF-16 码元 —— emoji 是代理对，按 `for (const c of s)`
 * 才算 1 个字符而不是 2 个。
 */
export function titleUnits(title: string): number {
  let units = 0;
  for (const ch of title) {
    units += isWide(ch.codePointAt(0) as number) ? 1 : 0.5;
  }
  return units;
}

/** 从正文里抽出标签（不含 # 号） */
export function extractTags(body: string): string[] {
  return Array.from(body.matchAll(/#([^\s#]+)/g), (m) => m[1]);
}

/** 去掉标签之后的正文，用来看开头和结尾 */
export function proseOf(body: string): string {
  return body.replace(/#[^\s#]+/g, '').trim();
}

export interface Limits {
  titleUnits: number;
  titleOver: number;
  titleShort: boolean;
  /** 含标签的正文字符数 —— 这就是平台数的那个数 */
  bodyChars: number;
  bodyOver: number;
  /** 标签本身占掉多少字符（连 # 号，不含它们之间的空格），用来解释额度去哪了 */
  tagChars: number;
  tags: string[];
  /** 有任何一项超限：发出去会被截断 */
  overLimit: boolean;
}

/**
 * 实时额度计算。前端每次按键都调它，所以不做任何扫描和分词。
 *
 * `body` 要传**包含标签**的完整正文，因为平台就是这么数的。
 */
export function measure(title: string, body: string): Limits {
  const units = titleUnits(title);
  const tags = extractTags(body);
  const bodyChars = body.length;
  const tagChars = bodyChars - body.replace(/#[^\s#]+/g, '').length;

  return {
    titleUnits: units,
    titleOver: Math.max(0, units - TITLE_MAX_UNITS),
    titleShort: units > 0 && units < TITLE_MIN_UNITS,
    bodyChars,
    bodyOver: Math.max(0, bodyChars - BODY_MAX_CHARS),
    tagChars,
    tags,
    overLimit: units > TITLE_MAX_UNITS || bodyChars > BODY_MAX_CHARS,
  };
}

/** 把 `# 标题\n正文` 这种 markdown 拆成标题和正文，和 check_copy.py 的输入格式一致 */
export function splitDoc(raw: string): { title: string; body: string } {
  const lines = raw.replace(/\r\n?/g, '\n').trim().split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) {
      return { title: lines[i].slice(2).trim(), body: lines.slice(i + 1).join('\n').trim() };
    }
  }
  return { title: '', body: lines.join('\n').trim() };
}
