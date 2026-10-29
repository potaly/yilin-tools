/**
 * 标题候选的代码侧计算。
 *
 * 和第一块同一个原则：**模型负责想，代码负责算。**
 * 单位数（全角 1 半角 0.5）和核心词位置这两件事模型算不准 ——
 * 它会把「SPF50」数成 5 个单位，会把「第 3 字」说成「第 2 字」。
 * 所以模型只给标题文本和它的意图，数字一律在这里重算，前端显示的是重算结果。
 *
 * 另一条来自 copywriting.md 的产品判断：**候选按「冲什么」分组，
 * 不按修辞手法罗列。** 用户要做的是业务决定（这个标题能换来什么），
 * 不是修辞选择。市面上的工具给你十个标题让你挑，但没有一个告诉你
 * 每个标题在赌什么 —— 差别就在这里。
 */

import { KEYWORD_HEAD, TITLE_MAX_UNITS, titleUnits } from './units';

/** 这个标题在冲什么。用户真正要做的决定 */
export type TitleGoal = 'collect' | 'traffic' | 'follow';

/** 这篇主要吃搜索流量还是发现页流量。两者的标题写法几乎相反 */
export type TrafficType = 'search' | 'discover';

export type TitleStructure =
  | 'keyword-first'
  | 'counter'
  | 'pain-first'
  | 'number-result'
  | 'identity'
  | 'loss-aversion';

export interface GoalMeta {
  id: TitleGoal;
  label: string;
  /** 这类目标要的是什么 */
  wants: string;
  /** 对应的标题打法 */
  how: string;
}

export const GOALS: readonly GoalMeta[] = [
  {
    id: 'collect',
    label: '冲收藏',
    wants: '长尾搜索、高收藏',
    how: '关键词前置 + 确定性承诺（"3个点""照着对一遍"）',
  },
  {
    id: 'traffic',
    label: '冲流量',
    wants: '高点击率、转发',
    how: '反常识 / 损失规避，制造认知冲突',
  },
  {
    id: 'follow',
    label: '冲涨粉',
    wants: '立人设、拉评论',
    how: '身份锚定 + 个人经验背书（"踩了3年坑"）',
  },
];

export interface StructureMeta {
  id: TitleStructure;
  label: string;
  how: string;
  example: string;
}

/** copywriting.md 的六种结构。候选之间要角度不同，不是同一句话换同义词 */
export const STRUCTURES: readonly StructureMeta[] = [
  {
    id: 'keyword-first',
    label: '关键词前置',
    how: '核心词 + 确定性承诺',
    example: '油皮防晒怎么选｜先看这3个点',
  },
  {
    id: 'counter',
    label: '反常识',
    how: '保住关键词 + 推翻常见认知',
    example: '油皮防晒别只看SPF',
  },
  {
    id: 'pain-first',
    label: '痛点前置',
    how: '先描述症状，再给出路',
    example: '满脸油光？防晒先看这一点',
  },
  {
    id: 'number-result',
    label: '数字 + 结果',
    how: '量化的可得物',
    example: '实测8支防晒，油皮能用的只有3支',
  },
  {
    id: 'identity',
    label: '身份锚定',
    how: '让目标人群对号入座',
    example: '油痘肌姐妹的防晒避雷清单',
  },
  {
    id: 'loss-aversion',
    label: '损失规避',
    how: '不看会付出什么代价',
    example: '防晒买错，一个夏天白涂',
  },
];

export const TRAFFIC_TYPES: readonly { id: TrafficType; label: string; when: string; rule: string }[] = [
  {
    id: 'search',
    label: '搜索型',
    when: '教程、攻略、测评、避坑、「XX 怎么选」',
    rule: '核心词必须前置到标题开头，语言贴近用户实际会输入的搜索词。宁可标题朴素，也不要为了好看牺牲关键词。',
  },
  {
    id: 'discover',
    label: '发现型',
    when: '生活记录、情绪共鸣、好物种草、探店',
    rule: '前半句必须制造停顿，关键词退居其次。吃的是信息流点击。',
  },
];

export function goalMeta(id: TitleGoal): GoalMeta {
  return GOALS.find((g) => g.id === id) ?? GOALS[0];
}

export function structureMeta(id: TitleStructure): StructureMeta | null {
  return STRUCTURES.find((s) => s.id === id) ?? null;
}

export function isGoal(x: unknown): x is TitleGoal {
  return GOALS.some((g) => g.id === x);
}

export function isStructure(x: unknown): x is TitleStructure {
  return STRUCTURES.some((s) => s.id === x);
}

export function isTrafficType(x: unknown): x is TrafficType {
  return TRAFFIC_TYPES.some((t) => t.id === x);
}

/** 一条候选。units / keywordAt / over 三项由代码算，模型说了不算 */
export interface ScoredTitle {
  text: string;
  goal: TitleGoal;
  structure: TitleStructure | null;
  /** 模型给的一句话：为什么这么写 */
  why: string;
  units: number;
  /** 超出 20 单位多少，0 表示没超 */
  over: number;
  /** 核心词落在第几个字（1 起），没出现是 null */
  keywordAt: number | null;
  /** 核心词是否落在前 6 个字内 —— 搜索权重最高的位置 */
  keywordInHead: boolean;
}

/**
 * 给一条候选算分。
 *
 * 核心词位置按**字符**数（和 check_copy.py 的 `title[:6]` 一致），
 * 不是按单位数 —— 这两个口径不同，混用会给出对不上的数字。
 */
export function scoreTitle(
  text: string,
  keyword: string,
  goal: TitleGoal,
  structure: TitleStructure | null,
  why: string
): ScoredTitle {
  const units = titleUnits(text);
  const at = keyword ? text.indexOf(keyword) : -1;

  return {
    text,
    goal,
    structure,
    why,
    units,
    over: Math.max(0, units - TITLE_MAX_UNITS),
    keywordAt: at >= 0 ? at + 1 : null,
    keywordInHead: at >= 0 && at < KEYWORD_HEAD,
  };
}

/** 一句话说清这条候选的三件事，印在候选下面 */
export function describeTitle(t: ScoredTitle, traffic: TrafficType): string {
  const parts = [`${t.units} 单位`];

  if (t.keywordAt !== null) {
    parts.push(`核心词@${t.keywordAt}${t.keywordInHead ? '' : '（偏后）'}`);
  } else if (traffic === 'search') {
    parts.push('没有核心词');
  }

  const s = structureMeta(t.structure as TitleStructure);
  if (s) parts.push(s.label);

  return parts.join(' · ');
}

/**
 * 候选里有没有「必须先处理」的问题。
 *
 * 搜索型笔记标题里没有核心词 = 搜索流量基本拿不到，这是硬问题；
 * 超 20 单位会被截断，也是硬问题。两者都要在界面上直接标红，
 * 不能等用户发出去才发现。
 */
export function titleProblems(t: ScoredTitle, traffic: TrafficType): string[] {
  const out: string[] = [];
  if (t.over > 0) out.push(`超 ${t.over} 单位，发布时会被截断`);
  if (traffic === 'search' && t.keywordAt === null) {
    out.push('标题里没有核心词，搜索流量基本拿不到');
  }
  return out;
}
