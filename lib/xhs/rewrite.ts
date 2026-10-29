/**
 * 改写结果的结构校验与闸门。
 *
 * 闸门（gate）是这套设计的最后一环：模型改完之后，**再跑一遍同一个扫描器**。
 * 还剩硬违规词就不算通过 —— 判断权始终在代码这边，不在模型那边。
 */

import { hardHits } from './scan';
import { measure } from './units';

export interface Change {
  from: string;
  to: string;
  why: string;
}

export interface Rewrite {
  title: string;
  body: string;
  changes: Change[];
  note: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 校验并规整模型返回的 JSON；结构不合法返回 null，由上层重试 */
export function validateRewrite(json: unknown): Rewrite | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;

  const body = str(raw.body).trim();
  if (!body) return null;

  const changes: Change[] = [];
  if (Array.isArray(raw.changes)) {
    for (const item of raw.changes.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Record<string, unknown>;
      const from = str(c.from).trim();
      const to = str(c.to).trim();
      if (!from) continue;
      changes.push({ from, to, why: str(c.why).trim() });
    }
  }

  return { title: str(raw.title).trim(), body, changes, note: str(raw.note).trim() };
}

export interface GateResult {
  ok: boolean;
  /** 输出里仍然残留的硬违规词 */
  leftover: string[];
  /** 改写之后仍然超限的项 */
  stillOver: string[];
}

/**
 * 闸门：改写结果必须自己也过一遍词表和额度。
 *
 * 只拦 hard 和超限两类。soft 词（绝对化、功效宣称）留在结果里不算失败 ——
 * 那些是「建议改」，用户自己决定；界面会照样标出来。
 */
export function gate(rewrite: Rewrite): GateResult {
  const joined = rewrite.title ? `${rewrite.title}\n${rewrite.body}` : rewrite.body;
  const leftover = [...new Set(hardHits(joined))];
  const limits = measure(rewrite.title, rewrite.body);

  const stillOver: string[] = [];
  if (limits.titleOver > 0) stillOver.push(`标题超 ${limits.titleOver} 单位`);
  if (limits.bodyOver > 0) stillOver.push(`正文超 ${limits.bodyOver} 字符`);

  return { ok: leftover.length === 0 && stillOver.length === 0, leftover, stillOver };
}

/** 只保留 from 真的出现在原文里的 changes，模型偶尔会把改写后的句子写进 from */
export function verifiedChanges(original: string, changes: Change[]): Change[] {
  return changes.filter((c) => original.includes(c.from));
}
