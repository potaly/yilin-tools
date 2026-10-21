import { describe, expect, it } from 'vitest';
import { parse } from '@/lib/cards/parse';
import { dropEmptyPages, paginate, type PageOp } from '@/lib/cards/paginate';
import { SAMPLE } from '@/lib/cards/sample';
import { RATIO_HEIGHT, metricsFor } from '@/lib/cards/spec';
import { FONT, fakeMeasurer } from './helpers';

const run = (text: string, opts?: { height?: number; showMeta?: boolean }) =>
  dropEmptyPages(
    paginate(parse(text), {
      height: opts?.height ?? RATIO_HEIGHT['3:5'],
      showMeta: opts?.showMeta ?? true,
      metrics: metricsFor('standard'),
      measure: fakeMeasurer,
      fontFamily: FONT,
    }),
  );

const lineOps = (page: PageOp[]) => page.filter((op) => op.type === 'line');

describe('paginate', () => {
  it('示例文字在 3:5 标准密度下排成 3 页（与原型一致）', () => {
    expect(run(SAMPLE)).toHaveLength(3);
  });

  it('3:4 比原型更矮，页数不少于 3:5', () => {
    expect(run(SAMPLE, { height: RATIO_HEIGHT['3:4'] }).length).toBeGreaterThanOrEqual(3);
  });

  it('只有第一页画顶部信息和分隔线', () => {
    const pages = run(SAMPLE);
    expect(pages[0].some((op) => op.type === 'meta')).toBe(true);
    expect(pages.slice(1).some((p) => p.some((op) => op.type === 'meta'))).toBe(false);
  });

  it('关掉顶部信息后不画 meta', () => {
    expect(run(SAMPLE, { showMeta: false })[0].some((op) => op.type === 'meta')).toBe(false);
  });

  it('小标题不会独自留在页底：每页最后一行都是正文', () => {
    const long = Array.from({ length: 14 }, (_, i) =>
      `## 第${i + 1}节的小标题\n这一节的正文内容写得不长不短，刚好够占上两三行，用来把小标题挤到页面底部附近。`,
    ).join('\n');
    const pages = run(long);
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages.slice(0, -1)) {
      const ops = lineOps(page);
      const last = ops[ops.length - 1];
      expect(last.type === 'line' && last.kind).toBe('p');
    }
  });

  it('空文本只产出一页空页', () => {
    expect(run('')).toHaveLength(1);
  });
});
