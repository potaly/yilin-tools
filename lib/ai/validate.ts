/**
 * 校验 AI 的输出：结构是否合法、正文是否被改写。
 */

import type { FormatBlock, FormatResult } from '@/lib/cards/parse';
import { isDensity } from '@/lib/cards/spec';

const PUNCT =
  /[\s -⁯　-〿！-／：-＠［-｀｛-･!-/:-@[-`{-~、。「」『』【】（）《》—…·]/g;

/** 去掉空白、标点与加粗标记，只留下可比对的字符 */
export function normalize(text: string): string {
  return text.replace(/\*\*/g, '').replace(PUNCT, '');
}

function lcsLength(a: string, b: string): number {
  const n = b.length;
  let prev = new Int32Array(n + 1);
  let cur = new Int32Array(n + 1);
  for (let i = 1; i <= a.length; i++) {
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      cur[j] = ai === b.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const t = prev;
    prev = cur;
    cur = t;
    cur.fill(0);
  }
  return prev[n];
}

function frequencyCoverage(a: string, b: string): number {
  const count = new Map<string, number>();
  for (const ch of b) count.set(ch, (count.get(ch) ?? 0) + 1);
  let hit = 0;
  for (const ch of a) {
    const left = count.get(ch) ?? 0;
    if (left > 0) {
      count.set(ch, left - 1);
      hit++;
    }
  }
  return hit / a.length;
}

/**
 * 原文字符在输出中的覆盖率，0–1。
 * 短文用最长公共子序列（顺序敏感，更准）；长文用字符频次近似（避免 O(n²) 爆炸）。
 */
export function coverage(original: string, output: string): number {
  const a = normalize(original);
  const b = normalize(output);
  if (!a.length) return 1;
  if (!b.length) return 0;
  if (a.length <= 2000 && b.length <= 2000) return lcsLength(a, b) / a.length;
  return frequencyCoverage(a, b);
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 校验并规整 AI 返回的 JSON；结构不合法返回 null，由上层重试 */
export function validateShape(json: unknown): FormatResult | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  if (!Array.isArray(raw.blocks)) return null;

  const blocks: FormatBlock[] = [];
  for (const item of raw.blocks) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const text = asString(b.text).trim();
    if (!text) continue;
    blocks.push({ type: b.type === 'h2' ? 'h2' : 'p', text });
  }
  if (!blocks.length) return null;

  return {
    title: asString(raw.title).trim(),
    blocks,
    density: isDensity(raw.density) ? raw.density : 'standard',
    notes: asString(raw.notes).trim() || undefined,
  };
}
