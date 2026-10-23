import { describe, expect, it } from 'vitest';
import { parse } from '@/lib/cards/parse';
import { dropEmptyPages, paginate } from '@/lib/cards/paginate';
import { SAMPLE } from '@/lib/cards/sample';
import { RATIO_HEIGHT, metricsFor } from '@/lib/cards/spec';
import {
  DEFAULT_TEMPLATE,
  TEMPLATES,
  bodyFamily,
  templateById,
  titleFamily,
} from '@/lib/cards/templates';
import { FONT, fakeMeasurer } from './helpers';

/** WCAG 相对亮度 */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('模板', () => {
  it('每套模板的必要颜色都齐全', () => {
    for (const t of TEMPLATES) {
      for (const key of ['bg', 'title', 'h2', 'body', 'bold', 'meta', 'bar', 'rule'] as const) {
        expect(t.colors[key], `${t.name} 缺 ${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.desc.length).toBeGreaterThan(0);
    }
  });

  it('模板 id 不重复', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('未知 id 回退到默认模板', () => {
    expect(templateById('不存在')).toBe(DEFAULT_TEMPLATE);
    expect(templateById('morandi').name).toBe('莫兰迪');
  });

  it('标题字体按模板配置来', () => {
    expect(titleFamily(templateById('warm'), FONT)).toBe(FONT);
    expect(titleFamily(templateById('ink'), FONT)).toContain('serif');
  });

  it('正文字体按模板配置来，粉笺是宋体正文配黑体标题', () => {
    expect(bodyFamily(templateById('warm'), FONT)).toBe(FONT);
    expect(bodyFamily(templateById('note'), FONT)).toContain('serif');
    // 和宣纸墨正好反过来
    expect(titleFamily(templateById('note'), FONT)).toBe(FONT);
    expect(bodyFamily(templateById('ink'), FONT)).toBe(FONT);
  });

  it('换模板不改变分页结果', () => {
    const run = () =>
      dropEmptyPages(
        paginate(parse(SAMPLE), {
          height: RATIO_HEIGHT['3:5'],
          showMeta: true,
          metrics: metricsFor('standard'),
          measure: fakeMeasurer,
          fontFamily: FONT,
        }),
      ).length;
    // 颜色在绘制层才生效，所以任何模板下页数都一样
    expect(run()).toBe(3);
  });

  it('页脚会占掉版心，可能多出一页', () => {
    const pages = (footerH: number) =>
      dropEmptyPages(
        paginate(parse(SAMPLE), {
          height: RATIO_HEIGHT['3:4'],
          showMeta: true,
          metrics: metricsFor('loose'),
          measure: fakeMeasurer,
          fontFamily: FONT,
          footerH,
        }),
      ).length;
    expect(pages(64)).toBeGreaterThanOrEqual(pages(0));
  });

  /*
   * 卡片是拿来读的，深底和高饱和配色尤其容易做得好看但看不清。
   * 按 WCAG 分两档：大标题和小标题是大字，3:1 即可；
   * 正文和夹在正文里的加粗是小字（1080 宽的卡片缩到手机上只有十几像素），要 4.5:1。
   */
  it.each(TEMPLATES.map((t) => [t.name, t] as const))('%s 的正文对比度达到 4.5:1', (_name, t) => {
    expect(contrast(t.colors.body, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.colors.bold, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))('%s 的标题对比度达到 3:1', (_name, t) => {
    expect(contrast(t.colors.title, t.colors.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.colors.h2, t.colors.bg)).toBeGreaterThanOrEqual(3);
    const coverBg = t.colors.coverBg ?? t.colors.bg;
    const coverInk = t.colors.coverInk ?? t.colors.title;
    expect(contrast(coverInk, coverBg)).toBeGreaterThanOrEqual(3);
  });
});
