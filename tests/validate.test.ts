import { describe, expect, it } from 'vitest';
import { coverage, normalize, validateShape } from '@/lib/ai/validate';

describe('normalize', () => {
  it('去掉空白、标点与加粗标记', () => {
    expect(normalize('这是**重点**，对吧？ ')).toBe('这是重点对吧');
  });
});

describe('coverage', () => {
  it('只重新分段时覆盖率为 1', () => {
    const original = '上个月帮楼下一家社区烘焙店梳理生意，店主一开口就叹气。后来我们只改了三件事。';
    const output = '上个月帮楼下一家社区烘焙店梳理生意，店主一开口就叹气。\n\n后来我们只改了三件事。';
    expect(coverage(original, output)).toBe(1);
  });

  it('加粗标记不影响覆盖率', () => {
    expect(coverage('信任不是喊出来的', '**信任不是喊出来的**')).toBe(1);
  });

  it('被润色改写后覆盖率明显下降', () => {
    const original = '每天发新品图，朋友圈小红书都在更，回头客还是没几个。';
    const output = '尽管每日都在各大社交平台推送新品照片，但忠实顾客的数量始终不见增长。';
    expect(coverage(original, output)).toBeLessThan(0.95);
  });

  it('输出为空时覆盖率为 0', () => {
    expect(coverage('有内容', '')).toBe(0);
  });

  it('原文为空时覆盖率为 1', () => {
    expect(coverage('', '随便')).toBe(1);
  });

  it('长文走频次近似也能认出原样保留', () => {
    const original = '这是一段用来测试长文覆盖率的文字。'.repeat(200);
    expect(coverage(original, original)).toBe(1);
  });
});

describe('validateShape', () => {
  it('接受合法结构并补默认密度', () => {
    const r = validateShape({ title: ' 标题 ', blocks: [{ type: 'p', text: ' 正文 ' }] });
    expect(r).toEqual({ title: '标题', blocks: [{ type: 'p', text: '正文' }], density: 'standard', notes: undefined });
  });

  it('保留合法的密度值', () => {
    expect(validateShape({ blocks: [{ type: 'p', text: 'x' }], density: 'compact' })?.density).toBe('compact');
  });

  it('未知的 type 一律当正文', () => {
    expect(validateShape({ blocks: [{ type: 'h3', text: 'x' }] })?.blocks[0].type).toBe('p');
  });

  it('结构不合法返回 null', () => {
    expect(validateShape(null)).toBeNull();
    expect(validateShape({})).toBeNull();
    expect(validateShape({ blocks: [] })).toBeNull();
    expect(validateShape({ blocks: [{ type: 'p', text: '   ' }] })).toBeNull();
  });
});

describe('覆盖率与小标题', () => {
  it('原文里的结构被抽成 h2 时不应判为改写', () => {
    const original = '第一件事：别只拍面包。很多店主觉得面包拍得越精致越好。';
    const blocks = [
      { type: 'h2' as const, text: '第一件事：别只拍面包' },
      { type: 'p' as const, text: '很多店主觉得面包拍得越精致越好。' },
    ];
    const onlyP = blocks.filter((b) => b.type === 'p').map((b) => b.text).join('');
    const withH2 = blocks.map((b) => b.text).join('');
    expect(coverage(original, onlyP)).toBeLessThan(0.95);
    expect(coverage(original, withH2)).toBe(1);
  });
});
