/** 编辑器文本 ⇄ 结构化 blocks */

import type { BlockKind } from './spec';

export interface Block {
  type: BlockKind;
  text: string;
}

/**
 * `# ` 大标题、`## ` 小标题、其余每一行是一段，空行忽略。
 *
 * 井号后面必须跟空格才算标题（和标准 Markdown 一致）。
 * 这样小红书的话题标签「#养生赛道 #大健康」才不会被当成大标题。
 */
/**
 * 井号后面允许任何横向空白（普通空格、制表符、不换行空格、全角空格）。
 * 正文部分用 [\s\S] 而不是 `.`——`.` 匹配不到 U+2028 / U+2029，
 * 行里夹一个就整条匹配失败，标题会退化成带 # 的正文。
 */
const HEADING = /^(#{1,2})[^\S\n]+(\S[\s\S]*)$/;
const LINE_BREAK = /\r\n?|[\n\u2028\u2029\u0085]/;

export function parse(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.split(LINE_BREAK)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(HEADING);
    if (m) blocks.push({ type: m[1].length === 1 ? 'title' : 'h2', text: m[2].trim() });
    else if (!/^#{1,2}$/.test(line)) blocks.push({ type: 'p', text: line });
  }
  return blocks;
}

/** 去掉加粗标记，拿到纯文字 */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '');
}

/** 全文字数：去掉所有空白后的字符数 */
export function wordCount(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + plain(b.text).replace(/\s/g, '').length, 0);
}

const ILLEGAL_FILENAME = /[\\/:*?"<>|\s！!，,。.、；;：]/g;

/** 用首个标题生成文件名前缀 */
export function makeSlug(blocks: Block[]): string {
  const t = blocks.find((b) => b.type === 'title') ?? blocks[0];
  const s = t ? plain(t.text).replace(ILLEGAL_FILENAME, '').slice(0, 16) : '';
  return s || '长文图卡';
}

export interface FormatBlock {
  type: 'h2' | 'p';
  text: string;
}

export interface FormatResult {
  title: string;
  blocks: FormatBlock[];
  density: string;
  notes?: string;
  warning?: string;
}

/** AI 返回的结构 → 编辑器语法 */
export function toEditorText(result: Pick<FormatResult, 'title' | 'blocks'>): string {
  const lines: string[] = [];
  if (result.title.trim()) lines.push(`# ${result.title.trim()}`, '');
  for (const b of result.blocks) {
    const text = b.text.trim();
    if (!text) continue;
    lines.push(b.type === 'h2' ? `## ${text}` : text, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
