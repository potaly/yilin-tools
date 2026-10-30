import { describe, expect, it } from 'vitest';
import { ZERO_USAGE, addUsage, costCny, costMicro } from '@/lib/account/credits';
import { costYuan, sumToolDays } from '@/lib/account/store';

/** 一次典型改写：输入 1500、输出 800，约 ¥0.0100 */
const ONE = { promptTokens: 1500, cachedTokens: 0, completionTokens: 800 };

describe('成本精度', () => {
  it('按分取整会把一次调用压没，微元不会', () => {
    const cny = costCny(ONE);
    expect(cny).toBeGreaterThan(0.009);
    expect(cny).toBeLessThan(0.011);

    // 旧口径：误差接近一倍
    expect(Math.round(cny * 100)).toBe(1);
    // 新口径：还原回元，误差在 1e-6 以内
    expect(Math.abs(costMicro(ONE) / 1_000_000 - cny)).toBeLessThan(1e-6);
  });

  it('便宜的调用在分口径下直接记成 0', () => {
    const cheap = { promptTokens: 200, cachedTokens: 0, completionTokens: 100 };
    expect(Math.round(costCny(cheap) * 100)).toBe(0);
    expect(costMicro(cheap)).toBeGreaterThan(0);
  });

  /**
   * 1500/800 那档恰好四舍五入得准，不足以说明问题。真正失真的是另外两档：
   * 便宜的被抹成 0（整笔漏记），中间档被抬到 1 分（接近翻倍）。
   */
  it('按分取整在一千次之后会差出几块钱，两个方向都错', () => {
    const cheap = { promptTokens: 200, cachedTokens: 0, completionTokens: 100 };
    const mid = { promptTokens: 800, cachedTokens: 0, completionTokens: 400 };

    const drift = (u: typeof cheap) =>
      (Math.round(costCny(u) * 100) / 100) * 1000 - costCny(u) * 1000;

    expect(drift(cheap)).toBeLessThan(-1); // 少记一块多
    expect(drift(mid)).toBeGreaterThan(4); // 多记四块多

    // 微元口径两档都对得上
    for (const u of [cheap, mid]) {
      expect(Math.abs((costMicro(u) / 1_000_000) * 1000 - costCny(u) * 1000)).toBeLessThan(0.001);
    }
  });
});

describe('多次上游调用的累计', () => {
  it('重试的 token 要加进来，不能只算最后一次', () => {
    const spent = addUsage(addUsage(ZERO_USAGE, ONE), ONE);
    expect(spent.promptTokens).toBe(3000);
    expect(spent.completionTokens).toBe(1600);
    expect(costCny(spent)).toBeCloseTo(costCny(ONE) * 2, 10);
  });

  it('ZERO_USAGE 不会被累加改写', () => {
    addUsage(ZERO_USAGE, ONE);
    expect(ZERO_USAGE).toEqual({ promptTokens: 0, cachedTokens: 0, completionTokens: 0 });
  });
});

describe('分工具汇总', () => {
  it('跨天累加同一个工具，按成本倒序', () => {
    const rows = sumToolDays([
      { 'humanize|calls': 2, 'humanize|costMicro': 20000, 'xhs-copy|calls': 1, 'xhs-copy|costMicro': 5000 },
      { 'humanize|calls': 3, 'humanize|costMicro': 30000 },
    ]);
    expect(rows.map((r) => r.tool)).toEqual(['humanize', 'xhs-copy']);
    expect(rows[0].stats.calls).toBe(5);
    expect(rows[0].stats.costMicro).toBe(50000);
    expect(costYuan(rows[0].stats)).toBeCloseTo(0.05, 10);
  });

  it('成功数 = 调用数 - 失败数', () => {
    const [row] = sumToolDays([{ 'humanize|calls': 10, 'humanize|fails': 3 }]);
    expect(row.stats.calls - row.stats.fails).toBe(7);
  });

  it('认不出的指标名直接丢掉，不污染行', () => {
    const [row] = sumToolDays([{ 'humanize|calls': 1, 'humanize|text': 'xxx', 'humanize|bogus': 9 }]);
    expect(row.stats.calls).toBe(1);
    expect(Object.values(row.stats).filter((n) => n !== 0)).toEqual([1]);
  });

  it('老数据只有 costFen 时，按分算而不是显示 0', () => {
    const [row] = sumToolDays([{ 'longform-cards|costFen': 25 }]);
    expect(costYuan(row.stats)).toBeCloseTo(0.25, 10);
  });
});

