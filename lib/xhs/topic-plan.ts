/**
 * 选题矩阵结果的校验。
 *
 * 这里也做一件代码该做、模型做不好的事：**按排期顺序给整张表排序**。
 * 外显型打头拉新 → 解释型跟进 → 纠错型收尾（topics.ts 的 MOTIVES.order）。
 * 模型按切片分组输出，用户真正要的是「先发哪几条」，这是两个不同的排法，
 * 所以两个都给：矩阵按组看，建议排期按动机排。
 */

import { claimsExperience, isMotive, motiveMeta, type Motive } from './topics';

export interface TopicItem {
  title: string;
  motive: Motive;
  scene: string;
  why: string;
  actions: string[];
  /** 标题在声称「我亲身做过」。代码判的，用来提醒用户别照搬别人的经历 */
  claimsExperience: boolean;
}

export interface TopicGroup {
  slice: string;
  value: string;
  items: TopicItem[];
}

export interface Formula {
  pattern: string;
  example: string;
}

export interface TopicPlan {
  intro: string;
  groups: TopicGroup[];
  formulas: Formula[];
  searchTerms: string[];
  boundaries: string[];
  /** 总条数 */
  count: number;
  /** 按排期顺序挑出来的前几条：先发这些 */
  firstUp: { item: TopicItem; group: string }[];
  /** 声称亲身经历的那几条，要提醒用户「只有你真做过才用」 */
  needsRealExperience: string[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).map((s) => s.trim()).filter(Boolean).slice(0, max);
}

/** 建议先发几条 */
const FIRST_UP = 3;

export function validateTopicPlan(json: unknown): TopicPlan | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  if (!Array.isArray(raw.groups)) return null;

  const groups: TopicGroup[] = [];
  for (const g of raw.groups.slice(0, 8)) {
    if (!g || typeof g !== 'object') continue;
    const group = g as Record<string, unknown>;
    const slice = str(group.slice).trim();
    if (!slice || !Array.isArray(group.items)) continue;

    const items: TopicItem[] = [];
    for (const i of group.items.slice(0, 6)) {
      if (!i || typeof i !== 'object') continue;
      const item = i as Record<string, unknown>;
      const title = str(item.title).trim();
      if (!title) continue;
      items.push({
        title,
        motive: isMotive(item.motive) ? item.motive : 'explain',
        scene: str(item.scene).trim(),
        why: str(item.why).trim(),
        actions: strList(item.actions, 4),
        claimsExperience: claimsExperience(title),
      });
    }
    if (!items.length) continue;
    groups.push({ slice, value: str(group.value).trim(), items });
  }

  if (!groups.length) return null;

  const formulas: Formula[] = [];
  if (Array.isArray(raw.formulas)) {
    for (const f of raw.formulas.slice(0, 4)) {
      if (!f || typeof f !== 'object') continue;
      const item = f as Record<string, unknown>;
      const pattern = str(item.pattern).trim();
      if (!pattern) continue;
      formulas.push({ pattern, example: str(item.example).trim() });
    }
  }

  const flat = groups.flatMap((g) => g.items.map((item) => ({ item, group: g.slice })));

  return {
    intro: str(raw.intro).trim(),
    groups,
    formulas,
    searchTerms: strList(raw.searchTerms, 6),
    boundaries: strList(raw.boundaries, 5),
    count: flat.length,
    firstUp: pickFirstUp(flat),
    needsRealExperience: flat
      .filter(({ item }) => item.claimsExperience)
      .map(({ item }) => item.title),
  };
}

/**
 * 按排期顺序排：外显 → 解释 → 纠错。
 *
 * 同一种动机内部保持模型给的顺序（它是按切片组织的，组内有自己的逻辑），
 * 所以用稳定排序，只按 order 比较。
 */
export function sortBySchedule<T extends { item: TopicItem }>(list: T[]): T[] {
  return [...list].sort((a, b) => motiveMeta(a.item.motive).order - motiveMeta(b.item.motive).order);
}

/**
 * 挑「建议先发」的几条。
 *
 * 排期顺序决定大方向（外显型打头拉新），但光按顺序取前三条会取到同一组里 ——
 * 实测「秋季养生」时三条全是「气色与状态」组的，连发三篇会很重样，
 * 而账号连续几篇本来就该错开（playbook 第五节：乱发稀释标签，重样则没新意）。
 * 所以同一种动机内部优先跨组，组不够了再回头取同组的。
 */
export function pickFirstUp<T extends { item: TopicItem; group: string }>(list: T[]): T[] {
  const ordered = sortBySchedule(list);
  const used = new Set<string>();
  const picked: T[] = [];

  for (const row of ordered) {
    if (picked.length >= FIRST_UP) break;
    if (used.has(row.group)) continue;
    used.add(row.group);
    picked.push(row);
  }

  // 组数不够 FIRST_UP 时，按顺序补齐
  for (const row of ordered) {
    if (picked.length >= FIRST_UP) break;
    if (!picked.includes(row)) picked.push(row);
  }

  return picked;
}

/** 一次生成里所有新写出来的文本，喂给生成闸门 */
export function generatedText(plan: TopicPlan): string {
  return [
    plan.intro,
    ...plan.groups.flatMap((g) => [
      g.slice,
      g.value,
      ...g.items.flatMap((i) => [i.title, i.scene, i.why, ...i.actions]),
    ]),
    ...plan.formulas.flatMap((f) => [f.pattern, f.example]),
  ].join('\n');
}
