/**
 * 文案生成结果的校验与重算。
 *
 * 模型给的每一个数字都不信：单位数、核心词位置、正文字符数全部在这里重算。
 * 它只提供文本和意图（冲什么、什么结构、为什么），其余都是代码的事。
 */

import { isGoal, isStructure, scoreTitle, type ScoredTitle, type TitleGoal } from './title';
import { measure, type Limits } from './units';

/** 标签的四层里前三层。第四层「当下正在爆的话题」不让模型编，所以没有 */
export type TagLayer = 'broad' | 'niche' | 'scene';

export const TAG_LAYERS: Record<TagLayer, { label: string; what: string }> = {
  broad: { label: '大流量词', what: '拿基础曝光' },
  niche: { label: '精准垂类词', what: '找对人' },
  scene: { label: '场景/人群词', what: '蹭已有流量池' },
};

export interface Tag {
  text: string;
  layer: TagLayer;
}

export interface CopyResult {
  titles: ScoredTitle[];
  /** 推荐第几个候选，下标 */
  recommend: number;
  recommendWhy: string;
  body: string;
  tags: Tag[];
  /** 因为没素材而降级表述的地方 */
  downgraded: string[];
  note: string;
  /** 正文 + 标签拼起来之后的额度，代码算的 */
  limits: Limits;
  /** 拼好的、可以直接复制走的正文（含标签行） */
  fullBody: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).map((s) => s.trim()).filter(Boolean).slice(0, max);
}

function isLayer(x: unknown): x is TagLayer {
  return x === 'broad' || x === 'niche' || x === 'scene';
}

/** 标签拼成正文最后一行。标签算在正文额度里，所以必须和正文一起量 */
export function joinBody(body: string, tags: Tag[]): string {
  const line = tags.map((t) => `#${t.text}`).join(' ');
  return line ? `${body.trim()}\n\n${line}` : body.trim();
}

/**
 * 校验并重算。结构不合法返回 null，由上层重试。
 *
 * @param keyword 搜索型笔记的核心词，用来算每个候选里它落在第几个字
 */
export function validateCopy(json: unknown, keyword: string): CopyResult | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;

  const body = str(raw.body).trim();
  if (!body) return null;

  const titles: ScoredTitle[] = [];
  if (Array.isArray(raw.titles)) {
    for (const item of raw.titles.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue;
      const t = item as Record<string, unknown>;
      const text = str(t.text).trim();
      if (!text) continue;
      titles.push(
        scoreTitle(
          text,
          keyword,
          isGoal(t.goal) ? (t.goal as TitleGoal) : 'collect',
          isStructure(t.structure) ? t.structure : null,
          str(t.why).trim()
        )
      );
    }
  }
  if (!titles.length) return null;

  const tags: Tag[] = [];
  if (Array.isArray(raw.tags)) {
    for (const item of raw.tags.slice(0, 10)) {
      if (!item || typeof item !== 'object') continue;
      const t = item as Record<string, unknown>;
      // 模型偶尔会把 # 带进来，去掉再算，否则额度会多算一遍
      const text = str(t.text).trim().replace(/^#+/, '');
      if (!text) continue;
      tags.push({ text, layer: isLayer(t.layer) ? t.layer : 'niche' });
    }
  }

  const recommendRaw = Number(raw.recommend);
  const recommend =
    Number.isInteger(recommendRaw) && recommendRaw >= 0 && recommendRaw < titles.length
      ? recommendRaw
      : 0;

  const fullBody = joinBody(body, tags);

  return {
    titles,
    recommend,
    recommendWhy: str(raw.recommendWhy).trim(),
    body,
    tags,
    downgraded: strList(raw.downgraded, 6),
    note: str(raw.note).trim(),
    limits: measure(titles[recommend].text, fullBody),
    fullBody,
  };
}

/** 一次生成里所有新写出来的文本，喂给生成闸门 */
export function generatedText(result: CopyResult): string {
  return [...result.titles.map((t) => t.text), result.fullBody].join('\n');
}

/** 候选里有多少条是真能用的（没超限、搜索型的有核心词） */
export function usableTitles(result: CopyResult, needKeyword: boolean): number {
  return result.titles.filter((t) => t.over === 0 && (!needKeyword || t.keywordAt !== null))
    .length;
}

/* ---------- 标题承诺 vs 正文兑现 ---------- */

const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 标题里「3个点」「三个维度」这类承诺的数量；没有承诺返回 null */
export function promisedCount(title: string): number | null {
  const m = title.match(/([0-9０-９]+|[一二三四五六七八九十两])\s*(个|点|条|步|招|维度|件|种|样|层|式)/);
  if (!m) return null;

  const raw = m[1];
  if (raw in CN_DIGITS) return CN_DIGITS[raw];
  // 全角数字也要认，用户从别处粘过来常带全角
  const n = Number(raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : null;
}

/** 正文里分点的个数。认 ①②③、1️⃣2️⃣3️⃣ 和行首的 1. 2. 3. */
export function pointCount(body: string): number {
  const circled = new Set(body.match(/[①-⑳]/g) ?? []);
  if (circled.size) return circled.size;

  const keycap = new Set(body.match(/[0-9]️?⃣/g) ?? []);
  if (keycap.size) return keycap.size;

  const numbered = new Set(
    (body.match(/^\s*(\d{1,2})[.、)）]\s*\S/gm) ?? []).map((s) => s.trim().match(/^\d+/)?.[0])
  );
  return numbered.size;
}

/**
 * 标题承诺了 N 个点，正文给了几个？
 *
 * 这是「点击率正常但互动率低」最常见的成因（playbook 第六节四级漏斗）：
 * 标题承诺的东西正文没给，读者点进来发现对不上，三秒就走。
 *
 * 实测模型真会犯：标题写「先看这3个维度」，正文列了 ①②③④ 四个。
 * 它自己不会回头数，所以交给代码数 —— 和单位数一个道理。
 * 返回 null 表示没有可比的承诺（标题没给数字，或正文没分点）。
 */
export function promiseMismatch(title: string, body: string): { promised: number; got: number } | null {
  const promised = promisedCount(title);
  if (promised === null) return null;
  const got = pointCount(body);
  if (got === 0) return null;
  return promised === got ? null : { promised, got };
}
