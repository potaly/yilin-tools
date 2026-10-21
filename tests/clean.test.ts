import { describe, expect, it } from 'vitest';
import {
  clean,
  isHeadingLike,
  mergeHardWraps,
  removeCjkSpaces,
  splitLongParagraph,
  splitTrailingTags,
  stripInvisible,
  toFullWidthPunctuation,
} from '@/lib/cards/clean';

describe('stripInvisible', () => {
  it('去掉零宽字符与 \\r', () => {
    expect(stripInvisible('你\u200B好\r\n世界')).toBe('你好\n世界');
  });
});

describe('mergeHardWraps', () => {
  it('把被折断的行合并回一段', () => {
    expect(mergeHardWraps(['上个月帮楼下一家烘焙店', '梳理生意，店主叹气。'])).toEqual([
      '上个月帮楼下一家烘焙店梳理生意，店主叹气。',
    ]);
  });

  it('上一行已经以句号结尾就不合并', () => {
    expect(mergeHardWraps(['第一句。', '第二句。'])).toEqual(['第一句。', '第二句。']);
  });

  it('下一行像标题就单独成行', () => {
    expect(mergeHardWraps(['前面还没写完', '第一件事：拍场景', '后面的正文。'])).toEqual([
      '前面还没写完',
      '第一件事：拍场景',
      '后面的正文。',
    ]);
  });

  it('保留已有的 # 标记', () => {
    expect(mergeHardWraps(['# 标题', '正文没写完', '继续写。'])).toEqual([
      '# 标题',
      '正文没写完继续写。',
    ]);
  });

  it('整行的复制残留会被删掉', () => {
    expect(mergeHardWraps(['正文。', '展开全文', '下一段。'])).toEqual(['正文。', '下一段。']);
  });

  it('中英文之间保留一个空格', () => {
    expect(mergeHardWraps(['他用的是', 'Figma 做的'])).toEqual(['他用的是Figma 做的']);
  });
});

describe('removeCjkSpaces', () => {
  it('删掉中文之间的空格', () => {
    expect(removeCjkSpaces('你 好   世 界')).toBe('你好世界');
  });

  it('不动中英文之间的空格', () => {
    expect(removeCjkSpaces('使用 Figma 设计')).toBe('使用 Figma 设计');
  });
});

describe('toFullWidthPunctuation', () => {
  it('中文语境里的半角标点转全角', () => {
    expect(toFullWidthPunctuation('店主一开口就叹气:每天发新品图,还搞了买二送一。')).toBe(
      '店主一开口就叹气：每天发新品图，还搞了买二送一。',
    );
  });

  it('问号和感叹号同样处理', () => {
    expect(toFullWidthPunctuation('客人最在意什么?真的不知道!')).toBe('客人最在意什么？真的不知道！');
  });

  it('句点在中文后转句号', () => {
    expect(toFullWidthPunctuation('这是一句话.')).toBe('这是一句话。');
  });

  it('不误伤 URL', () => {
    expect(toFullWidthPunctuation('详情看 https://example.com/a?b=1,谢谢')).toBe(
      '详情看 https://example.com/a?b=1，谢谢',
    );
  });

  it('不误伤小数与百分比', () => {
    expect(toFullWidthPunctuation('毛利率是 32.5% ,比上月高。')).toBe('毛利率是 32.5% ，比上月高。');
  });

  it('不误伤列表序号', () => {
    expect(toFullWidthPunctuation('1. 先拍场景,再拍产品')).toBe('1. 先拍场景，再拍产品');
  });

  it('整行英文完全不动', () => {
    expect(toFullWidthPunctuation('Hello, world. Is it ok?')).toBe('Hello, world. Is it ok?');
  });

  it('中文括号转全角', () => {
    expect(toFullWidthPunctuation('这是(重点)内容')).toBe('这是（重点）内容');
  });
});

describe('splitLongParagraph', () => {
  it('短段落不动', () => {
    expect(splitLongParagraph('很短的一段。')).toEqual(['很短的一段。']);
  });

  it('超长段落在句号处拆开', () => {
    const long = '这是一个句子。'.repeat(30);
    const parts = splitLongParagraph(long, 150);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.endsWith('。'))).toBe(true);
    expect(parts.join('')).toBe(long);
  });

  it('单句超长则不拆', () => {
    const one = '啊'.repeat(300);
    expect(splitLongParagraph(one, 150)).toEqual([one]);
  });
});

describe('isHeadingLike', () => {
  it('识别常见结构标记', () => {
    expect(isHeadingLike('第一件事：拍场景')).toBe(true);
    expect(isHeadingLike('1. 拍场景')).toBe(true);
    expect(isHeadingLike('【重点】拍场景')).toBe(true);
    expect(isHeadingLike('这是一段很普通的正文，没有任何结构标记。')).toBe(false);
  });
});

describe('clean', () => {
  it('完整流程：合并硬换行、转全角、保留标题', () => {
    const out = clean('# 我的标题\n\n上个月帮楼下\n一家烘焙店梳理生意,店主叹气。\n\n\n下一段。');
    expect(out).toBe('# 我的标题\n\n上个月帮楼下一家烘焙店梳理生意，店主叹气。\n\n下一段。\n');
  });
});

describe('话题标签', () => {
  it('结尾的话题标签拆成单独一段', () => {
    expect(splitTrailingTags('总结：方法对就行#养生赛道 #大健康 #IP打造')).toEqual([
      '总结：方法对就行',
      '#养生赛道 #大健康 #IP打造',
    ]);
  });

  it('整行都是话题时不拆', () => {
    const tags = '#养生赛道 #大健康 #内容创业';
    expect(splitTrailingTags(tags)).toEqual([tags]);
  });

  it('只有一个井号词时不拆，避免误伤正文', () => {
    expect(splitTrailingTags('他排在 #1')).toEqual(['他排在 #1']);
  });

  it('clean 之后话题独立成段且一字不改', () => {
    const out = clean('能拍100条视频的人,不是天赋高,是方法对#养生赛道 #大健康  #IP打造');
    expect(out.trim().split('\n\n').pop()).toBe('#养生赛道 #大健康 #IP打造');
  });
});