/**
 * 停写 costFen 之前的调用只有分，之后的只有微元。跨越改动日的那一天、
 * 以及终身累加的 stats:user:*，一行里会同时有两段，必须相加。
 */
describe('新旧口径混在同一行', () => {
  it('两段金额相加，不是二选一', () => {
    const [row] = sumToolDays([{
      'humanize|calls': 10,
      'humanize|costFen': 30,      // 改动前记的 ¥0.30
      'humanize|costMicro': 50000, // 改动后记的 ¥0.05
    }]);
    expect(costYuan(row.stats)).toBeCloseTo(0.35, 10);
  });

  it('有微元就丢掉历史金额是错的（旧实现会少算 ¥0.30）', () => {
    const [row] = sumToolDays([{ 'humanize|costFen': 30, 'humanize|costMicro': 50000 }]);
    const onlyMicro = row.stats.costMicro / 1_000_000;
    expect(costYuan(row.stats)).toBeGreaterThan(onlyMicro);
    expect(costYuan(row.stats) - onlyMicro).toBeCloseTo(0.3, 10);
  });

  it('跨天汇总时两段各自累加', () => {
    const rows = sumToolDays([
      { 'humanize|costFen': 12 },                            // 改动前那天
      { 'humanize|costFen': 8, 'humanize|costMicro': 20000 }, // 跨越改动的那天
      { 'humanize|costMicro': 30000 },                       // 改动后那天
    ]);
    // (12 + 8) 分 + (20000 + 30000) 微元 = 0.20 + 0.05
    expect(rows[0].stats.costFen).toBe(20);
    expect(rows[0].stats.costMicro).toBe(50000);
    expect(costYuan(rows[0].stats)).toBeCloseTo(0.25, 10);
  });

  it('排序看总额，历史金额大的排在前面', () => {
    const rows = sumToolDays([{
      'longform-cards|costFen': 80,   // ¥0.80，全是历史
      'humanize|costMicro': 100000,   // ¥0.10，全是新的
    }]);
    expect(rows.map((r) => r.tool)).toEqual(['longform-cards', 'humanize']);
  });

  it('两段都为空时是 0，不是 NaN', () => {
    const [row] = sumToolDays([{ 'humanize|calls': 3 }]);
    expect(costYuan(row.stats)).toBe(0);
  });
});

/**
 * chunks 和 requests 是两个不同的量，混在一个字段里会让历史数据再也读不出来：
 * 2026-10-30 之前 chunks 累加的是内容分块数，之后如果改成请求数，
 * 同一个 hash 字段里两种含义会被加到一起。
 */
describe('分块数与上游请求数分开记', () => {
  it('是两个独立字段，各自累加', () => {
    const [row] = sumToolDays([
      { 'longform-cards|chunks': 4, 'longform-cards|requests': 5 },
      { 'longform-cards|chunks': 2, 'longform-cards|requests': 3 },
    ]);
    expect(row.stats.chunks).toBe(6);
    expect(row.stats.requests).toBe(8);
  });

  it('历史行没有 requests 时是 0，不会去借 chunks 的值', () => {
    const [row] = sumToolDays([{ 'longform-cards|chunks': 4 }]);
    expect(row.stats.chunks).toBe(4);
    expect(row.stats.requests).toBe(0);
  });

  it('新老行混在一起时，chunks 仍然只是分块数', () => {
    const [row] = sumToolDays([
      { 'longform-cards|chunks': 4 }, // 老行：只有分块数
      { 'longform-cards|chunks': 2, 'longform-cards|requests': 3 }, // 新行
    ]);
    expect(row.stats.chunks).toBe(6); // 4 + 2 块，没被请求数污染
    expect(row.stats.requests).toBe(3); // 只有新行贡献
  });
});
