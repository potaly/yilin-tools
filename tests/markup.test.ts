import { describe, expect, it } from 'vitest';
import { clearHeading, toggleBold, toggleHeading } from '@/lib/cards/markup';

describe('toggleHeading', () => {
  it('把光标所在行变成大标题', () => {
    const r = toggleHeading('第一行\n第二行', 1, 1, 1);
    expect(r.text).toBe('# 第一行\n第二行');
  });

  it('再点一次就去掉', () => {
    const r = toggleHeading('# 第一行\n第二行', 2, 2, 1);
    expect(r.text).toBe('第一行\n第二行');
  });

  it('大标题点小标题会换级，而不是叠加', () => {
    expect(toggleHeading('# 标题', 2, 2, 2).text).toBe('## 标题');
    expect(toggleHeading('## 标题', 3, 3, 1).text).toBe('# 标题');
  });

  it('跨行选中时整段一起加', () => {
    const r = toggleHeading('甲\n乙\n丙', 0, 3, 2);
    expect(r.text).toBe('## 甲\n## 乙\n丙');
  });

  it('空行不加标记', () => {
    expect(toggleHeading('甲\n\n乙', 0, 5, 1).text).toBe('# 甲\n\n# 乙');
  });

  it('选区仍然覆盖处理过的文字', () => {
    const r = toggleHeading('第一行', 0, 3, 1);
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('# 第一行');
  });

  it('话题标签不会被误当成已有标题', () => {
    const r = toggleHeading('#养生赛道 #大健康', 0, 0, 1);
    expect(r.text).toBe('# #养生赛道 #大健康');
  });
});

describe('toggleBold', () => {
  it('给选中的文字加标记', () => {
    const r = toggleBold('这是重点内容', 2, 4);
    expect(r.text).toBe('这是**重点**内容');
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('重点');
  });

  it('再点一次去掉标记', () => {
    const r = toggleBold('这是**重点**内容', 4, 6);
    expect(r.text).toBe('这是重点内容');
  });

  it('选区自带标记时也能去掉', () => {
    const r = toggleBold('这是**重点**内容', 2, 8);
    expect(r.text).toBe('这是重点内容');
  });

  it('没选中时插入一对标记，光标落在中间', () => {
    const r = toggleBold('这是', 2, 2);
    expect(r.text).toBe('这是****');
    expect(r.selectionStart).toBe(4);
    expect(r.selectionEnd).toBe(4);
  });
});

describe('clearHeading', () => {
  it('变回正文', () => {
    expect(clearHeading('## 小标题\n正文', 3, 3).text).toBe('小标题\n正文');
  });

  it('本来就是正文时不动', () => {
    expect(clearHeading('正文', 0, 0).text).toBe('正文');
  });
});
