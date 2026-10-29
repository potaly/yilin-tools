/**
 * 文案生成的提示词。
 *
 * 三个设计判断，都来自 copywriting.md / playbook.md，不是随手定的：
 *
 * 1. **搜索型还是发现型，是用户的决定，不是模型的猜测。**
 *    这两种标题写法几乎相反（playbook 第一节），谁来做这个判断决定了整篇。
 *    所以它是界面上的第一个选择，提示词里当作已知条件给出去。
 *
 * 2. **标题出候选、按「冲什么」分组。** 标题是整条漏斗最窄的闸，
 *    一次写定等于拿整篇的流量赌一个没有比较对象的直觉。
 *
 * 3. **没有素材就降级表述，绝不编数字。** 要求信息密度会直接诱发编数字，
 *    而编错的具体建议比空话伤害大得多 —— 读者会照着做，评论区也会有人较真。
 */

import { GOALS, STRUCTURES, TRAFFIC_TYPES, type TrafficType } from './title';
import { BODY_MAX_CHARS, KEYWORD_HEAD, TITLE_MAX_UNITS } from './units';
import { DOWNGRADE_EXAMPLES } from './words';

/** 内容形式决定正文骨架（playbook 第八节） */
export const FORMS: readonly { id: string; label: string; skeleton: string }[] = [
  { id: 'knowledge', label: '干货知识', skeleton: 'list' },
  { id: 'tutorial', label: '教程攻略', skeleton: 'narrative' },
  { id: 'goods', label: '好物分享', skeleton: 'narrative' },
  { id: 'listicle', label: '清单合集', skeleton: 'list' },
  { id: 'life', label: '生活记录', skeleton: 'narrative' },
  { id: 'review', label: '对比测评', skeleton: 'list' },
  { id: 'shop', label: '探店打卡', skeleton: 'narrative' },
];

export function formMeta(id: string) {
  return FORMS.find((f) => f.id === id) ?? FORMS[0];
}

export const SYSTEM_PROMPT = `你是替人写小红书笔记的编辑，不是写公文的。你写出来的东西要像一个真人分享经验。

## 标题

出 5–6 个候选，**角度必须不同**，不是同一句话换同义词。
如果五个候选读起来像一个标题的五个版本，说明没做到位，重出。

六种结构，轮着用：

${STRUCTURES.map((s) => `- ${s.label}：${s.how}。例：${s.example}`).join('\n')}

每个候选都要标清**它在冲什么**，这是用户真正要做的业务决定：

${GOALS.map((g) => `- ${g.label}：要的是${g.wants}。打法是${g.how}`).join('\n')}

三类目标都要有候选，不要全堆在一类上。推荐其中一个，说清是"稳"还是"搏点击率"。

标题里最多 1 个 emoji，而且要**替代**文字而不是附加。

## 正文

开头 3 行是信息流预览区，第一屏只看得到这 3 行，决定跳出还是读完：
- 第 1 行承接标题，不要重复标题
- 不寒暄、不铺垫、不要"大家好我是……"
- 直接给结论、给冲突，或给一个具体场景

两副骨架，按内容形式选：
- **叙事型**（经验、方法论、踩坑）：痛点 → 原因 → 解法。
  分步内容用编号小标题，每步三件套：一句反直觉的判断 + 具体做法 + 落到场景的例子
- **干货清单型**（"怎么选""怎么搭""怎么判断"）：痛点一句 → 先说结论 →
  维度①②③，每个维度**做场景分层** → 金句收底

信息密度是这类内容最容易塌的地方。格式漂亮、分点整齐、emoji 到位，
读完却什么都没拿到 —— 这种笔记收藏率很低，因为没有翻回来的理由。所以：
- "怎么选"类**必须做场景分层**。用户搜"怎么选"不是想要一条标准，
  是想知道**他自己这种情况**该选什么
- 每个分点至少有一个具体到可以照做的细节。
  「取一元硬币大小的量，顺着一个方向推开」比「适量涂抹」有用一百倍
- 给品类知识，不只给动作

排版：每段不超过 3 行，段间空行。emoji 当断句符，每个分点开头一个，不要段中乱撒。
第一人称、口语。句子不要太齐，敢放一句五个字的短句。

结尾两件套：一句大实话收底 + 一个**容易回答的具体问题**引导评论。
评论权重远高于点赞，所以不要写"喜欢的话点个赞"。
可以在结尾附近承认一处自己也没搞定的地方，全知全能的稿子不可信。

正文常态 400–650 字符，${BODY_MAX_CHARS} 是上限不是目标。

## 标签

四层搭配，别全用大词：
- 1–2 个大流量词（#护肤 #职场）—— 拿基础曝光
- 2–3 个精准垂类词（#油皮护肤 #应届生求职）—— 找对人
- 1–2 个场景/人群词（#打工人日常 #学生党平价）—— 蹭已有流量池
- 话题词这一层**不要编**。你不知道当下什么话题在爆，编一个假话题名比不写糟

## 绝对不许做的事

**不许编数字。** 原文素材里没有的数字、参数、价格、时长，一个都不要新增。
拿不准就降级成不带数字的表述：

${DOWNGRADE_EXAMPLES.map(([bad, good]) => `  ❌ ${bad}\n  ✅ ${good}`).join('\n')}

**不许用违禁词。** 这是你新写的内容，不是用户的原文，所以绝对化用语
（最好、第一、100%、顶级）、功效宣称（祛湿、补气血、增强免疫力、美白、祛斑、
保本、零风险）、医疗断言（根治、疗效、消炎）一个都不能出现。
要表达类似意思就换成个人体验或场景描述。

**不许写导流内容**：微信号、外链、二维码、"加v""私聊""代购"。

## 输出

只输出 JSON，不要任何解释文字：

{
  "titles": [
    { "text": "标题文字", "goal": "collect|traffic|follow", "structure": "keyword-first|counter|pain-first|number-result|identity|loss-aversion", "why": "一句话：这个标题在赌什么" }
  ],
  "recommend": 0,
  "recommendWhy": "一句话：为什么推荐它，是稳还是搏点击率",
  "body": "正文，段间空行，不要包含标题，也不要包含标签",
  "tags": [ { "text": "标签（不带#）", "layer": "broad|niche|scene" } ],
  "downgraded": ["因为没有素材而降级表述的地方，没有就空数组"],
  "note": "一句话说清这版的角度和骨架选择"
}

titles 给 5–6 条，tags 给 5–7 个。`;

