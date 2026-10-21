import { describe, expect, it } from 'vitest';
import { chunkByParagraph, estimateChunks, mergeResults } from '@/lib/ai/chunk';
import type { FormatResult } from '@/lib/cards/parse';

describe('chunkByParagraph', () => {
  it('不超过上限时不切块', () => {
    expect(chunkByParagraph('第一段。\n第二段。', 3000)).toEqual(['第一段。\n第二段。']);
  });

  it('在段落边界切块', () => {
    const p = '啊'.repeat(60) + '。';
    const chunks = chunkByParagraph(Array(10).fill(p).join('\n'), 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.split('\n').every((line) => line === p)).toBe(true);
  });

  it('单段超长时退而在句末拆', () => {
    const one = '这是一个句子。'.repeat(40);
    const chunks = chunkByParagraph(one, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').replace(/\n/g, '')).toBe(one);
  });

  it('空文本得到空数组', () => {
    expect(chunkByParagraph('  \n\n ')).toEqual([]);
  });
});

describe('estimateChunks', () => {
  it('按长度估算上游调用次数', () => {
    expect(estimateChunks(0)).toBe(1);
    expect(estimateChunks(3000)).toBe(1);
    expect(estimateChunks(3001)).toBe(2);
    expect(estimateChunks(10000)).toBe(4);
  });
});

describe('mergeResults', () => {
  const part = (title: string, texts: string[]): FormatResult => ({
    title,
    blocks: texts.map((text) => ({ type: 'p' as const, text })),
    density: 'standard',
  });

  it('只保留第一块的大标题，块按顺序拼接', () => {
    const merged = mergeResults([part('真标题', ['一']), part('多余标题', ['二'])]);
    expect(merged.title).toBe('真标题');
    expect(merged.blocks.map((b) => b.text)).toEqual(['一', '二']);
  });

  it('密度按合并后的总字数重算', () => {
    const short = mergeResults([part('', ['啊'.repeat(100)])]);
    expect(short.density).toBe('loose');
    const long = mergeResults([part('', ['啊'.repeat(1500)]), part('', ['啊'.repeat(1500)])]);
    expect(long.density).toBe('compact');
  });
});
