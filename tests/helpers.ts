import type { Measurer } from '@/lib/cards/linebreak';

/**
 * 假测量器：中文字符宽度等于字号（Noto Sans SC 的汉字确实是 1em），
 * 拉丁字符按半个字号算。于是断行与分页规则可以在 node 下精确断言。
 */
export const fakeMeasurer: Measurer = (font, text) => {
  const fs = Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
  let w = 0;
  for (const ch of text) w += /[\x00-\xff]/.test(ch) ? fs / 2 : fs;
  return w;
};

export const FONT = 'TestFont, sans-serif';
