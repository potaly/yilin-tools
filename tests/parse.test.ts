import { describe, expect, it } from 'vitest';
import { makeSlug, parse, plain, toEditorText, wordCount } from '@/lib/cards/parse';

describe('parse', () => {
  it('识别大标题、小标题与段落，忽略空行', () => {
    expect(parse('# 标题\n\n## 小标题\n正文一\n\n正文二')).toEqual([
      { type: 'title', text: '标题' },
      { type: 'h2', text: '小标题' },
      { type: 'p', text: '正文一' },
      { type: 'p', text: '正文二' },
    ]);
  });

  it('只有 # 没有内容时不产生块', () => {
    expect(parse('#\n##  ')).toEqual([]);
  });

  it('字数不含空白与加粗标记', () => {
    expect(wordCount(parse('# 标题\n这是 **重点** 内容'))).toBe(2 + 6);
  });

  it('plain 去掉加粗标记', () => {
    expect(plain('这是**重点**')).toBe('这是重点');
  });

  it('文件名取标题前 16 字并去掉非法字符', () => {
    expect(makeSlug(parse('# 开店三个月，我才明白社区烘焙店靠什么留住客人'))).toBe('开店三个月我才明白社区烘焙店靠什');
  });

  it('没有标题时回退到默认名', () => {
    expect(makeSlug([])).toBe('长文图卡');
  });

  it('AI 结果能转回编辑器语法', () => {
    const text = toEditorText({
      title: '标题',
      blocks: [
        { type: 'h2', text: '小标题' },
        { type: 'p', text: '正文' },
      ],
    });
    expect(text).toBe('# 标题\n\n## 小标题\n\n正文\n');
    expect(parse(text)).toHaveLength(3);
  });
});
