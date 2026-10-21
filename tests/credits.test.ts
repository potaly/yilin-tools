import { describe, expect, it } from 'vitest';
import {
  costCny,
  creditsFor,
  describeBalance,
  entry,
  pricedCny,
  spend,
  type Usage,
} from '@/lib/account/credits';
import { DEFAULT_SETTINGS, isAdmin, normalizeSettings } from '@/lib/account/settings';

// 实测过的一次短文排版用量
const real: Usage = { promptTokens: 2675, cachedTokens: 2432, completionTokens: 463 };

describe('成本计算', () => {
  it('一次短文排版不到一分钱', () => {
    const c = costCny(real);
    expect(c).toBeGreaterThan(0.003);
    expect(c).toBeLessThan(0.008);
  });

  it('缓存命中比未命中便宜得多', () => {
    const allCached = costCny({ promptTokens: 2675, cachedTokens: 2675, completionTokens: 0 });
    const noneCached = costCny({ promptTokens: 2675, cachedTokens: 0, completionTokens: 0 });
    expect(noneCached).toBeGreaterThan(allCached * 10);
  });

  it('缓存数大于总数时不会算出负的新增 token', () => {
    expect(costCny({ promptTokens: 100, cachedTokens: 999, completionTokens: 0 })).toBeGreaterThan(0);
  });

  it('加价率生效', () => {
    expect(pricedCny(real, { ...DEFAULT_SETTINGS, markupRate: 2 })).toBeCloseTo(costCny(real) * 2, 10);
  });
});

describe('扣费', () => {
  it('按分块数扣，长文更贵', () => {
    expect(creditsFor(1, DEFAULT_SETTINGS)).toBe(1);
    expect(creditsFor(4, DEFAULT_SETTINGS)).toBe(4);
  });

  it('块数再小也至少扣一次', () => {
    expect(creditsFor(0, DEFAULT_SETTINGS)).toBe(1);
  });

  it('余额够就扣掉', () => {
    expect(spend(20, 3)).toEqual({ ok: true, balance: 17, spent: 3 });
  });

  it('余额不足整笔拒绝，不扣成负数', () => {
    const r = spend(2, 5);
    expect(r).toEqual({ ok: false, balance: 2, needed: 3 });
  });

  it('刚好够也能扣', () => {
    expect(spend(5, 5)).toEqual({ ok: true, balance: 0, spent: 5 });
  });

  it('流水记录带时间和余额', () => {
    const e = entry('grant', 20, 20, '注册赠送');
    expect(e.type).toBe('grant');
    expect(e.balance).toBe(20);
    expect(Date.parse(e.at)).not.toBeNaN();
  });
});

describe('给用户看的文案', () => {
  it('只说算力和次数，不出现 token', () => {
    const text = describeBalance(17, DEFAULT_SETTINGS);
    expect(text).toContain('算力');
    expect(text).toContain('17');
    expect(text.toLowerCase()).not.toContain('token');
  });
});

describe('设置', () => {
  it('默认赠送 20 次', () => {
    expect(DEFAULT_SETTINGS.signupGrant).toBe(20);
  });

  it('坏值一律回退默认', () => {
    const s = normalizeSettings({ signupGrant: -5, costPerChunk: 'abc', markupRate: 0.1 });
    expect(s.signupGrant).toBe(20);
    expect(s.costPerChunk).toBe(1);
    expect(s.markupRate).toBe(1.3);
  });

  it('档位能从字符串解析，去重并排序', () => {
    expect(normalizeSettings({ topupTiers: '30, 10，10 50' }).topupTiers).toEqual([10, 30, 50]);
  });

  it('档位全是坏值时回退默认', () => {
    expect(normalizeSettings({ topupTiers: 'abc' }).topupTiers).toEqual([10, 20, 30, 50, 100]);
  });

  it('加价率可调，用于以后跟着 DeepSeek 调价', () => {
    expect(normalizeSettings({ markupRate: 1.5 }).markupRate).toBe(1.5);
  });

  it('管理员判断不区分大小写和空格', () => {
    const s = normalizeSettings({ adminEmails: ' A@b.com , c@d.com ' });
    expect(isAdmin(s, 'a@B.com')).toBe(true);
    expect(isAdmin(s, 'x@y.com')).toBe(false);
    expect(isAdmin(s, undefined)).toBe(false);
  });
});
