/** 长文分块与结果合并 */

import { splitLongParagraph } from '@/lib/cards/clean';
import type { FormatResult } from '@/lib/cards/parse';
import { autoDensity } from '@/lib/cards/spec';

export const CHUNK_LIMIT = 3000;

/** 按原有段落边界切成约 limit 字的块；单段超长时退而在句末拆 */
export function chunkByParagraph(text: string, limit = CHUNK_LIMIT): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];

  const pieces: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= limit) pieces.push(p);
    else pieces.push(...splitLongParagraph(p, limit));
  }

  const chunks: string[] = [];
  let buf = '';
  for (const piece of pieces) {
    if (buf && buf.length + piece.length + 1 > limit) {
      chunks.push(buf);
      buf = piece;
    } else {
      buf = buf ? `${buf}\n${piece}` : piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/** 预估会发出多少次上游调用，用于按成本扣限流额度 */
export function estimateChunks(textLength: number, limit = CHUNK_LIMIT): number {
  return Math.max(1, Math.ceil(textLength / limit));
}

/** 合并各块结果：只保留第一块的大标题，密度按合并后的总字数重算 */
export function mergeResults(parts: FormatResult[]): FormatResult {
  const blocks = parts.flatMap((p) => p.blocks);
  const words = blocks.reduce((n, b) => n + b.text.replace(/\*\*/g, '').replace(/\s/g, '').length, 0);
  const title = parts.find((p) => p.title)?.title ?? '';
  const notes = parts.find((p) => p.notes)?.notes;
  return { title, blocks, density: autoDensity(words), notes };
}
