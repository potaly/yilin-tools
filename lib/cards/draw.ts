/** 把分页产出的绘制指令画到 canvas 上 */

import { fontOf } from './linebreak';
import type { PageOp } from './paginate';
import { CANVAS, COLORS, type Metrics } from './spec';

export interface DrawInfo {
  words: number;
  minutes: number;
}

export interface DrawOptions {
  height: number;
  info: DrawInfo;
  metrics: Metrics;
  fontFamily: string;
}

export function drawPage(ops: PageOp[], opts: DrawOptions): HTMLCanvasElement {
  const { height, info, metrics, fontFamily } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS.w;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const maxW = CANVAS.w - 2 * CANVAS.mx;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CANVAS.w, height);
  ctx.textBaseline = 'middle';

  for (const op of ops) {
    if (op.type === 'meta') {
      drawClock(ctx, CANVAS.mx, op.cy);
      ctx.font = fontOf(700, 32, fontFamily);
      ctx.fillStyle = COLORS.meta;
      ctx.fillText(
        `全文${info.words}字 ｜ 阅读需要${info.minutes}分钟`,
        CANVAS.mx + 44,
        op.cy + 1,
      );
    } else if (op.type === 'rule') {
      ctx.fillStyle = COLORS.rule;
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

      if (op.kind === 'title') {
        const textW = op.line.w + gap * Math.max(0, n - 1);
        const barW = op.justify && gap ? maxW : Math.min(maxW, textW + spec.fs * 0.55);
        ctx.fillStyle = COLORS.bar;
        ctx.fillRect(CANVAS.mx, op.cy + spec.fs * 0.17, barW, spec.fs * 0.33);
      }

      let x = CANVAS.mx;
      for (const u of units) {
        if (!u.space) {
          ctx.font = u.font;
          ctx.fillStyle = u.color;
          ctx.fillText(u.t, x, op.cy);
        }
        x += u.w + gap;
      }
    }
  }

  return canvas;
}

/** 顶部信息左边的时钟图标 */
function drawClock(ctx: CanvasRenderingContext2D, left: number, cy: number) {
  const r = 14;
  const cx = left + r;
  ctx.strokeStyle = COLORS.meta;
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
