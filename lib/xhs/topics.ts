/**
 * 选题方法论的数据层。
 *
 * 核心判断（playbook.md 第四节）：**选题不是想出来的，是扒出来的。**
 * 业余的做法是「今天写点什么」，专业的做法是反推需求 ——
 * 搜索下拉框、竞品爆文评论区、对标拆解、搜索结果的空缺。
 *
 * 这个工具扒不到小红书的实时数据，所以它的诚实做法是：
 * 把矩阵当作**起点假设**给出来，同时明确告诉用户哪一步必须自己去搜索框里验证，
 * 并给出要搜的具体词。假装自己扒过数据，是这类工具最容易犯的错。
 */

/** 搜同一个词的三种人，动机完全不同 */
export type Motive = 'show' | 'explain' | 'correct';

export interface MotiveMeta {
  id: Motive;
  label: string;
  /** 用户现在是什么状态 */
  state: string;
  /** 内容该怎么定位 */
  positioning: string;
  /** 这类内容的数据长什么样 */
  pattern: string;
  /** 排期顺序：越小越先发 */
  order: number;
  /** 为什么排在这个位置 */
  why: string;
}

/**
 * 排期顺序：外显型打头拉新 → 解释型跟进建立信任 → 纠错型收尾做互动。
 * 新账号尤其先发外显型，它最容易冲过第一级流量池。
 */
export const MOTIVES: readonly MotiveMeta[] = [
  {
    id: 'show',
    label: '外显型',
    state: '在意外观、结果、别人怎么看',
    positioning: '先给看得见的前后差',
    pattern: '互动高，容易起量',
    order: 1,
    why: '最容易冲过第一级流量池，所以打头拉新',
  },
  {
    id: 'explain',
    label: '解释型',
    state: '有具体困扰，但不知道原因',
    positioning: '讲清「为什么」',
    pattern: '收藏高，涨粉慢',
    order: 2,
    why: '跟进建立信任，收藏会持续带长尾',
  },
  {
    id: 'correct',
    label: '纠错型',
    state: '已经踩过坑，对常见做法失望',
    positioning: '推翻一个旧认知',
    pattern: '评论多，容易被转发',
    order: 3,
    why: '收尾做互动，评论权重远高于点赞',
  },
];

export function motiveMeta(id: Motive): MotiveMeta {
  return MOTIVES.find((m) => m.id === id) ?? MOTIVES[0];
}

export function isMotive(x: unknown): x is Motive {
  return MOTIVES.some((m) => m.id === x);
}

/** 切片：主题词本身太大，要拆成「一类人 + 一个具体时刻」 */
export const SLICES: readonly { label: string; how: string }[] = [
  { label: '人群切片', how: '身份 / 年龄段 / 生活阶段（学生、租房、独居、带娃）' },
  { label: '场景切片', how: '工作日 / 周末 / 出差 / 换季 / 特定空间（玄关、厨房）' },
  { label: '物品切片', how: '难处理的具体东西（搜索量往往最高）' },
  { label: '自测切片', how: '「有这几个信号说明……」，收藏率最高的一类' },
  { label: '纠错切片', how: '常见做法为什么没用，最容易起评论' },
  { label: '季节切片', how: '只在真有季节性时用，和发布时间绑定' },
];

/** 爆款选题跑不出的四个母题。一篇笔记最好只服务一个 */
export const MOTHER_THEMES: readonly { label: string; drive: string; forms: string }[] = [
  { label: '省钱', drive: '怕买贵、怕浪费', forms: '平替、避坑、性价比盘点' },
  { label: '变美 / 变强', drive: '想变成更好的自己', forms: '教程、方法论、前后对比' },
  { label: '避坑', drive: '怕踩雷、怕后悔', forms: '测评、翻车复盘、注意事项' },
  { label: '情绪共鸣', drive: '想被理解、想被看见', forms: '生活记录、心路、「原来不止我」' },
];

