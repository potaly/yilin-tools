/**
 * 生成侧的确定性部分：标题重算、结果校验、新生成内容的严闸门。
 *
 * 这里钉死的核心是**模型报的数字一律不采信**。
 * 它会把「SPF50」数成 5 个单位、把核心词位置说错一位，
 * 而这两个数字恰恰是用户用来做决定的。
 */

import { describe, expect, it } from 'vitest';
import {
  joinBody,
  pointCount,
  promiseMismatch,
  promisedCount,
  validateCopy,
  generatedText as copyText,
} from '@/lib/xhs/copy';
import { gateGenerated, retryHint } from '@/lib/xhs/generate';
import { describeTitle, scoreTitle, titleProblems } from '@/lib/xhs/title';
import { sortBySchedule, validateTopicPlan, generatedText as planText } from '@/lib/xhs/topic-plan';
import { MOTIVES, claimsExperience } from '@/lib/xhs/topics';

describe('scoreTitle：单位数和核心词位置由代码算', () => {
  it('半角算半个 —— 模型常把 SPF50 数成 5', () => {
    const t = scoreTitle('油皮防晒别只看SPF50', '油皮防晒', 'traffic', 'counter', '');
    expect(t.units).toBe(9.5);
    expect(t.over).toBe(0);
  });

  it('核心词位置按字符数，第一个字是 1 不是 0', () => {
    const t = scoreTitle('油皮防晒怎么选｜先看3个点', '油皮防晒', 'collect', 'keyword-first', '');
    expect(t.keywordAt).toBe(1);
    expect(t.keywordInHead).toBe(true);
  });

  it('核心词被挤到第 7 个字就不算在头部了', () => {
    const t = scoreTitle('实测了8支防晒，油皮姐妹看过来', '油皮', 'traffic', 'number-result', '');
    expect(t.keywordAt).toBe(9);
    expect(t.keywordInHead).toBe(false);
  });

  it('核心词没出现是 null', () => {
    expect(scoreTitle('我的玄关改造记录', '油皮防晒', 'follow', null, '').keywordAt).toBeNull();
  });

  it('超 20 单位要算出超了多少', () => {
    const t = scoreTitle('秋天必备的养生小妙招分享给大家一定要看完', '养生', 'collect', null, '');
    expect(t.units).toBe(20);
    expect(t.over).toBe(0);

    const longer = scoreTitle(`${t.text}哦哦`, '养生', 'collect', null, '');
    expect(longer.over).toBe(2);
  });
});

describe('titleProblems：发出去才发现就晚了', () => {
  it('搜索型没有核心词是硬问题', () => {
    const t = scoreTitle('我的玄关改造记录', '收纳', 'follow', null, '');
    expect(titleProblems(t, 'search')).toContain('标题里没有核心词，搜索流量基本拿不到');
  });

  it('发现型没有核心词不算问题 —— 它吃的是信息流点击', () => {
    const t = scoreTitle('我的玄关改造记录', '收纳', 'follow', null, '');
    expect(titleProblems(t, 'discover')).toHaveLength(0);
  });

  it('超限两种策略都算问题', () => {
    const t = scoreTitle('一'.repeat(22), '一', 'collect', null, '');
    expect(titleProblems(t, 'discover')[0]).toContain('超 2 单位');
  });
});

describe('describeTitle：印在候选下面的那一行', () => {
  it('搜索型没核心词时明说', () => {
    const t = scoreTitle('随便写的标题', '防晒', 'collect', null, '');
    expect(describeTitle(t, 'search')).toContain('没有核心词');
  });

  it('核心词落在第 7 个字之后会标「偏后」', () => {
    // 前 6 个字内是搜索权重最高的位置，第 7 个字起就要提醒
    const t = scoreTitle('实测了八支产品，防晒哪支好', '防晒', 'collect', 'number-result', '');
    expect(t.keywordAt).toBe(9);
    expect(t.keywordInHead).toBe(false);
    expect(describeTitle(t, 'search')).toContain('偏后');
  });

  it('核心词正好落在第 6 个字还算在头部', () => {
    const t = scoreTitle('实测八支防晒', '防晒', 'collect', null, '');
    expect(t.keywordAt).toBe(5);
    expect(t.keywordInHead).toBe(true);
    expect(describeTitle(t, 'search')).not.toContain('偏后');
  });
});

