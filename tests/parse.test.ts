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

describe('话题标签不是标题', () => {
  it('小红书话题行原样保留为正文', () => {
    const line = '#养生赛道 #大健康  #自媒体起号 #IP打造  #内容创业';
    expect(parse(line)).toEqual([{ type: 'p', text: line }]);
  });

  it('井号后没有空格一律当正文', () => {
    expect(parse('#标题样子的一行')).toEqual([{ type: 'p', text: '#标题样子的一行' }]);
    expect(parse('##话题')).toEqual([{ type: 'p', text: '##话题' }]);
  });

  it('井号后有空格才是标题', () => {
    expect(parse('# 大标题')).toEqual([{ type: 'title', text: '大标题' }]);
    expect(parse('## 小标题')).toEqual([{ type: 'h2', text: '小标题' }]);
  });

  it('光秃秃的井号不产生任何块', () => {
    expect(parse('#\n##')).toEqual([]);
  });

  it('正文里的井号不受影响', () => {
    expect(parse('价格是 #1 的那个')).toEqual([{ type: 'p', text: '价格是 #1 的那个' }]);
  });
});
