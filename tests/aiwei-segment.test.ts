import { describe, expect, it } from 'vitest';
import { coefficientOfVariation, segment, stripEdgePunctuation } from '@/lib/aiwei/segment';

describe('segment', () => {
  it('段的下标能切回原文', () => {
    const text = '第一段。\n\n第二段。';
    const seg = segment(text);
    expect(seg.paras).toHaveLength(2);
    for (const p of seg.paras) {
      expect(seg.text.slice(p.start, p.end)).toBe(p.text);
    }
  });

  it('句的下标能切回原文', () => {
    const seg = segment('今天下雨了。我没带伞！怎么办？');
    expect(seg.sentences).toHaveLength(3);
    for (const s of seg.sentences) {
      expect(seg.text.slice(s.start, s.end)).toBe(s.text);
    }
  });

  it('分句按逗号再切一层', () => {
    const seg = segment('不断学习，不断迭代，不断优化。');
    expect(seg.clauses.map((c) => c.text)).toEqual(['不断学习，', '不断迭代，', '不断优化。']);
  });

  it('零宽字符不会让下标错位', () => {
    const seg = segment('你​好。世界。');
    expect(seg.text).toBe('你好。世界。');
    expect(seg.text.slice(seg.sentences[1].start, seg.sentences[1].end)).toBe('世界。');
  });

  it('标题行不算正文段', () => {
    const seg = segment('# 大标题\n正文一。\n正文二。');
    expect(seg.paras).toHaveLength(3);
    expect(seg.bodyParas).toHaveLength(2);
  });
});

describe('coefficientOfVariation', () => {
  it('完全相等时为 0', () => {
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
  });

  it('长短不齐时明显大于 0', () => {
    expect(coefficientOfVariation([5, 50, 120])!).toBeGreaterThan(0.5);
  });

  it('不足两个值时返回 null', () => {
    expect(coefficientOfVariation([10])).toBeNull();
  });
});

describe('stripEdgePunctuation', () => {
  it('去掉首尾标点', () => {
    expect(stripEdgePunctuation('「不断学习」，')).toBe('不断学习');
  });
});
