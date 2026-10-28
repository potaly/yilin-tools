/**
 * 每条规则一组正例 + 反例。
 *
 * 反例比正例重要：一个爱误报的检测器会当场毁掉可信度，
 * 所以每条规则都必须证明它不会把正常写法扫进来。
 */

import { describe, expect, it } from 'vitest';
import { segment } from '@/lib/aiwei/segment';
import { parallelRule } from '@/lib/aiwei/rules/parallel';
import { pairsRule } from '@/lib/aiwei/rules/pairs';
import { endingRule } from '@/lib/aiwei/rules/ending';
import { emojiRule } from '@/lib/aiwei/rules/emoji';
import { uniformRule } from '@/lib/aiwei/rules/uniform';
import { densityRule } from '@/lib/aiwei/rules/density';
import { connectivesRule } from '@/lib/aiwei/rules/connectives';
import { hollowRule } from '@/lib/aiwei/rules/hollow';
import { openingRule } from '@/lib/aiwei/rules/opening';
import type { Rule } from '@/lib/aiwei/types';

const run = (rule: Rule, text: string) => rule.detect(segment(text));

describe('R1 排比堆叠', () => {
  it('命中：三个同头分句', () => {
    const f = run(parallelRule, '不断学习，不断迭代，不断优化，才能走得更远。');
    expect(f).not.toBeNull();
    expect(f!.spans).toHaveLength(1);
  });

  it('命中：三个同尾分句', () => {
    expect(run(parallelRule, '时间被消耗，精力被消耗，热情被消耗。')).not.toBeNull();
  });

  it('不命中：只有两句同构', () => {
    expect(run(parallelRule, '不断学习，不断迭代，然后就看结果。')).toBeNull();
  });

  it('不命中：并列但首尾都不同构', () => {
    expect(run(parallelRule, '孩子的早餐、下午的加班、周末的家庭聚会。')).toBeNull();
  });

  it('不命中：长短差太多', () => {
    expect(
      run(parallelRule, '我们学习，我们在反复迭代中不断寻找方向，我们优化。')
    ).toBeNull();
  });
});

describe('R2 「不仅…而且」句式', () => {
  it('命中：两句用了配对句式', () => {
    const f = run(pairsRule, '他不仅会写，而且写得快。这件事既麻烦，又没必要。');
    expect(f).not.toBeNull();
    expect(f!.spans).toHaveLength(2);
  });

  it('不命中：只用了一次', () => {
    expect(run(pairsRule, '他不仅会写，而且写得快。剩下的事明天再说。')).toBeNull();
  });

  it('不命中：配对词分散在不同句子里', () => {
    expect(run(pairsRule, '他不仅会写。而且这是另一句。他不但会写。还有一句。')).toBeNull();
  });

  it('不收「不是…而是」，它在好文章里同样高频', () => {
    expect(run(pairsRule, '这不是技巧，而是习惯。那不是运气，而是准备。')).toBeNull();
  });
});

describe('R3 万能结尾', () => {
  it('命中：结尾的套话', () => {
    expect(run(endingRule, '前面是正文。\n希望对你有帮助，一起加油。')).not.toBeNull();
  });

  it('不命中：同样的话出现在开头', () => {
    const text = '希望对你有帮助。\n中间一段。\n第三段。\n第四段讲别的事情。';
    expect(run(endingRule, text)).toBeNull();
  });

  it('不收「欢迎在评论区」：引导评论是有效动作，不是 AI 味', () => {
    expect(run(endingRule, '正文。\n欢迎在评论区说说你的做法。')).toBeNull();
  });
});

describe('R4 emoji 当装饰', () => {
  it('命中：三段都用 emoji 开头', () => {
    const f = run(emojiRule, '✨ 第一点\n🔥 第二点\n💡 第三点');
    expect(f).not.toBeNull();
    expect(f!.detail).toContain('3 段');
  });

  it('不命中：只有一个 emoji 在句子中间', () => {
    expect(run(emojiRule, '今天真不错 😄\n第二段写点别的。\n第三段再写点。')).toBeNull();
  });
});

