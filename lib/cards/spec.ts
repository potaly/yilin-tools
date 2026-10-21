/**
 * 长文图卡的视觉参数。
 * 所有数值以 1080px 宽的画布为基准，来自 reference/longform-cards.html。
 *
 * 注意：原型把颜色和排版参数混在同一个对象里，且 title / h2 两个键各出现两次，
 * 后面的排版参数对象覆盖了前面的颜色字符串，导致标题颜色实际失效。
 * 这里拆成 COLORS 与 METRICS 两组，颜色以需求文档的规格表为准。
 */

export type Density = 'loose' | 'standard' | 'compact';
export type Ratio = '3:5' | '3:4';
export type BlockKind = 'title' | 'h2' | 'p';

export const CANVAS = {
  w: 1080,
  mx: 66,
  top: 100,
  bottom: 110,
  firstTopNoMeta: 170,
  metaY: 250,
  ruleY: 300,
  afterRule: 70,
} as const;

export const RATIO_HEIGHT: Record<Ratio, number> = {
  '3:5': 1800,
  '3:4': 1440,
};

export const FALLBACK_FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

/** 单一层级的排版参数 */
export interface KindMetrics {
  /** 字号 */
  fs: number;
  /** 行高 */
  lh: number;
  /** 段前距 */
  before: number;
  /** 段后距 */
  after: number;
  /** 字重 */
  w: number;
  /** 加粗字重（仅正文用） */
  bw: number;
}

export interface Metrics {
  title: KindMetrics;
  h2: KindMetrics;
  p: KindMetrics;
}

/** 大标题三档密度下保持一致 */
const TITLE: KindMetrics = { fs: 128, lh: 170, before: 90, after: 76, w: 900, bw: 900 };

export const DENSITY_METRICS: Record<Density, Metrics> = {
  loose: {
    title: TITLE,
    h2: { fs: 70, lh: 98, before: 120, after: 34, w: 900, bw: 900 },
    p: { fs: 38, lh: 78, before: 52, after: 0, w: 500, bw: 900 },
  },
  standard: {
    title: TITLE,
    h2: { fs: 70, lh: 98, before: 116, after: 30, w: 900, bw: 900 },
    p: { fs: 35, lh: 70, before: 44, after: 0, w: 500, bw: 900 },
  },
  compact: {
    title: TITLE,
    h2: { fs: 70, lh: 98, before: 96, after: 24, w: 900, bw: 900 },
    p: { fs: 32, lh: 60, before: 32, after: 0, w: 500, bw: 900 },
  },
};

export const DENSITY_LABEL: Record<Density, string> = {
  loose: '宽松',
  standard: '标准',
  compact: '紧凑',
};

export function metricsFor(density: Density): Metrics {
  return DENSITY_METRICS[density];
}

/** 按字数自动选密度：≤800 宽松，800–2500 标准，>2500 紧凑 */
export function autoDensity(words: number): Density {
  if (words <= 800) return 'loose';
  if (words <= 2500) return 'standard';
  return 'compact';
}

/** 阅读时长：字数 ÷ 450 向上取整，至少 1 分钟 */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 450));
}

export function isDensity(v: unknown): v is Density {
  return v === 'loose' || v === 'standard' || v === 'compact';
}
