/**
 * 单位数与额度。
 *
 * 这几条是「和 check_copy.py 数出来的数字必须一致」的回归测试 ——
 * 同一个标题在网站上和在脚本里得到两个数字，比两边都算错更糟。
 * 期望值是跑 python3 -c "..." 对出来的，不是手算的。
 */

import { describe, expect, it } from 'vitest';
import {
  BODY_MAX_CHARS,
  TITLE_MAX_UNITS,
  extractTags,
  measure,
  proseOf,
  splitDoc,
  titleUnits,
} from '@/lib/xhs/units';

describe('titleUnits：全角 1、半角 0.5', () => {
  it('纯中文 = 字数', () => {
    expect(titleUnits('油皮防晒怎么选')).toBe(7);
  });

  it('半角字母数字算半个', () => {
    expect(titleUnits('SPF50')).toBe(2.5);
    expect(titleUnits('油皮防晒别只看SPF')).toBe(8.5);
  });

  it('全角标点算一个', () => {
    expect(titleUnits('油皮防晒怎么选｜实测8支不闷痘')).toBe(14.5);
  });

  it('emoji 按一个字符算，不是两个（代理对）', () => {
    expect(titleUnits('🌞')).toBe(1);
    expect(titleUnits('防晒🌞')).toBe(3);
  });

  it('半角空格算半个', () => {
    expect(titleUnits('a b')).toBe(1.5);
  });

  it('空字符串是 0', () => {
    expect(titleUnits('')).toBe(0);
  });
});

describe('measure：正文额度包含标签', () => {
  it('标签算进 1000 字额度 —— 这是最容易算漏的地方', () => {
    const body = '正文内容\n\n#养生 #秋季养生';
    const m = measure('标题', body);
    expect(m.bodyChars).toBe(body.length);
    // 连 # 号：#养生 3 + #秋季养生 5 = 8（它们之间那个空格算正文）
    expect(m.tagChars).toBe(8);
    expect(m.tags).toEqual(['养生', '秋季养生']);
  });

  it('标题超限时报出超了几个单位', () => {
    const m = measure('秋天必备的养生小妙招分享给大家，一定要看完哦', '正文');
    expect(m.titleUnits).toBe(22);
    expect(m.titleOver).toBe(2);
    expect(m.overLimit).toBe(true);
  });

  it('正好到上限不算超', () => {
    const m = measure('一'.repeat(TITLE_MAX_UNITS), '一'.repeat(BODY_MAX_CHARS));
    expect(m.titleOver).toBe(0);
    expect(m.bodyOver).toBe(0);
    expect(m.overLimit).toBe(false);
  });

  it('正文超一个字符就算超', () => {
    const m = measure('标题', '一'.repeat(BODY_MAX_CHARS + 1));
    expect(m.bodyOver).toBe(1);
    expect(m.overLimit).toBe(true);
  });

  it('标题偏短会标出来，但不算超限', () => {
    const m = measure('防晒', '正文');
    expect(m.titleShort).toBe(true);
    expect(m.overLimit).toBe(false);
  });

  it('空标题不算偏短（还没填）', () => {
    expect(measure('', '正文').titleShort).toBe(false);
  });
});

describe('标签与正文拆分', () => {
  it('extractTags 不要 # 号', () => {
    expect(extractTags('内容 #a #b#c')).toEqual(['a', 'b', 'c']);
  });

  it('proseOf 去掉标签', () => {
    expect(proseOf('正文在这 #养生 #健康')).toBe('正文在这');
  });
});

describe('splitDoc：和 check_copy.py 的输入格式一致', () => {
  it('第一行 # 标题', () => {
    expect(splitDoc('# 我的标题\n\n正文第一段\n正文第二段')).toEqual({
      title: '我的标题',
      body: '正文第一段\n正文第二段',
    });
  });

  it('没有标题行就全算正文', () => {
    expect(splitDoc('直接是正文')).toEqual({ title: '', body: '直接是正文' });
  });

  it('CRLF 也能拆', () => {
    expect(splitDoc('# 标题\r\n正文')).toEqual({ title: '标题', body: '正文' });
  });
});