/** 五条兜底标题公式，和三种动机对应。轮换着用，避免整张表一个句式 */
export const TITLE_FORMULAS: readonly {
  pattern: string;
  motive: Motive | null;
  note: string;
  example: string;
}[] = [
  {
    pattern: '为什么你总是 ___？',
    motive: 'explain',
    note: '痛点直给',
    example: '为什么你的衣柜总是不够用？',
  },
  {
    pattern: '不是 ___，是 ___',
    motive: 'correct',
    note: '推翻旧认知',
    example: '不是东西多，是没有固定位置',
  },
  {
    pattern: '___ 的人，都有这 3 个共同点',
    motive: 'show',
    note: '自测型，收藏率最高',
    example: '越收越乱的家，都有这3个共同点',
  },
  {
    pattern: '先别急着 ___，可能是 ___',
    motive: 'correct',
    note: '降低对抗感',
    example: '先别急着买收纳盒，可能是动线错了',
  },
  {
    pattern: '___ 之后，我停掉了 ___',
    motive: null,
    note: '个人叙述型，**必须真实**，用户没有真实经历就别用',
    example: '搬家之后，我停掉了买收纳盒',
  },
];

/**
 * 选题库末尾的通用落地结构（cards.md 的「单一时刻」骨架）。
 * 用户挑中一条就能照着做。
 */
export const LANDING_CARDS: readonly { slot: string; what: string }[] = [
  { slot: '封面', what: '一句最扎心的判断句' },
  { slot: '内页1', what: '具体场景，让同类人一眼认领' },
  { slot: '内页2', what: '为什么会这样，一句原因讲透' },
  { slot: '内页3', what: '2–3 个日常做法' },
  { slot: '内页4', what: '提醒边界 + 引导收藏/评论' },
];

/**
 * 去小红书验证的四个动作。
 *
 * 这是整个工具最该说实话的地方：下面这张矩阵是**推出来的假设**，
 * 不是扒出来的数据。需求有没有被验证过，只有搜索框知道。
 */
export const VERIFY_STEPS: readonly { action: string; why: string }[] = [
  {
    action: '在小红书搜核心词，看下拉联想词',
    why: '联想词就是真实需求的原话，比任何推测都准',
  },
  {
    action: '翻同赛道爆文的评论区，看大家在问什么',
    why: '最高质量的选题源：需求已被验证，而且是用户自己的措辞',
  },
  {
    action: '找 10 篇爆文，拆标题结构 / 封面 / 骨架 / 评论区高赞问题',
    why: '看共性，不是看单篇',
  },
  {
    action: '看搜索结果里哪个角度没人讲透',
    why: '前排笔记都没讲到的角度，就是机会',
  },
];

/**
 * 第一人称经历口吻的检测。
 *
 * topics.md 第四节对「___ 之后，我停掉了 ___」这类句式有一条硬规矩：
 * **必须用户真有这段经历，没有就别替他编。** 实测下来模型做不到这一条 ——
 * 给它一个光秃秃的主题词，它照样吐出「我停掉了每天敷面膜」
 * 「我用一块板把玄关腾出来了」。
 *
 * 这不是模型能自查的事（它不知道用户做没做过），所以交给代码查，
 * 把这类标题挑出来提醒一句：只有你真做过才用。
 * 和词表一个道理：判断写进代码，不留给临场发挥。
 *
 * 判据是时态而不是动词表 —— 第一版列了「停掉/换了/试了」这些具体动词，
 * 结果「我用一块板把玄关腾出来了」整句漏掉。中文里声称做过靠的是「了」「过」，
 * 不是某个特定动词。
 */

/** 这些结构里「我」是宾语，说的是别人对我做了什么，不是我做过什么 */
const OBJECT_MARKERS = [
  '问我', '告诉我', '给我', '帮我', '让我', '跟我', '和我', '对我',
  '教我', '劝我', '带我', '陪我', '找我', '骂我', '说我',
] as const;

/** 没有「了/过」但动作已经很明确的几个开头 */
const BARE_VERBS = ['靠', '自己试', '亲测', '实测'] as const;

/** 这条标题是不是在声称「我亲身做过」 */
export function claimsExperience(title: string): boolean {
  const at = title.indexOf('我');
  if (at < 0) return false;
  // 「很多人问我秋天怎么保湿」—— 这里的「我」是被问的那个人，不是在讲经历
  if (OBJECT_MARKERS.some((m) => title.includes(m))) return false;

  const tail = title.slice(at);
  // 「我的玄关改造记录」：所有格 + 名词，同样是在讲自己的事
  if (tail.startsWith('我的')) return true;
  // 「我……了」「我……过」：中文里声称做过的标准标记
  if (/[了过]/.test(tail.slice(1))) return true;

  return BARE_VERBS.some((v) => tail.slice(1, 6).includes(v));
}