describe('R5 段落长度过于均匀', () => {
  const even = ['一二三四五六七八九十', '甲乙丙丁戊己庚辛壬癸', '子丑寅卯辰巳午未申酉', '金木水火土风雷电山泽'];

  it('命中：四段长度一致', () => {
    const f = run(uniformRule, even.join('\n'));
    expect(f).not.toBeNull();
    expect(f!.spans).toHaveLength(4);
  });

  it('不命中：长短不齐', () => {
    expect(run(uniformRule, ['短。', even[1], even[2] + even[3] + even[0], '也短。'].join('\n'))).toBeNull();
  });

  it('不命中：段落不足四段', () => {
    expect(run(uniformRule, even.slice(0, 3).join('\n'))).toBeNull();
  });

  it('标题行不参与统计', () => {
    expect(run(uniformRule, ['# 标题', ...even.slice(0, 3)].join('\n'))).toBeNull();
  });
});

describe('R6 信息密度过低', () => {
  // 必须超过 200 字的统计门槛，否则这条规则会直接跳过，等于没测
  const vague = '这件事的关键在于思维方式的转变。'.repeat(16);

  it('命中：长文里没有一个具体数字或名称', () => {
    const f = run(densityRule, vague);
    expect(f).not.toBeNull();
    expect(f!.detail).toContain('0 处');
  });

  it('不命中：带了数字和产品名', () => {
    const concrete = '我用 Claude 跑了 3 遍，每遍 20 分钟，第 2 遍开始稳定。'.repeat(9);
    expect(run(densityRule, concrete)).toBeNull();
  });

  it('不命中：文本太短，统计不出密度', () => {
    expect(run(densityRule, '这件事的关键在于思维方式的转变。')).toBeNull();
  });
});

describe('R7 关联词过密', () => {
  it('命中：关联词密度超标', () => {
    const text = '因此这样。然而那样。此外还有。由此可见如此。总之就是这样子的一件事情。'.repeat(7);
    expect(run(connectivesRule, text)).not.toBeNull();
  });

  it('不命中：三百字里只用了两个', () => {
    const text =
      '我先去了一趟仓库，把三种包装都拆开看了一遍，最薄的那种一捏就扁。' +
      '原来那家供应商说这是标准厚度，我拿尺量了，比报价单上少了零点二毫米。' +
      '因此当天就换了人，新的那家贵三分钱一个，但退货率从百分之八掉到了百分之一。' +
      '算下来一个月反而省了四百多块，这笔账我是事后才算明白的。' +
      '此外还有一件事，新供应商愿意五十个起订，旧的要五百个，压货的压力小了很多。';
    expect(run(connectivesRule, text)).toBeNull();
  });

  it('不收「首先 / 其次」：分步骤是干货笔记的正当写法', () => {
    const text = '首先打开设置。其次找到账号。最后点退出登录就可以了。'.repeat(8);
    expect(run(connectivesRule, text)).toBeNull();
  });
});

describe('R8 空心词', () => {
  it('命中：两个不同的空心词', () => {
    expect(run(hollowRule, '我们要赋能用户，打造闭环。')).not.toBeNull();
  });

  it('不命中：只用了一个', () => {
    expect(run(hollowRule, '我们打造了一个很小的工具。')).toBeNull();
  });
});

describe('R9 开场寒暄', () => {
  it('命中：在这个…的时代', () => {
    expect(run(openingRule, '在这个人人都在谈效率的时代，我们该怎么办。')).not.toBeNull();
  });

  it('命中：随着…的发展', () => {
    expect(run(openingRule, '随着人工智能技术的发展，很多岗位都在变化。')).not.toBeNull();
  });

  it('不命中：同样的话出现在正文中间', () => {
    const text = '第一段讲别的。\n第二段也讲别的。\n在这个崇尚效率的时代，大家都很忙。';
    expect(run(openingRule, text)).toBeNull();
  });
});