export interface CopyPromptInput {
  topic: string;
  keyword: string;
  traffic: TrafficType;
  form: string;
  /** 用户提供的真实素材，可能为空 */
  material: string;
  /** 重写时把上一版用到的违禁词回传 */
  retry?: string;
}

export function buildUserPrompt(input: CopyPromptInput): string {
  const traffic = TRAFFIC_TYPES.find((t) => t.id === input.traffic) ?? TRAFFIC_TYPES[0];
  const form = formMeta(input.form);
  const parts: string[] = [];

  parts.push(`【主题】${input.topic}`);
  parts.push('');
  parts.push(`【流量策略】${traffic.label} —— 这是用户定的，不要改`);
  parts.push(traffic.rule);

  if (input.traffic === 'search') {
    parts.push(
      `核心关键词是「${input.keyword}」。它必须落在标题前 ${KEYWORD_HEAD} 个字内，` +
        `开头 3 行里要再出现一次，标签里也要有一个同名标签。`
    );
  }

  parts.push('');
  parts.push(`【内容形式】${form.label}`);
  parts.push(
    form.skeleton === 'list'
      ? '用干货清单型骨架：痛点一句 → 先说结论 → 维度①②③做场景分层 → 金句收底'
      : '用叙事型骨架：痛点 → 原因 → 解法，分步内容用编号小标题'
  );

  parts.push('');
  if (input.material.trim()) {
    parts.push('【用户给的素材 —— 正文里的数字和细节只能从这里来】');
    parts.push(input.material.trim());
  } else {
    parts.push('【用户没给素材】');
    parts.push(
      '所以正文里**一个具体数字都不要编**。该用数字的地方全部降级成不带数字的表述，' +
        '并把降级的地方列进 downgraded，好让用户知道哪几处填上他的真实经历会更好。'
    );
  }

  parts.push('');
  parts.push('【硬约束】');
  parts.push(
    `标题 ≤ ${TITLE_MAX_UNITS} 单位（全角 1、半角 0.5）；` +
      `正文 ≤ ${BODY_MAX_CHARS} 字符，**标签占用同一额度**，所以正文写到 650 字符以内最稳。`
  );

  if (input.retry) {
    parts.push('');
    parts.push(`【上一版没过】${input.retry}`);
  }

  return parts.join('\n');
}
