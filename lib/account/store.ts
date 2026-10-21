/**
 * 账户、算力、用量的 Redis 数据层。
 *
 * 键一律带 yilin: 前缀（见 lib/redis.ts），和同实例上 activation-service 的 code:* 互不干扰。
 * Redis 不可用时所有读操作返回空值、写操作抛错，由调用方决定怎么降级。
 */

import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getRedis, nsKey } from '@/lib/redis';
import { entry, type LedgerEntry, type LedgerType, type Usage } from './credits';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';

/** 登录方式。以后再加别的（公众号网页授权、手机号）就往这里加 */
export type Provider = 'email' | 'wechat';

export interface User {
  id: string;
  /** 微信注册的账户没有邮箱，这里会是空串 */
  email: string;
  createdAt: string;
  lastLoginAt: string;
  loginCount: number;
  /** 这个账户绑过哪些登录方式 */
  providers?: Provider[];
  /** 微信的唯一标识，优先 unionid */
  wechatId?: string;
  nickname?: string;
  avatar?: string;
}

export interface Identity {
  provider: Provider;
  /** 邮箱登录是邮箱，微信登录是 unionid 或 openid */
  key: string;
  email?: string;
  nickname?: string;
  avatar?: string;
}

const K = {
  settings: () => nsKey('settings'),
  user: (id: string) => nsKey(`user:${id}`),
  byEmail: (email: string) => nsKey(`user:email:${email}`),
  byIdentity: (provider: string, key: string) => nsKey(`user:${provider}:${key}`),
  userIndex: () => nsKey('users'),
  balance: (id: string) => nsKey(`credits:${id}`),
  ledger: (id: string) => nsKey(`ledger:${id}`),
  session: (token: string) => nsKey(`session:${token}`),
  loginCode: (email: string) => nsKey(`logincode:${email}`),
  statsDay: (day: string) => nsKey(`stats:day:${day}`),
  statsUser: (id: string) => nsKey(`stats:user:${id}`),
};

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const CODE_TTL = 60 * 10; // 验证码 10 分钟
const LEDGER_KEEP = 200;

function redis() {
  const r = getRedis();
  if (!r) throw new Error('Redis 未配置');
  return r;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- 设置 ---------- */

export async function getSettings(): Promise<Settings> {
  const r = getRedis();
  if (!r) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(await r.get(K.settings()));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  await redis().set(K.settings(), next);
  return next;
}

/* ---------- 用户 ---------- */

export async function getUser(id: string): Promise<User | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<User>(K.user(id))) ?? null;
}

/**
 * 按登录身份找账户，没有就建一个并发赠送算力。
 * 邮箱和微信是两条独立的身份索引，同一个人用两种方式登录会是两个账户，
 * 以后要合并再做绑定流程。
 */
export async function findOrCreateUser(identity: Identity): Promise<{ user: User; isNew: boolean }> {
  const r = redis();
  const key = identity.provider === 'email' ? normalizeEmail(identity.key) : identity.key;
  const indexKey =
    identity.provider === 'email' ? K.byEmail(key) : K.byIdentity(identity.provider, key);

  const existingId = await r.get<string>(indexKey);
  if (existingId) {
    const user = await getUser(existingId);
    if (user) {
      const updated: User = {
        ...user,
        lastLoginAt: new Date().toISOString(),
        loginCount: (user.loginCount ?? 0) + 1,
        ...(identity.nickname ? { nickname: identity.nickname } : {}),
        ...(identity.avatar ? { avatar: identity.avatar } : {}),
      };
      await r.set(K.user(user.id), updated);
      return { user: updated, isNew: false };
    }
  }

  const now = new Date().toISOString();
  const user: User = {
    id: randomBytes(9).toString('base64url'),
    email: identity.provider === 'email' ? key : (identity.email ?? ''),
    createdAt: now,
    lastLoginAt: now,
    loginCount: 1,
    providers: [identity.provider],
    ...(identity.provider === 'wechat' ? { wechatId: key } : {}),
    ...(identity.nickname ? { nickname: identity.nickname } : {}),
    ...(identity.avatar ? { avatar: identity.avatar } : {}),
  };
  await r.set(K.user(user.id), user);
  await r.set(indexKey, user.id);
  await r.sadd(K.userIndex(), user.id);

  const settings = await getSettings();
  if (settings.signupGrant > 0) {
    await addCredits(user.id, settings.signupGrant, 'grant', '注册赠送');
  }
  return { user, isNew: true };
}

/** 登录流程里用来防 CSRF 的一次性 state */
export async function saveOauthState(state: string, next: string): Promise<void> {
  await redis().set(nsKey(`oauth:${state}`), next, { ex: 600 });
}

export async function takeOauthState(state: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  const key = nsKey(`oauth:${state}`);
  const next = await r.get<string>(key);
  if (next !== null && next !== undefined) await r.del(key);
  return next ?? null;
}

