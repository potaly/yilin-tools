import { describe, expect, it } from 'vitest';
import { breakLines, tokenize } from '@/lib/cards/linebreak';
import { metricsFor } from '@/lib/cards/spec';
import { FONT, fakeMeasurer } from './helpers';

const M = metricsFor('standard');
const FS = M.p.fs; // 35

const lines = (text: string, chars: number) =>
  breakLines(tokenize(text, 'p', M, fakeMeasurer, FONT), chars * FS).map((l) =>
    l.units.map((u) => u.t).join(''),
  );

describe('tokenize', () => {
  it('英文单词与小数各自成一个单元', () => {
    const units = tokenize('用 Figma 做 32.5% 的图', 'p', M, fakeMeasurer, FONT);
    const texts = units.map((u) => u.t);
    expect(texts).toContain('Figma');
    expect(texts).toContain('32.5%');
  });

  it('加粗片段用更重的字重与更深的颜色', () => {
    const units = tokenize('这是**重点**', 'p', M, fakeMeasurer, FONT);
    const bold = units[units.length - 1];
    expect(bold.font).toContain(`${M.p.bw}`);
    expect(bold.color).toBe('#76390F');
  });
});

describe('breakLines 避头尾', () => {
  it('标点不会出现在行首', () => {
    expect(lines('你好，世界', 2)).toEqual(['你', '好，', '世界']);
  });

  it('左引号不会留在行尾', () => {
    const out = lines('他说“好的”', 3);
    expect(out[0].endsWith('“')).toBe(false);
  });

  it('长文本每行都不以禁首标点开头', () => {
    const text = '客人最在意的是什么？对宝妈来说，是配料干不干净、孩子能不能吃；对上班族来说，是早上来不来得及买。';
    for (const line of lines(text, 8)) {
      expect('，。、；：？！）'.includes(line[0])).toBe(false);
    }
  });
});

describe('breakLines 英文与数字', () => {
  it('不拆开英文单词', () => {
    expect(lines('use Figma now', 3)).toEqual(['use', 'Figma', 'now']);
  });

  it('不拆开小数', () => {
    const out = lines('毛利率是32.5%左右', 4);
    expect(out.join('')).toContain('32.5%');
    expect(out.some((l) => l.includes('32.5%'))).toBe(true);
  });
});
