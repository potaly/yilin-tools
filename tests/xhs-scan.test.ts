/**
 * 词表扫描。
 *
 * 反例比正例重要：这张表的作用是替代「让模型自己判断」，
 * 一旦开始误报，用户就会退回去相信模型 —— 那等于白做。
 *
 * 「硬教训」那一组是这套设计的由来：模型拿着写在文档里的同一份口径，
 * 漏掉了「祛湿」「补气血」「增强免疫力」。查表不会漏，所以要钉死。
 */

import { describe, expect, it } from 'vitest';
import { gate, validateRewrite, verifiedChanges } from '@/lib/xhs/rewrite';
import { hardHits, scanDoc, scanText } from '@/lib/xhs/scan';
import { INDUSTRY } from '@/lib/xhs/words';

const kinds = (text: string) => scanText(text).map((i) => i.kind);
const of = (text: string, kind: string) => scanText(text).find((i) => i.kind === kind);

describe('硬教训：靠判断会漏的那几个词，查表一个都不漏', () => {
  const missed = ['祛湿', '补气血', '增强免疫力'];

  for (const word of missed) {
    it(`扫到「${word}」`, () => {
      const issue = of(`平时可以${word}，坚持下来身体会舒服很多。`, 'industry');
      expect(issue).toBeDefined();
      expect(issue!.hits).toContain(word);
      expect(issue!.industry).toBe('养生');
    });
  }

  it('一段文字里三个一起出现，都扫得到', () => {
    const issue = of('祛湿、补气血，还能增强免疫力。', 'industry');
    expect(issue!.hits).toEqual(expect.arrayContaining(missed));
    expect(issue!.spans.length).toBeGreaterThanOrEqual(3);
  });

  it('五个行业的词表都接上了', () => {
    expect(Object.keys(INDUSTRY)).toEqual(['养生', '医美', '母婴', '金融', '食品']);
    for (const [industry, words] of Object.entries(INDUSTRY)) {
      const issue = of(`这个产品可以${words[0]}。`, 'industry');
      expect(issue, `${industry} 的「${words[0]}」没扫到`).toBeDefined();
      expect(issue!.industry).toBe(industry);
    }
  });
});

describe('导流：硬错误', () => {
  it('命中「加微信」', () => {
    const issue = of('想要的话加微信找我拿', 'diversion');
    expect(issue!.severity).toBe('hard');
  });

  it('不误报正常内容', () => {
    expect(kinds('我用了三个月，确实有变化。')).not.toContain('diversion');
  });
});

describe('医疗断言：例外正则不能误杀氛围词', () => {
  it('「根治」是硬错误', () => {
    const issue = of('这个方法可以根治失眠', 'medical');
    expect(issue!.severity).toBe('hard');
    expect(issue!.hits).toContain('根治');
  });

  it('「治愈系」不算医疗断言', () => {
    expect(kinds('这家店是治愈系的氛围')).not.toContain('medical');
    expect(kinds('很治愈的一个下午')).not.toContain('medical');
  });

  it('同一篇里既有「治愈系」又有「治愈失眠」时，后者照样拦下来', () => {
    // check_copy.py 是搜全文，一处例外就赦免全部；这里只看命中点附近，比它严
    const issue = of('这家店很治愈系。据说能治愈失眠。', 'medical');
    expect(issue).toBeDefined();
    expect(issue!.hits).toContain('治愈');
    expect(issue!.spans).toHaveLength(1);
  });
});

describe('凑字数的话：形式正确但等于没说', () => {
  it('命中警报句', () => {
    const issue = of('具体怎么选，适合自己的才是最好的。', 'filler');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('soft');
  });

  it('和空心词是两张表，不互相覆盖', () => {
    // hollow（赋能/闭环）在 lib/aiwei 里，filler 在这里，两边不该重叠
    expect(kinds('因人而异，按需选择')).toEqual(['filler']);
  });

  it('不误报有具体细节的句子', () => {
    expect(kinds('取一元硬币大小的量，顺着一个方向推开。')).toHaveLength(0);
  });
});

describe('绝对化用语', () => {
  it('命中「最好」「100%」', () => {
    const issue = of('这是最好的选择，100% 有效', 'absolute');
    expect(issue!.hits).toEqual(expect.arrayContaining(['最好', '100%']));
  });

  it('改成个人体验表述之后就不命中了', () => {
    expect(kinds('我回购了三次的面霜')).toHaveLength(0);
  });
});