describe('validateCopy：结构校验 + 重算', () => {
  const ok = {
    titles: [
      { text: '油皮防晒怎么选｜先看3个点', goal: 'collect', structure: 'keyword-first', why: '稳' },
      { text: '油皮防晒别只看SPF', goal: 'traffic', structure: 'counter', why: '搏点击' },
    ],
    recommend: 1,
    recommendWhy: '搏点击率',
    body: '先说结论：看两个数。',
    tags: [{ text: '防晒', layer: 'broad' }, { text: '#油皮护肤', layer: 'niche' }],
    downgraded: [],
    note: '干货清单型',
  };

  it('正常结构能过', () => {
    const r = validateCopy(ok, '油皮防晒');
    expect(r).not.toBeNull();
    expect(r!.titles).toHaveLength(2);
    expect(r!.recommend).toBe(1);
  });

  it('标签里模型带的 # 要去掉，否则额度会多算一遍', () => {
    const r = validateCopy(ok, '油皮防晒');
    expect(r!.tags.map((t) => t.text)).toEqual(['防晒', '油皮护肤']);
    expect(r!.fullBody).toContain('#防晒 #油皮护肤');
    expect(r!.fullBody).not.toContain('##');
  });

  it('额度按正文+标签一起算', () => {
    const r = validateCopy(ok, '油皮防晒');
    expect(r!.limits.bodyChars).toBe(r!.fullBody.length);
    expect(r!.limits.tagChars).toBeGreaterThan(0);
  });

  it('recommend 越界时退回 0，不让界面崩', () => {
    expect(validateCopy({ ...ok, recommend: 99 }, '')!.recommend).toBe(0);
    expect(validateCopy({ ...ok, recommend: -1 }, '')!.recommend).toBe(0);
    expect(validateCopy({ ...ok, recommend: 'x' }, '')!.recommend).toBe(0);
  });

  it('没有标题或正文算不合法，上层会重试', () => {
    expect(validateCopy({ ...ok, titles: [] }, '')).toBeNull();
    expect(validateCopy({ ...ok, body: '' }, '')).toBeNull();
    expect(validateCopy(null, '')).toBeNull();
  });

  it('goal / structure 是乱值时退回默认，不整条丢掉', () => {
    const r = validateCopy(
      { ...ok, titles: [{ text: '标题', goal: 'xxx', structure: 'yyy', why: '' }] },
      ''
    );
    expect(r!.titles[0].goal).toBe('collect');
    expect(r!.titles[0].structure).toBeNull();
  });

  it('joinBody 没有标签时不留空行', () => {
    expect(joinBody('正文', [])).toBe('正文');
  });
});

describe('生成闸门：比改写那边严', () => {
  it('soft 词在新生成内容里也不放过', () => {
    // 同样这句话，rewrite 的 gate 会放过（那是用户的原文），这里不行
    const g = gateGenerated('三个方法帮你祛湿');
    expect(g.ok).toBe(false);
    expect(g.soft).toContain('祛湿');
  });

  it('hard 词当然也拦', () => {
    const g = gateGenerated('这个能根治失眠');
    expect(g.ok).toBe(false);
    expect(g.hard).toContain('根治');
  });

  it('干净的内容放行', () => {
    expect(gateGenerated('先说结论：看两个数，其他都是噱头。').ok).toBe(true);
  });

  it('标题和正文一起过闸，任一处有就拦', () => {
    const g = gateGenerated('干净的标题', '正文里有最好用三个字');
    expect(g.ok).toBe(false);
    expect(g.soft).toContain('最好');
  });

  it('重复的词只报一次', () => {
    const g = gateGenerated('祛湿 祛湿 祛湿');
    expect(g.soft).toEqual(['祛湿']);
  });

  it('retryHint 要求换说法，不是删掉', () => {
    const hint = retryHint(gateGenerated('祛湿的三个方法'));
    expect(hint).toContain('祛湿');
    expect(hint).toContain('不要只是删掉');
  });

  it('copyText 把所有新写的文本都收进来', () => {
    const r = validateCopy(
      {
        titles: [{ text: '标题里有祛湿', goal: 'collect', structure: null, why: '' }],
        body: '正文',
        tags: [],
        recommend: 0,
      },
      ''
    );
    expect(gateGenerated(copyText(r!)).soft).toContain('祛湿');
  });
});

