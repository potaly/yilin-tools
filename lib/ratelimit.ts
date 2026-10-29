/**
 * AI 排版接口的分层防刷。
 *
 * 顺序：并发锁 → 突发(2/10s) → 小时(20，按分块数扣) → 单日(50) → 全站日预算。
 * 任一层不过就立即返回，后面的层不再发 Redis 命令；限流器带内存缓存，
 * 被判定超限的 IP 在同一实例内直接拒绝，遭到洪水请求时几乎不消耗 Redis。
 */

import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis, getUpstashRedis, nsKey } from '@/lib/redis';

export interface GuardFail {
  ok: false;
  status: 429 | 503;
  error: string;
  retryAfter: number;
}

export type GuardResult = { ok: true } | GuardFail;

const LOCK_TTL = 70;

function parseWindow(spec: string, fallbackLimit: number, fallbackSeconds: number) {
  const m = spec.match(/^(\d+)\s*\/\s*(\d+)\s*([smhd])$/);
  if (!m) return { limit: fallbackLimit, seconds: fallbackSeconds };
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[3]] ?? 1;
  return { limit: Number(m[1]), seconds: Number(m[2]) * unit };
}

function num(env: string | undefined, fallback: number) {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 取客户端 IP；IPv6 归并到 /64，避免在自己网段内换地址绕过 */
export function identify(headers: Headers, fallbackIp?: string | null): string {
  const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = (fallbackIp || xff || headers.get('x-real-ip') || '').trim();
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::/64';
  }
  return ip;
}

/** 没有 Redis 时的进程内降级计数（单实例内有效，尽力而为） */
const memory = new Map<string, number[]>();

function memoryAllow(key: string, limit: number, seconds: number, cost: number): number {
  const now = Date.now();
  const from = now - seconds * 1000;
  const hits = (memory.get(key) ?? []).filter((t) => t > from);
  if (hits.length + cost > limit) {
    memory.set(key, hits);
    return Math.max(1, Math.ceil((hits[0] + seconds * 1000 - now) / 1000));
  }
  for (let i = 0; i < cost; i++) hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) memory.clear();
  return 0;
}

const ephemeralCache = new Map<string, number>();
const limiters = new Map<string, Ratelimit>();

function limiter(name: string, limit: number, seconds: number): Ratelimit | null {
  const redis = getUpstashRedis();
  if (!redis) return null;
  const key = `${name}:${limit}:${seconds}`;
  let found = limiters.get(key);
  if (!found) {
    found = new Ratelimit({
      redis,
      prefix: nsKey(`rl:${name}`),
      limiter: Ratelimit.slidingWindow(limit, `${seconds} s` as `${number} s`),
      analytics: false,
      ephemeralCache,
    });
    limiters.set(key, found);
  }
  return found;
}

async function check(
  name: string,
  id: string,
  limit: number,
  seconds: number,
  cost: number,
  error: string,
): Promise<GuardFail | null> {
  const rl = limiter(name, limit, seconds);
  if (!rl) {
    const retryAfter = memoryAllow(`${name}:${id}`, limit, seconds, cost);
    return retryAfter ? { ok: false, status: 429, error, retryAfter } : null;
  }
  try {
    const res = await rl.limit(id, { rate: cost });
    if (res.success) return null;
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    return { ok: false, status: 429, error, retryAfter };
  } catch (e) {
    console.error(`[ratelimit] ${name} 检查失败:`, (e as Error).message);
    return null; // Redis 故障时不拦截正常用户
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 全站当日 AI 调用预算。每个工具一个独立的计数键，但共用同一个上限环境变量 ——
 * 上限防的是账单，按工具分开防不住。
 *
 * @param name 工具名，只用来分键，方便在后台看哪个工具吃掉了预算
 */
export async function checkDailyBudget(
  name: string,
  cost: number,
  error: string,
): Promise<GuardFail | null> {
  const redis = getRedis();
  const cap = num(process.env.AI_DAILY_BUDGET, 2000);
  if (!redis) return null;
  try {
    const key = nsKey(`budget:${name}:${today()}`);
    const used = await redis.incrby(key, cost);
    if (used === cost) await redis.expire(key, 172800);
    if (used > cap) {
      return { ok: false, status: 503, error, retryAfter: 3600 };
    }
  } catch (e) {
    console.error('[ratelimit] 预算检查失败:', (e as Error).message);
  }
  return null;
}

function checkBudget(cost: number): Promise<GuardFail | null> {
  return checkDailyBudget('ai-format', cost, '今天的 AI 排版额度已用完，请明天再试');
}

async function acquireLock(id: string): Promise<GuardFail | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const got = await redis.set(nsKey(`lock:ai-format:${id}`), '1', { nx: true, ex: LOCK_TTL });
    if (got) return null;
    return { ok: false, status: 429, error: '上一次排版还没结束，请等它完成', retryAfter: 10 };
  } catch (e) {
    console.error('[ratelimit] 加锁失败:', (e as Error).message);
    return null;
  }
}

export async function release(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(nsKey(`lock:ai-format:${id}`));
  } catch {
    /* 锁有 70 秒过期兜底，删不掉也不影响 */
  }
}

/**
 * 单层滑动窗口限流，给 AI 排版之外的轻量接口用（埋点）。
 * 不加锁、不记预算，超限就返回 false 让调用方静默丢弃。
 */
export async function allow(
  name: string,
  id: string,
  max: number,
  seconds: number,
): Promise<boolean> {
  return (await check(name, id, max, seconds, 1, '')) === null;
}

/** 逐层检查；返回 ok 时调用方必须在结束后调用 release(id) */
export async function guard(id: string, cost: number): Promise<GuardResult> {
  const burst = parseWindow(process.env.RATE_LIMIT_BURST || '', 2, 10);

  const locked = await acquireLock(id);
  if (locked) return locked;

  const steps = [
    () => check('burst', id, burst.limit, burst.seconds, 1, '操作太快了，请过几秒再试'),
    () =>
      check(
        'hour',
        id,
        num(process.env.RATE_LIMIT_PER_HOUR, 20),
        3600,
        cost,
        '排版次数达到上限，请一小时后再试',
      ),
    () =>
      check(
        'day',
        id,
        num(process.env.RATE_LIMIT_PER_DAY, 50),
        86400,
        cost,
        '今天的排版次数用完了，明天再来',
      ),
    () => checkBudget(cost),
  ];

  for (const step of steps) {
    const failed = await step();
    if (failed) {
      await release(id);
      return failed;
    }
  }
  return { ok: true };
}