describe('开场寒暄', () => {
  it('命中「大家好」', () => {
    expect(of('大家好，今天聊聊防晒', 'greeting')).toBeDefined();
  });

  it('直接给结论的开头不命中', () => {
    expect(kinds('先说结论：油皮选防晒看两个数。')).toHaveLength(0);
  });
});

describe('scanDoc：标题也要扫，硬错误和超限都算 blocking', () => {
  it('标题里的违禁词一样拦下来', () => {
    const r = scanDoc('根治失眠的三个方法', '正文内容');
    expect(r.issues.some((i) => i.kind === 'medical')).toBe(true);
    expect(r.blocking).toBe(true);
  });

  it('只有 soft 问题时不算 blocking', () => {
    const r = scanDoc('防晒怎么选｜先看这三点', '因人而异，按需选择');
    expect(r.issues.map((i) => i.severity)).toEqual(['soft']);
    expect(r.blocking).toBe(false);
  });

  it('同一处被两张表命中时都报出来 —— 两条的改法不一样', () => {
    // 「适合自己的才是最好的」既是凑字数的话，里面的「最好」又是绝对化用语
    const r = scanDoc('', '适合自己的才是最好的');
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['absolute', 'filler']);
  });

  it('超限本身就算 blocking，哪怕一个违禁词都没有', () => {
    const r = scanDoc('', '一'.repeat(1001));
    expect(r.issues).toHaveLength(0);
    expect(r.blocking).toBe(true);
  });

  it('hard 排在 soft 前面', () => {
    const r = scanDoc('', '大家好，这个能根治失眠');
    expect(r.issues[0].severity).toBe('hard');
  });

  it('干净的一篇什么都不报', () => {
    const r = scanDoc('油皮防晒怎么选｜先看这3个点', '先说结论：看两个数。\n\n#防晒 #油皮护肤 #护肤');
    expect(r.issues).toHaveLength(0);
    expect(r.blocking).toBe(false);
  });
});

describe('闸门：模型改完之后代码再验一遍', () => {
  it('还剩硬违禁词就不放过', () => {
    const v = gate({ title: '', body: '这个能根治失眠', changes: [], note: '' });
    expect(v.ok).toBe(false);
    expect(v.leftover).toContain('根治');
  });

  it('只剩 soft 词算通过 —— 那是「建议改」，用户自己决定', () => {
    const v = gate({ title: '', body: '我回购三次，算最好用的一支', changes: [], note: '' });
    expect(v.ok).toBe(true);
    expect(v.leftover).toHaveLength(0);
  });

  it('改完还超限也不放过', () => {
    const v = gate({ title: '一'.repeat(21), body: '正文', changes: [], note: '' });
    expect(v.ok).toBe(false);
    expect(v.stillOver[0]).toContain('标题超 1 单位');
  });

  it('标题里的硬违禁词也要被闸门拦住', () => {
    const v = gate({ title: '加微信领资料', body: '正文', changes: [], note: '' });
    expect(v.ok).toBe(false);
    expect(v.leftover).toContain('加微信');
  });

  it('hardHits 只收 hard，不收 soft', () => {
    expect(hardHits('最好的祛湿方法')).toHaveLength(0);
    expect(hardHits('根治失眠')).toEqual(['根治']);
  });
});

describe('validateRewrite：结构不合法要让上层重试', () => {
  it('正文为空算不合法', () => {
    expect(validateRewrite({ title: '标题', body: '' })).toBeNull();
    expect(validateRewrite(null)).toBeNull();
    expect(validateRewrite('一段文字')).toBeNull();
  });

  it('缺字段时补默认值', () => {
    expect(validateRewrite({ body: '正文' })).toEqual({
      title: '',
      body: '正文',
      changes: [],
      note: '',
    });
  });

  it('changes 最多留 8 条，from 为空的丢掉', () => {
    const r = validateRewrite({
      body: '正文',
      changes: [...Array(10)].map((_, i) => ({ from: `a${i}`, to: 'b', why: 'c' })),
    });
    expect(r!.changes).toHaveLength(8);

    const r2 = validateRewrite({ body: '正文', changes: [{ from: '', to: 'b' }] });
    expect(r2!.changes).toHaveLength(0);
  });

  it('verifiedChanges 丢掉原文里不存在的 from（模型偶尔把改写后的句子写进 from）', () => {
    const changes = [
      { from: '大家好', to: '先说结论', why: '' },
      { from: '模型编出来的句子', to: 'x', why: '' },
    ];
    expect(verifiedChanges('大家好，今天聊聊防晒', changes)).toHaveLength(1);
  });
});
