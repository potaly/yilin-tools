/**
 * 算力的计费口径。纯计算，不碰 Redis，方便单测。
 *
 * 对用户只说「算力」，不出现 token 字样。
 */

import type { Settings } from './settings';

/** DeepSeek 单价（美元 / 百万 token），按高峰价算，宁可高估不低估 */
export const PRICE_USD_PER_M = {
  cachedInput: 0.006,
  input: 0.3,
  output: 1.2,
} as const;

export const USD_TO_CNY = 7.1;

export interface Usage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

/** 这次调用真实花了多少钱（人民币），用于后台算账 */
export function costCny(usage: Usage): number {
  const cached = Math.max(0, Math.min(usage.cachedTokens, usage.promptTokens));
  const fresh = Math.max(0, usage.promptTokens - cached);
  const usd =
    (cached * PRICE_USD_PER_M.cachedInput +
      fresh * PRICE_USD_PER_M.input +
      Math.max(0, usage.completionTokens) * PRICE_USD_PER_M.output) /
    1_000_000;
  return usd * USD_TO_CNY;
}

/** 加价后的建议售价，后台用来回答「现在的算力卖得贵了还是便宜了」 */
export function pricedCny(usage: Usage, settings: Settings): number {
  return costCny(usage) * settings.markupRate;
}

/** 这次排版要扣多少算力：按分块数算，长文更贵 */
export function creditsFor(chunks: number, settings: Settings): number {
  return Math.max(1, Math.ceil(chunks)) * settings.costPerChunk;
}

export type SpendResult =
  | { ok: true; balance: number; spent: number }
  | { ok: false; balance: number; needed: number };

/** 扣费。余额不足就整笔拒绝，不允许扣成负数 */
export function spend(balance: number, amount: number): SpendResult {
  if (amount <= 0) return { ok: true, balance, spent: 0 };
  if (balance < amount) return { ok: false, balance, needed: amount - balance };
  return { ok: true, balance: balance - amount, spent: amount };
}

export type LedgerType = 'grant' | 'spend' | 'topup' | 'adjust' | 'refund';

export interface LedgerEntry {
  at: string;
  type: LedgerType;
  /** 正数是进账，负数是支出 */
  amount: number;
  balance: number;
  note?: string;
}

export function entry(type: LedgerType, amount: number, balance: number, note?: string): LedgerEntry {
  return { at: new Date().toISOString(), type, amount, balance, ...(note ? { note } : {}) };
}

/** 展示给用户看的说法，不出现 token */
export function describeBalance(balance: number, settings: Settings): string {
  const times = Math.floor(balance / Math.max(1, settings.costPerChunk));
  return `剩余算力 ${balance}，大约还能排版 ${times} 次`;
}
