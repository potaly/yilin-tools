/**
 * 后台可调的运营参数。
 *
 * 全部存在 Redis 里，改完立即生效、不用重新部署——这是「以后 DeepSeek 涨价降价
 * 我好跟着调」的前提。读不到就用这里的默认值。
 */

export interface Settings {
  /** 新账户注册时赠送多少算力 */
  signupGrant: number;
  /** 一次 AI 排版扣多少算力（长文按分块数成倍扣） */
  costPerChunk: number;
  /** 成本加价率，1.3 表示在 AI 成本上加 30%。目前只用于后台算账，不直接计费 */
  markupRate: number;
  /** 充值档位（元） */
  topupTiers: number[];
  /** 是否开启计费。关掉时照常记用量，但不扣算力、不拦截 */
  billingEnabled: boolean;
  /** 管理员邮箱，逗号分隔也可 */
  adminEmails: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  signupGrant: 20,
  costPerChunk: 1,
  markupRate: 1.3,
  topupTiers: [10, 20, 30, 50, 100],
  billingEnabled: false,
  adminEmails: [],
};

/** 把外部来的（Redis / 表单）数据收敛成合法设置，坏值一律回退默认 */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    signupGrant: intIn(r.signupGrant, DEFAULT_SETTINGS.signupGrant, 0, 100_000),
    costPerChunk: intIn(r.costPerChunk, DEFAULT_SETTINGS.costPerChunk, 0, 1000),
    markupRate: floatIn(r.markupRate, DEFAULT_SETTINGS.markupRate, 1, 100),
    topupTiers: tiers(r.topupTiers),
    billingEnabled: typeof r.billingEnabled === 'boolean' ? r.billingEnabled : DEFAULT_SETTINGS.billingEnabled,
    adminEmails: emails(r.adminEmails),
  };
}

function intIn(v: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function floatIn(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Number(n.toFixed(4)) : fallback;
}

function tiers(v: unknown): number[] {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[,，\s]+/);
  const out = [...new Set(list.map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n > 0 && n <= 100_000))];
  out.sort((a, b) => a - b);
  return out.length ? out : DEFAULT_SETTINGS.topupTiers;
}

function emails(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[,，;；\s]+/);
  return [...new Set(list.map((x) => String(x).trim().toLowerCase()).filter((x) => x.includes('@')))];
}

export function isAdmin(settings: Settings, email: string | undefined): boolean {
  if (!email) return false;
  return settings.adminEmails.includes(email.trim().toLowerCase());
}
