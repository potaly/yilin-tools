/**
 * 独立封面页：小红书的首图决定点击率，所以单独做一页，
 * 只放大标题、一句副标题和署名，正文从第二页开始。
 */

import { breakLines, fontOf, tokenize, type Measurer } from './linebreak';
import { CANVAS, type Metrics } from './spec';
import type { FooterOptions, Template } from './templates';

export interface CoverOptions {
  height: number;
  title: string;
  subtitle: string;
  /** 字数与阅读时长，只有需要顶部信息条的模板会用 */
  info?: { words: number; minutes: number };
  template: Template;
  footer: FooterOptions;
  fontFamily: string;
  titleFontFamily: string;
  measure: Measurer;
}

/** 标题越长字号越小，保证不超过 5 行 */
const TITLE_SIZES = [128, 112, 96, 82, 70];

export function drawCover(opts: CoverOptions): HTMLCanvasElement {
  const { height, title, subtitle, template, footer, titleFontFamily, fontFamily, measure } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS.w;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const colors = template.colors;
  const bg = colors.coverBg ?? colors.bg;
  const ink = colors.coverInk ?? colors.title;
  const maxW = CANVAS.w - 2 * CANVAS.mx;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS.w, height);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  if (template.marginRule) {
    ctx.fillStyle = colors.rule;
    ctx.fillRect(CANVAS.mx - 26, 0, 2, height);
  }

  // 顶部信息条：字数在左、署名在右，下面一条细线（和正文页同一个样式）
  let topUsed = 0;
  if (template.authorAt === 'meta' && (opts.info || footer.author.trim())) {
    const cy = CANVAS.metaY - 60;
    ctx.font = fontOf(500, 32, fontFamily);
    ctx.fillStyle = colors.meta;
    if (opts.info) {
      ctx.fillText(`全文${opts.info.words}字 ｜ 阅读需要${opts.info.minutes}分钟`, CANVAS.mx, cy);
    }
    const author = footer.author.trim();
    if (author) {
      ctx.textAlign = 'right';
      ctx.fillText(author, CANVAS.w - CANVAS.mx, cy);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = colors.rule;
    ctx.fillRect(CANVAS.mx, cy + 36, CANVAS.w - 2 * CANVAS.mx, 2);
    topUsed = cy + 36;
  }

  // 选一个能放下的字号
  let fs = TITLE_SIZES[TITLE_SIZES.length - 1];
  let lines = [] as ReturnType<typeof breakLines>;
  for (const size of TITLE_SIZES) {
    const metrics = coverMetrics(size);
    const candidate = breakLines(
      tokenize(title, 'title', metrics, measure, titleFontFamily),
      maxW,
    );
    if (candidate.length <= 5) {
      fs = size;
      lines = candidate;
      break;
    }
    fs = size;
    lines = candidate;
  }

  const lh = Math.round(fs * 1.34);
  const blockH = lines.length * lh;
  let y = Math.round((height - blockH) / 2 - height * 0.04);
  if (topUsed) y = Math.max(y, topUsed + 96);

  // 标题上方一道短线，给封面一个视觉起点
  ctx.fillStyle = ink;
  ctx.fillRect(CANVAS.mx, y - 72, 96, 8);

  for (const line of lines) {
    ctx.font = fontOf(900, fs, titleFontFamily);
    ctx.fillStyle = ink;
    let x = CANVAS.mx;
    for (const u of line.units) {
      if (!u.space) ctx.fillText(u.t, x, y + lh / 2);
      x += u.w;
    }
    y += lh;
  }

  if (subtitle.trim()) {
    ctx.font = fontOf(500, 38, fontFamily);
    ctx.fillStyle = withAlpha(ink, 0.72);
    const subLines = breakLines(
      tokenize(subtitle.trim(), 'p', coverMetrics(38), measure, fontFamily),
      maxW,
    ).slice(0, 2);
    let sy = y + 52;
    for (const line of subLines) {
      let x = CANVAS.mx;
      for (const u of line.units) {
        if (!u.space) ctx.fillText(u.t, x, sy);
        x += u.w;
      }
      sy += 60;
    }
  }

  // 署名已经放到顶部的模板，底部就不再重复一次
  const author = template.authorAt === 'meta' ? '' : footer.author.trim();
  if (author) {
    ctx.font = fontOf(500, 30, fontFamily);
    ctx.fillStyle = withAlpha(ink, 0.6);
    ctx.fillText(author, CANVAS.mx, height - 92);
  }

  return canvas;
}

function coverMetrics(fs: number): Metrics {
  const one = { fs, lh: Math.round(fs * 1.34), before: 0, after: 0, w: 900, bw: 900 };
  return { title: one, h2: one, p: { ...one, w: 500, bw: 700 } };
}

/** 把 #RRGGBB 调成半透明，用于副标题和署名 */
function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