export async function listUsers(limit = 200): Promise<(User & { balance: number })[]> {
  const r = getRedis();
  if (!r) return [];
  const ids = (await r.smembers(K.userIndex())) ?? [];
  const slice = ids.slice(0, limit);
  const rows = await Promise.all(
    slice.map(async (id) => {
      const [user, balance] = await Promise.all([getUser(id), getBalance(id)]);
      return user ? { ...user, balance } : null;
    }),
  );
  return rows
    .filter((x): x is User & { balance: number } => Boolean(x))
    .sort((a, b) => b.lastLoginAt.localeCompare(a.lastLoginAt));
}

/* ---------- 算力 ---------- */

export async function getBalance(id: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  const n = Number(await r.get(K.balance(id)));
  return Number.isFinite(n) ? n : 0;
}

async function pushLedger(id: string, e: LedgerEntry) {
  const r = redis();
  await r.lpush(K.ledger(id), JSON.stringify(e));
  await r.ltrim(K.ledger(id), 0, LEDGER_KEEP - 1);
}

export async function getLedger(id: string, limit = 50): Promise<LedgerEntry[]> {
  const r = getRedis();
  if (!r) return [];
  const rows = (await r.lrange<string | LedgerEntry>(K.ledger(id), 0, limit - 1)) ?? [];
  return rows.map((x) => (typeof x === 'string' ? (JSON.parse(x) as LedgerEntry) : x));
}

/** 加算力（赠送 / 充值 / 人工调整），返回新余额 */
export async function addCredits(
  id: string,
  amount: number,
  type: LedgerType,
  note?: string,
): Promise<number> {
  const balance = await redis().incrby(K.balance(id), Math.round(amount));
  await pushLedger(id, entry(type, Math.round(amount), balance, note));
  return balance;
}

/** 扣算力。余额不足返回 null 且不扣 */
export async function takeCredits(
  id: string,
  amount: number,
  note?: string,
): Promise<number | null> {
  if (amount <= 0) return getBalance(id);
  const r = redis();
  const after = await r.decrby(K.balance(id), Math.round(amount));
  if (after < 0) {
    await r.incrby(K.balance(id), Math.round(amount)); // 扣穿了就还回去
    return null;
  }
  await pushLedger(id, entry('spend', -Math.round(amount), after, note));
  return after;
}

/* ---------- 用量统计 ---------- */

export interface UsageRecord extends Usage {
  chunks: number;
  chars: number;
  costCny: number;
  credits: number;
}

export async function recordUsage(userId: string | null, u: UsageRecord): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const fields: [string, number][] = [
    ['calls', 1],
    ['chunks', u.chunks],
    ['chars', u.chars],
    ['promptTokens', u.promptTokens],
    ['completionTokens', u.completionTokens],
    ['costFen', Math.round(u.costCny * 100)],
    ['credits', u.credits],
  ];
  try {
    await Promise.all([
      ...fields.map(([f, v]) => r.hincrby(K.statsDay(today()), f, v)),
      ...(userId ? fields.map(([f, v]) => r.hincrby(K.statsUser(userId), f, v)) : []),
    ]);
    await r.expire(K.statsDay(today()), 60 * 60 * 24 * 400);
  } catch (e) {
    console.error('[stats] 写用量失败:', (e as Error).message);
  }
}

export interface StatsRow {
  calls: number;
  chunks: number;
  chars: number;
  promptTokens: number;
  completionTokens: number;
  costFen: number;
  credits: number;
}

const EMPTY_STATS: StatsRow = {
  calls: 0, chunks: 0, chars: 0, promptTokens: 0, completionTokens: 0, costFen: 0, credits: 0,
};

function toStats(raw: Record<string, unknown> | null): StatsRow {
  const out = { ...EMPTY_STATS };
  for (const k of Object.keys(EMPTY_STATS) as (keyof StatsRow)[]) {
    const n = Number(raw?.[k]);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export async function getDailyStats(days = 14): Promise<{ day: string; stats: StatsRow }[]> {
  const r = getRedis();
  if (!r) return [];
  const list: { day: string; stats: StatsRow }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    list.push({ day: d, stats: toStats(await r.hgetall(K.statsDay(d))) });
  }
  return list;
}

export async function getUserStats(id: string): Promise<StatsRow> {
  const r = getRedis();
  if (!r) return EMPTY_STATS;
  return toStats(await r.hgetall(K.statsUser(id)));
}

/* ---------- 登录验证码与会话 ---------- */

export async function issueLoginCode(rawEmail: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
  await redis().set(K.loginCode(email), code, { ex: CODE_TTL });
  return code;
}

export async function verifyLoginCode(rawEmail: string, input: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  const r = redis();
  const saved = await r.get<string | number>(K.loginCode(email));
  if (saved === null || saved === undefined) return false;
  const a = Buffer.from(String(saved).padEnd(6, ' '));
  const b = Buffer.from(String(input).trim().padEnd(6, ' '));
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) await r.del(K.loginCode(email)); // 一次性
  return ok;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await redis().set(K.session(token), userId, { ex: SESSION_TTL });
  return token;
}

export async function resolveSession(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const r = getRedis();
  if (!r) return null;
  try {
    const id = await r.get<string>(K.session(token));
    return id ? getUser(id) : null;
  } catch {
    return null;
  }
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(K.session(token));
  } catch {
    /* 退出登录失败不影响前端清 cookie */
  }
}
