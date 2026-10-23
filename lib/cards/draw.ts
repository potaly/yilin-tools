/** 把分页产出的绘制指令画到 canvas 上。颜色与装饰全部来自模板。 */

import { fontOf } from './linebreak';
import type { PageOp } from './paginate';
import { CANVAS, type BlockKind, type Metrics } from './spec';
import type { FooterOptions, Template } from './templates';

export interface DrawInfo {
  words: number;
  minutes: number;
}

export interface DrawOptions {
  height: number;
  info: DrawInfo;
  metrics: Metrics;
  fontFamily: string;
  titleFontFamily: string;
  template: Template;
  footer: FooterOptions;
  /** 从 1 开始的页码 */
  pageNumber: number;
  pageCount: number;
}

/** 页脚占用的高度，开启时要从版心里扣掉 */
export const FOOTER_H = 64;

export function footerHeight(footer: FooterOptions, template?: Template): number {
  const authorInFooter = template?.authorAt !== 'meta' && Boolean(footer.author.trim());
  return footer.pageNumber || authorInFooter ? FOOTER_H : 0;
}

function colorOf(kind: BlockKind, bold: boolean, t: Template): string {
  if (kind === 'p') return bold ? t.colors.bold : t.colors.body;
  return kind === 'title' ? t.colors.title : t.colors.h2;
}

export function drawPage(ops: PageOp[], opts: DrawOptions): HTMLCanvasElement {
  const { height, info, metrics, fontFamily, template, footer } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS.w;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const maxW = CANVAS.w - 2 * CANVAS.mx;
  ctx.fillStyle = template.colors.bg;
  ctx.fillRect(0, 0, CANVAS.w, height);

  // 笔记本那种页边竖线
  if (template.marginRule) {
    ctx.fillStyle = template.colors.rule;
    ctx.fillRect(CANVAS.mx - 26, 0, 2, height);
  }

  ctx.textBaseline = 'middle';

  for (const op of ops) {
    if (op.type === 'meta') {
      drawClock(ctx, CANVAS.mx, op.cy, template.colors.meta);
      ctx.font = fontOf(700, 32, fontFamily);
      ctx.fillStyle = template.colors.meta;
      ctx.textAlign = 'left';
      ctx.fillText(`全文${info.words}字 ｜ 阅读需要${info.minutes}分钟`, CANVAS.mx + 44, op.cy + 1);

      // 署名跟字数信息同一行、靠右（像手账的页眉）
      const metaAuthor = footer.author.trim();
      if (template.authorAt === 'meta' && metaAuthor) {
        ctx.textAlign = 'right';
        ctx.fillText(metaAuthor, CANVAS.w - CANVAS.mx, op.cy + 1);
        ctx.textAlign = 'left';
      }
    } else if (op.type === 'rule') {
      ctx.fillStyle = template.colors.rule;
      ctx.fillRect(CANVAS.mx, op.y, maxW, 3);
    } else {
      const spec = metrics[op.kind];
      const units = op.line.units;
      const n = units.length;

      // 非末行两端对齐，但字间距超过 0.6 个字号时放弃
      let gap = 0;
      if (op.justify && n > 1) {
        gap = (maxW - op.line.w) / (n - 1);
        if (gap > spec.fs * 0.6) gap = 0;
      }

      if (op.kind === 'title' && template.decor !== 'none') {
        const textW = op.line.w + gap * Math.max(0, n - 1);
        const w = op.justify && gap ? maxW : Math.min(maxW, textW + spec.fs * 0.55);
        ctx.fillStyle = template.colors.bar;
        if (template.decor === 'highlight') {
          ctx.fillRect(CANVAS.mx, op.cy + spec.fs * 0.17, w, spec.fs * 0.33);
        } else {
          ctx.fillRect(CANVAS.mx, op.cy + spec.fs * 0.52, w, 5);
        }
      }

      ctx.textAlign = 'left';
      let x = CANVAS.mx;
      for (const u of units) {
        if (!u.space) {
          ctx.font = u.font;
          ctx.fillStyle = colorOf(op.kind, u.bold, template);
          ctx.fillText(u.t, x, op.cy);
        }
        x += u.w + gap;
      }
    }
  }

  drawFooter(ctx, opts, height);
  return canvas;
}

function drawFooter(ctx: CanvasRenderingContext2D, opts: DrawOptions, height: number) {
  const { footer, template, fontFamily, pageNumber, pageCount } = opts;
  // 署名放到顶部时，页脚就只剩页码
  const author = template.authorAt === 'meta' ? '' : footer.author.trim();
  if (!footer.pageNumber && !author) return;

  const y = height - 58;
  ctx.font = fontOf(500, 28, fontFamily);
  ctx.fillStyle = template.colors.meta;

  if (author) {
    ctx.textAlign = 'left';
    ctx.fillText(author, CANVAS.mx, y);
  }
  if (footer.pageNumber) {
    ctx.textAlign = 'right';
    ctx.fillText(`${pageNumber} / ${pageCount}`, CANVAS.w - CANVAS.mx, y);
  }
  ctx.textAlign = 'left';
}

/** 顶部信息左边的时钟图标 */
function drawClock(ctx: CanvasRenderingContext2D, left: number, cy: number, color: string) {
  const r = 14;
  const cx = left + r;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + 6, cy + 4);
  ctx.stroke();
}
