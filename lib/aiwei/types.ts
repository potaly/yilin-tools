/**
 * AI味检测的公共类型。
 *
 * 设计前提：检测全部是确定性规则，不调 AI。规则写进代码，结果可复现、可单测，
 * 而不是让模型临场判断"像不像 AI 写的"。
 */

export type RuleId =
  | 'parallel'
  | 'pairs'
  | 'ending'
  | 'emoji'
  | 'uniform'
  | 'density'
  | 'connectives'
  | 'hollow'
  | 'opening';

/** 原文里的字符区间，用于在界面上高亮。下标相对 Segmented.text */
export interface Span {
  start: number;
  end: number;
}

export interface Para extends Span {
  text: string;
  index: number;
  /** `# ` / `## ` / 「一、」这类结构行，统计正文时要排除 */
  heading: boolean;
}

export interface Sentence extends Span {
  text: string;
  paraIndex: number;
}

export interface Segmented {
  /** 规范化之后的文本，所有 span 下标都相对它 */
  text: string;
  paras: Para[];
  /** 不含标题行的正文段 */
  bodyParas: Para[];
  sentences: Sentence[];
  /** 再按逗号顿号切一层：排比常写在一句话里，按句号切分抓不到 */
  clauses: Sentence[];
  /** 不含空白字符的长度 */
  charCount: number;
}

export interface Finding {
  rule: RuleId;
  /** 给用户看的名字，如「万能结尾」 */
  label: string;
  severity: 1 | 2 | 3;
  /** 命中位置，可能多处 */
  spans: Span[];
  /** 命中说明，要具体到数量或位置 */
  detail: string;
  /** 怎么改，一句话 */
  hint: string;
}

export interface Rule {
  id: RuleId;
  label: string;
  weight: 1 | 2 | 3;
  detect(seg: Segmented): Finding | null;
}

export type Level = 'clean' | 'light' | 'obvious' | 'heavy';

export interface Report {
  /** 规范化后的全文。界面要拿它做高亮，span 下标才对得上 */
  text: string;
  score: number;
  level: Level;
  /** 按 severity 降序 */
  findings: Finding[];
  stats: {
    charCount: number;
    paraCount: number;
    /** 正文段长度的变异系数，段数不足时为 null */
    paraLenCv: number | null;
    emojiRate: number;
    numberPer100: number;
  };
}
