import { describe, expect, it } from 'vitest';
import { parseIpDay } from '@/lib/account/store';

describe('按 IP 的用量还原', () => {
  it('把扁平字段还原成一行一个 IP', () => {
    const rows = parseIpDay('2026-10-22', {
      '1.2.3.4|calls': 3,
      '1.2.3.4|chars': 1500,
      '1.2.3.4|promptTokens': 8000,
      '1.2.3.4|completionTokens': 1200,
      '1.2.3.4|costFen': 2,
      '5.6.7.8|calls': 1,
      '5.6.7.8|chars': 400,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      day: '2026-10-22',
      ip: '1.2.3.4',
      stats: {
        calls: 3, fails: 0, chunks: 0, requests: 0, chars: 1500, promptTokens: 8000,
        completionTokens: 1200, costFen: 2, costMicro: 0, credits: 0,
      },
    });
  });

  it('次数多的排前面', () => {
    const rows = parseIpDay('2026-10-22', { 'a|calls': 1, 'b|calls': 9 });
    expect(rows.map((r) => r.ip)).toEqual(['b', 'a']);
  });

  it('IPv6 的冒号不会把字段切错', () => {
    const ip = '2001:db8:1:2::/64';
    const rows = parseIpDay('2026-10-22', { [`${ip}|calls`]: 2, [`${ip}|chars`]: 88 });
    expect(rows).toHaveLength(1);
    expect(rows[0].ip).toBe(ip);
    expect(rows[0].stats.calls).toBe(2);
    expect(rows[0].stats.chars).toBe(88);
  });

  it('坏字段直接跳过，不影响其他行', () => {
    const rows = parseIpDay('2026-10-22', {
      '没有分隔符': 1,
      '|calls': 5,
      '1.1.1.1|不认识的指标': 9,
      '1.1.1.1|calls': 'abc',
      '2.2.2.2|calls': 4,
    });
    // 1.1.1.1 两个字段都是坏的，一条有效数据都没有，就不该占一行
    expect(rows.map((r) => r.ip)).toEqual(['2.2.2.2']);
    expect(rows[0].stats.calls).toBe(4);
  });

  it('部分字段坏掉时，好的那些照样保留', () => {
    const rows = parseIpDay('2026-10-22', {
      '3.3.3.3|calls': 2,
      '3.3.3.3|chars': '坏值',
    });
    expect(rows[0].stats.calls).toBe(2);
    expect(rows[0].stats.chars).toBe(0);
  });

  it('没有数据时返回空数组', () => {
    expect(parseIpDay('2026-10-22', null)).toEqual([]);
    expect(parseIpDay('2026-10-22', {})).toEqual([]);
  });
});
