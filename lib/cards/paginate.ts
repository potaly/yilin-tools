/**
 * 分页：把 blocks 排成一页一页的「绘制指令」，不碰 canvas。
 * 这样页数、断行与每行的 y 坐标都能在单元测试里直接断言。
 */

import { breakLines, tokenize, type Line, type Measurer } from './linebreak';
import type { Block } from './parse';
import { CANVAS, type BlockKind, type Metrics } from './spec';

export type PageOp =
  | { type: 'meta'; cy: number }
  | { type: 'rule'; y: number }
  | { type: 'line'; kind: BlockKind; line: Line; cy: number; justify: boolean };

export interface PaginateOptions {
  height: number;
  showMeta: boolean;
  metrics: Metrics;
  measure: Measurer;
  fontFamily: string;
  /** 衬线模板的标题字体族，不给就跟正文一致 */
  titleFontFamily?: string;
  /** 顶部留给页脚的高度，用于缩短可用版心 */
  footerH?: number;
}

export function paginate(blocks: Block[], opts: PaginateOptions): PageOp[][] {
  const { height, showMeta, metrics, measure, fontFamily } = opts;
  const titleFamily = opts.titleFontFamily || fontFamily;
  const maxW = CANVAS.w - 2 * CANVAS.mx;
  const bottom = height - CANVAS.bottom - (opts.footerH ?? 0);
  const pages: PageOp[][] = [];

  let ops: PageOp[] = [];
  let y: number;
  let empty = true;

  if (showMeta) {
    ops.push({ type: 'meta', cy: CANVAS.metaY }, { type: 'rule', y: CANVAS.ruleY });
    y = CANVAS.ruleY + CANVAS.afterRule;
  } else {
    y = CANVAS.firstTopNoMeta;
  }

  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = CANVAS.top;
    empty = true;
  };

  let prevAfter = 0;

  for (const b of blocks) {
    const spec = metrics[b.type];
    const family = b.type === 'p' ? fontFamily : titleFamily;
    const lines = breakLines(tokenize(b.text, b.type, metrics, measure, family), maxW);
    if (!lines.length) continue;

    let before = empty ? 0 : spec.before + prevAfter;

    // 小标题要和后面至少两行正文同页；段落首行不单独留在页底
    const keepH =
      b.type === 'p'
        ? spec.lh * Math.min(2, lines.length)
        : lines.length * spec.lh + spec.after + metrics.p.before + metrics.p.lh * 2;

    if (!empty && y + before + keepH > bottom) {
      newPage();
      before = 0;
    }
    y += before;

    lines.forEach((line, i) => {
      if (y + spec.lh > bottom && !empty) newPage();
      ops.push({
        type: 'line',
        kind: b.type,
        line,
        cy: y + spec.lh / 2,
        justify: i < lines.length - 1,
      });
      y += spec.lh;
      empty = false;
    });

    prevAfter = spec.after;
  }

  pages.push(ops);
  return pages;
}

/** 丢掉尾部的空页，但始终保留第一页 */
export function dropEmptyPages(pages: PageOp[][]): PageOp[][] {
  return pages.filter((p, i) => i === 0 || p.some((op) => op.type === 'line'));
}
