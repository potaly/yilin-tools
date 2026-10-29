/**
 * 匿名额度。
 *
 * 用的是 MemoryRedis（没配 Upstash 凭据时 getRedis 返回的那个），
 * 所以这里测的是真的 incr/expire/decrby 路径，不是 mock。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ANON_DAILY, USER_DAILY, peek, refund, take } from '@/lib/xhs/quota';

const TOOL = 'quota-test';
let seq = 0;
/** 每个用例换一个 id，免得互相串额度 */
const fresh = () => `vid-${TOOL}-${++seq}`;

beforeEach(() => {
  seq += 1000;
});

describe('未登录：每天 3 次', () => {
  it('默认额度是 3', () => {
    expect(ANON_DAILY).toBe(3);
  });

  it('扣到第 3 次还行，第 4 次拒绝', async () => {
    const vid = fresh();
    for (let i = 1; i <= ANON_DAILY; i++) {
      const r = await take(TOOL, vid);
      expect(r.ok, `第 ${i} 次应该放行`).toBe(true);
      expect(r.used).toBe(i);
      expect(r.left).toBe(ANON_DAILY - i);
    }

    const over = await take(TOOL, vid);
    expect(over.ok).toBe(false);
    expect(over.left).toBe(0);
  });

  it('超额之后连点，用量不会被推到大于上限 —— 显示「已用 37 次」会让人以为算错了', async () => {
    const vid = fresh();
    for (let i = 0; i < ANON_DAILY + 5; i++) await take(TOOL, vid);
    const state = await peek(TOOL, vid);
    expect(state.used).toBe(ANON_DAILY);
    expect(state.left).toBe(0);
  });

  it('peek 不消耗额度', async () => {
    const vid = fresh();
    await take(TOOL, vid);
    expect((await peek(TOOL, vid)).used).toBe(1);
    expect((await peek(TOOL, vid)).used).toBe(1);
  });

  it('调用失败退回来之后还能再用', async () => {
    const vid = fresh();
    for (let i = 0; i < ANON_DAILY; i++) await take(TOOL, vid);
    expect((await take(TOOL, vid)).ok).toBe(false);

    await refund(TOOL, vid);
    expect((await take(TOOL, vid)).ok).toBe(true);
  });

  it('两个不同的 vid 各自算额度', async () => {
    const a = fresh();
    const b = fresh();
    for (let i = 0; i < ANON_DAILY; i++) await take(TOOL, a);
    expect((await take(TOOL, a)).ok).toBe(false);
    expect((await take(TOOL, b)).ok).toBe(true);
  });
});

describe('登录：额度按 userId 算，和匿名额度分开', () => {
  it('登录后每天 20 次', () => {
    expect(USER_DAILY).toBe(20);
  });

  it('同一个人登录前后不共享计数（scope 不同）', async () => {
    const vid = fresh();
    const userId = fresh();
    for (let i = 0; i < ANON_DAILY; i++) await take(TOOL, vid);
    expect((await take(TOOL, vid)).ok).toBe(false);

    const asUser = await take(TOOL, vid, userId);
    expect(asUser.ok).toBe(true);
    expect(asUser.scope).toBe('user');
    expect(asUser.limit).toBe(USER_DAILY);
  });
});

describe('兜底', () => {
  it('没有 vid（隐私模式下 localStorage 抛错）时放行，不把工具锁死', async () => {
    const r = await take(TOOL, '');
    expect(r.ok).toBe(true);
    expect(r.left).toBe(ANON_DAILY);
  });
});
