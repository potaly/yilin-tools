import { describe, expect, it } from 'vitest';
import { CHECK_FLOOR, computeRetention, emptyFunnel, intersectCount, parseEventDay, type CheckFunnel } from '@/lib/analytics/store';

describe('parseEventDay', () => {
  it('把扁平 hash 还原成按工具分组的漏斗', () => {
    const out = parseEventDay('2026-10-28', {
      'ai-flavor|open': 100,
      'ai-flavor|run': 40,
      'ai-flavor|done': 32,
      'ai-flavor|take': 7,
      'longform-cards|open': 20,
    });

    expect(out.byTool['ai-flavor']).toEqual({ ...emptyFunnel(), open: 100, run: 40, done: 32, take: 7 });
    expect(out.byTool['longform-cards']).toEqual({ ...emptyFunnel(), open: 20 });
    expect(out.total).toEqual({ ...emptyFunnel(), open: 120, run: 40, done: 32, take: 7 });
  });

  it('工具名里带连字符也能切对（按最后一个分隔符切）', () => {
    const out = parseEventDay('2026-10-28', { 'longform-cards|take': 3 });
    expect(out.byTool['longform-cards'].take).toBe(3);
  });

  it('认不出的事件名直接跳过，不污染合计', () => {
    const out = parseEventDay('2026-10-28', { 'ai-flavor|hack': 99, 'ai-flavor|open': 1 });
    expect(out.total).toEqual({ ...emptyFunnel(), open: 1 });
  });

  it('坏数据不报错', () => {
    expect(parseEventDay('2026-10-28', null).total).toEqual(emptyFunnel());
    expect(parseEventDay('2026-10-28', { nosep: 1, '|open': 2 }).total).toEqual(emptyFunnel());
    expect(parseEventDay('2026-10-28', { 'ai-flavor|open': 'x' }).total.open).toBe(0);
  });
});

describe('intersectCount', () => {
  it('两边都去重后再算交集', () => {
    expect(intersectCount(['a', 'a', 'b'], ['a', 'a', 'c'])).toBe(1);
  });

  it('没有交集是 0', () => {
    expect(intersectCount(['a'], ['b'])).toBe(0);
  });
});

describe('computeRetention', () => {
  it('上周 4 个人，这周回来 1 个', () => {
    const r = computeRetention(['a', 'b', 'c', 'd'], ['a', 'x', 'y']);
    expect(r).toEqual({ lastWeek: 4, returned: 1, rate: 0.25 });
  });

  it('同一个人上周来了多天只算一个', () => {
    expect(computeRetention(['a', 'a', 'a'], ['a']).lastWeek).toBe(1);
  });

  it('上周没人时 rate 是 null，不是 0 也不是 NaN', () => {
    expect(computeRetention([], ['a'])).toEqual({ lastWeek: 0, returned: 0, rate: null });
  });
});

/**
 * 第 14 天的决策口径用的是人数和交集，不是次数。
 * 这几条守的是「分母不够就别读比例」那条规则 —— 小样本上的百分比是噪音。
 */
describe('CHECK_FLOOR 门槛', () => {
  it('门槛是个正数，且不是 1', () => {
    expect(CHECK_FLOOR).toBeGreaterThan(1);
  });

  it('分母不足时 enough 为假，界面据此不读比例', () => {
    const below: CheckFunnel = {
      checked: CHECK_FLOOR - 1, acted: 10, enough: false, floor: CHECK_FLOOR, days: 14,
    };
    expect(below.enough).toBe(false);
    // 10/29 看着是 34%，但分母不够，这个数不该被读出来
    expect(below.acted / below.checked).toBeGreaterThan(0.3);
  });
});