describe('validateTopicPlan：矩阵校验与排期', () => {
  const plan = {
    intro: '这个主题不能泛讲。',
    groups: [
      {
        slice: '租房党',
        value: '搜索量最高的一类',
        items: [
          { title: '纠错标题', motive: 'correct', scene: '场景', why: '原因', actions: ['做法1'] },
          { title: '外显标题', motive: 'show', scene: '场景', why: '原因', actions: ['做法1'] },
        ],
      },
      {
        slice: '换季时刻',
        value: '跟搜索潮走',
        items: [
          { title: '解释标题', motive: 'explain', scene: '场景', why: '原因', actions: ['做法1'] },
        ],
      },
    ],
    formulas: [{ pattern: '为什么你总是 ___？', example: '为什么你的衣柜总是不够用' }],
    searchTerms: ['小户型收纳', '玄关收纳'],
    boundaries: ['租房前提要标注'],
  };

  it('正常结构能过，条数算对', () => {
    const r = validateTopicPlan(plan);
    expect(r).not.toBeNull();
    expect(r!.groups).toHaveLength(2);
    expect(r!.count).toBe(3);
  });

  it('建议先发的按排期顺序排：外显 → 解释 → 纠错', () => {
    const r = validateTopicPlan(plan)!;
    expect(r.firstUp.map((f) => f.item.motive)).toEqual(['show', 'explain', 'correct']);
  });

  it('firstUp 带着来自哪一组，用户要知道去哪找', () => {
    const r = validateTopicPlan(plan)!;
    expect(r.firstUp[0].group).toBe('租房党');
  });

  it('排期顺序和 MOTIVES 定义的一致', () => {
    expect(MOTIVES.map((m) => m.id)).toEqual(['show', 'explain', 'correct']);
    expect(MOTIVES.map((m) => m.order)).toEqual([1, 2, 3]);
  });

  it('同一种动机内部保持原顺序（稳定排序）', () => {
    const mk = (title: string) => ({
      item: {
        title,
        motive: 'show' as const,
        scene: '',
        why: '',
        actions: [],
        claimsExperience: false,
      },
    });
    expect(sortBySchedule([mk('a'), mk('b')]).map((x) => x.item.title)).toEqual(['a', 'b']);
  });

  it('动机是乱值时退回 explain，不整条丢掉', () => {
    const r = validateTopicPlan({
      ...plan,
      groups: [{ slice: 'x', value: '', items: [{ title: 't', motive: 'zzz', actions: [] }] }],
    });
    expect(r!.groups[0].items[0].motive).toBe('explain');
  });

  it('空组、没标题的条目直接丢掉', () => {
    const r = validateTopicPlan({
      ...plan,
      groups: [
        { slice: '空组', value: '', items: [] },
        { slice: '有效组', value: '', items: [{ title: 't', motive: 'show', actions: [] }] },
      ],
    });
    expect(r!.groups).toHaveLength(1);
    expect(r!.groups[0].slice).toBe('有效组');
  });

  it('一组都没有算不合法', () => {
    expect(validateTopicPlan({ ...plan, groups: [] })).toBeNull();
    expect(validateTopicPlan(null)).toBeNull();
  });

  it('建议先发的几条优先跨组 —— 连发三条同一组会很重样', () => {
    // 实测「秋季养生」时三条全落在「气色与状态」组，这条就是为它加的
    const same = (title: string) => ({
      title,
      motive: 'show' as const,
      scene: '',
      why: '',
      actions: [],
    });
    const r = validateTopicPlan({
      ...plan,
      groups: [
        { slice: '气色', value: '', items: [same('a1'), same('a2'), same('a3')] },
        { slice: '穿搭', value: '', items: [same('b1')] },
        { slice: '饮食', value: '', items: [same('c1')] },
      ],
    })!;
    expect(r.firstUp.map((f) => f.group)).toEqual(['气色', '穿搭', '饮食']);
  });

  it('组数不够时按顺序补齐，不少给', () => {
    const r = validateTopicPlan({
      ...plan,
      groups: [
        {
          slice: '只有一组',
          value: '',
          items: [
            { title: 'a', motive: 'show', scene: '', why: '', actions: [] },
            { title: 'b', motive: 'show', scene: '', why: '', actions: [] },
            { title: 'c', motive: 'show', scene: '', why: '', actions: [] },
          ],
        },
      ],
    })!;
    expect(r.firstUp).toHaveLength(3);
    expect(r.firstUp.map((f) => f.item.title)).toEqual(['a', 'b', 'c']);
  });

  it('第一人称经历口吻要被挑出来 —— 模型会替用户编经历', () => {
    const r = validateTopicPlan({
      ...plan,
      groups: [
        {
          slice: 'x',
          value: '',
          items: [
            { title: '入秋后脸干到卡粉？我停掉了每天敷面膜', motive: 'show', actions: [] },
            { title: '秋天嘴唇起皮别撕，我换了这个习惯', motive: 'show', actions: [] },
            { title: '秋天手脚凉的人，先别急着买厚袜子', motive: 'correct', actions: [] },
          ],
        },
      ],
    })!;
    expect(r.needsRealExperience).toEqual([
      '入秋后脸干到卡粉？我停掉了每天敷面膜',
      '秋天嘴唇起皮别撕，我换了这个习惯',
    ]);
  });

  it('planText 收进标题和主线，让闸门能扫到', () => {
    const r = validateTopicPlan({
      ...plan,
      groups: [
        { slice: 'x', value: '', items: [{ title: '补气血的三个方法', motive: 'show', actions: [] }] },
      ],
    })!;
    expect(gateGenerated(planText(r)).soft).toContain('补气血');
  });
});

