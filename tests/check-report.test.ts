import { describe, expect, it } from 'vitest';
import { analyze } from '@/lib/aiwei/engine';
import { checkReport } from '@/lib/xhs/report';
import { scanDoc } from '@/lib/xhs/scan';
import { SAMPLE_BODY, SAMPLE_TITLE } from '@/lib/xhs/sample';

function reportOf(title: string, body: string): string {
  const scan = scanDoc(title, body);
  return checkReport(scan, analyze(scan.text));
}

describe('检查报告', () => {
  const text = reportOf(SAMPLE_TITLE, SAMPLE_BODY);

  it('三组都在，不只是表达提示那一组', () => {
    expect(text).toContain('需人工核实的用词');
    expect(text).toContain('文字表达提示');
    expect(text).toContain('格式与长度');
  });

  /**
   * 报告是会被截图外发的。页面上刻意不给分数，报告里再给一个，
   * 就等于把「这篇 95 分，能发」这个结论亲手递出去。
   */
  it('不带任何总分', () => {
    expect(text).not.toContain('AI味指数');
    // 「N / 100」这种打分式写法。后面跟着数字的不算 —— 正文额度是 /1000
    expect(text).not.toMatch(/\d+\s*\/\s*100(?!\d)/);
  });

  it('免责口径跟着报告走，不留在页面上', () => {
    expect(text).toContain('不等于平台判违规');
    expect(text).toContain('没命中也不等于安全');
  });

  it('带上署名路径', () => {
    expect(text).toContain('/tools/check');
  });

  it('长度超限时写明超了多少', () => {
    const over = reportOf('这个标题特意写得很长很长很长超出平台上限好多个单位', SAMPLE_BODY);
    expect(over).toMatch(/标题 \d+\/\d+ 单位，超 \d+/);
  });

  it('干净的文字如实说一条都没命中，而不是说「可以发」', () => {
    const clean = reportOf('', '今天买了三斤橘子，十二块。楼下水果店，老板姓陈。');
    expect(clean).toContain('词表一条都没命中');
    expect(clean).not.toContain('可以发');
  });
});
