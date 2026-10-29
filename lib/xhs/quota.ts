/**
 * 按匿名访客 id 的额度。
 *
 * 为什么挂在 uuid 上而不是 IP：国内移动网络的 IP 会漂（运营商 NAT、4G 切换），
 * 按 IP 算额度会把同一个咖啡馆里的所有人并成一个人。uuid 会被清缓存冲掉，
 * 所以这道额度是**可以绕过的** —— 它防的是顺手多点几次，不是防刷。
 * 真正防刷的是 lib/ratelimit.ts 那套按 IP 的分层限流，两者叠加。
 *
 * 不做强制登录：登录是漏斗上的摩擦，现阶段唯一需要的是试用量。
 * 所以未登录也能用，只是次数少；登录是「想多用」的理由，不是门槛。
 */

import 'server-only';
import { getRedis, nsKey } from '@/lib/redis';

/** 未登录每天几次 */
export const ANON_DAILY = 3;
/** 登录后每天几次 */
export const USER_DAILY = 20;

const TTL = 60 * 60 * 36;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuotaState {
  limit: number;
  used: number;
  left: number;
  /** 这个额度是按登录用户算的还是按匿名 id 算的 */
  scope: 'user' | 'anon';
}

function key(tool: string, scope: string, id: string): string {
  return nsKey(`quota:${tool}:${today()}:${scope}:${id}`);
}

/**
 * 看一眼还剩几次，不消耗。
 *
 * Redis 不可用时一律放行（返回满额）：宁可被多用几次，也不要因为缓存挂了
 * 把工具整个锁死 —— 这个站现在要的是试用量。
 */
export async function peek(tool: string, vid: string, userId?: string): Promise<QuotaState> {
  const scope = userId ? 'user' : 'anon';
  const limit = userId ? USER_DAILY : ANON_DAILY;
  const id = userId || vid;
  const r = getRedis();
  if (!r || !id) return { limit, used: 0, left: limit, scope };

  try {
    const used = Number((await r.get<number | string>(key(tool, scope, id))) ?? 0);
    const n = Number.isFinite(used) ? used : 0;
    return { limit, used: n, left: Math.max(0, limit - n), scope };
  } catch (e) {
    console.error('[quota] 读额度失败:', (e as Error).message);
    return { limit, used: 0, left: limit, scope };
  }
}

export interface TakeResult extends QuotaState {
  ok: boolean;
}

/** 扣一次。额度不够返回 ok:false，并且不扣 */
export async function take(tool: string, vid: string, userId?: string): Promise<TakeResult> {
  const scope = userId ? 'user' : 'anon';
  const limit = userId ? USER_DAILY : ANON_DAILY;
  const id = userId || vid;
  const r = getRedis();
  if (!r || !id) return { ok: true, limit, used: 0, left: limit, scope };

  try {
    const k = key(tool, scope, id);
    const used = await r.incr(k);
    if (used === 1) await r.expire(k, TTL);
    if (used > limit) {
      // 超出的那一次要还回去，否则连续点会把计数推到很大，
      // 显示「今天已用 37 次」会让人以为被算错了
      await r.decrby(k, 1);
      return { ok: false, limit, used: limit, left: 0, scope };
    }
    return { ok: true, limit, used, left: Math.max(0, limit - used), scope };
  } catch (e) {
    console.error('[quota] 扣额度失败:', (e as Error).message);
    return { ok: true, limit, used: 0, left: limit, scope };
  }
}

/** 调用失败时把额度还回去 */
export async function refund(tool: string, vid: string, userId?: string): Promise<void> {
  const scope = userId ? 'user' : 'anon';
  const id = userId || vid;
  const r = getRedis();
  if (!r || !id) return;
  try {
    await r.decrby(key(tool, scope, id), 1);
  } catch {
    /* 额度第二天自动过期，还不回去也不影响 */
  }
}