describe('claimsExperience：第一人称经历检测', () => {
  // 判据是时态（了/过）不是动词表 —— 第一版列具体动词，
  // 结果「我用一块板把玄关腾出来了」整句漏掉，这几条是为那次修的
  it('命中真的在声称做过', () => {
    for (const t of [
      '入秋后脸干到卡粉？我停掉了每天敷面膜',
      '我用一块板把玄关腾出来了',
      '台面永远不够用？我把小家电叠起来放了',
      '秋天早晚温差大，我靠「三层穿法」早上多睡十分钟',
      '油皮防晒怎么选｜我踩过的坑都在这',
      '我的玄关改造记录',
      '搬家之后，我停掉了买收纳盒',
      '我试了三个月，说说真实感受',
    ]) {
      expect(claimsExperience(t), t).toBe(true);
    }
  });

  it('不误报没有声称经历的标题', () => {
    for (const t of [
      '秋天手脚凉的人，先别急着买厚袜子',
      '油皮防晒怎么选｜先看这3个点',
      '不是东西多，是没有固定位置',
      '为什么你的衣柜总是不够用？',
      '越收越乱的家，都有这3个共同点',
      '进门鞋堆成山？先量一下鞋柜深度',
    ]) {
      expect(claimsExperience(t), t).toBe(false);
    }
  });

  it('「我」是宾语时不算 —— 很多人问我，说的不是我做过什么', () => {
    expect(claimsExperience('很多人问我秋天怎么保湿')).toBe(false);
    expect(claimsExperience('闺蜜告诉我的收纳方法，我试了一周')).toBe(false);
  });

  it('没有「我」就一定不是', () => {
    expect(claimsExperience('秋天嗓子干，不一定是水喝少了')).toBe(false);
  });
});

describe('promiseMismatch：标题承诺 N 个点，正文兑现了吗', () => {
  // 实测真遇到的一次：标题「先看这3个维度」，正文列了 ①②③④
  const four = '① 先看质地\n正文\n② 看补涂\n正文\n③ 看底妆\n正文\n④ 别忽略卸妆';

  it('承诺 3 个给了 4 个，要报出来', () => {
    expect(promiseMismatch('油皮防晒怎么选？先看这3个维度', four)).toEqual({
      promised: 3,
      got: 4,
    });
  });

  it('对得上就不报', () => {
    expect(promiseMismatch('先看这4个维度', four)).toBeNull();
  });

  it('中文数字也认', () => {
    expect(promisedCount('三个共同点')).toBe(3);
    expect(promisedCount('两步搞定')).toBe(2);
    expect(promisedCount('十个坑')).toBe(10);
  });

  it('全角数字也认', () => {
    expect(promisedCount('先看这３个点')).toBe(3);
  });

  it('标题没给数字就没得比', () => {
    expect(promiseMismatch('油皮防晒怎么选', four)).toBeNull();
  });

  it('正文没分点也没得比 —— 叙事型本来就不分点', () => {
    expect(promiseMismatch('先看这3个点', '一段没有分点的叙事正文。')).toBeNull();
  });

  it('数分点认 ①②③、1️⃣2️⃣3️⃣ 和行首 1. 2. 3.', () => {
    expect(pointCount('①a\n②b\n③c')).toBe(3);
    expect(pointCount('1️⃣ a\n2️⃣ b')).toBe(2);
    expect(pointCount('1. 第一点\n2. 第二点\n3. 第三点')).toBe(3);
  });

  it('同一个序号重复出现只算一次', () => {
    expect(pointCount('① 第一点\n里面又提到 ①\n② 第二点')).toBe(2);
  });

  it('离谱的数字不当承诺（99个点多半是别的意思）', () => {
    expect(promisedCount('99个点')).toBeNull();
  });
});
