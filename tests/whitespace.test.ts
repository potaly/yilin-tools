import { describe, expect, it } from 'vitest';
import { clean, normalizeInput, stripInvisible } from '@/lib/cards/clean';
import { toggleHeading } from '@/lib/cards/markup';
import { parse } from '@/lib/cards/parse';

// 用字符码构造，避免转义在各层工具链里被吃掉
const NBSP = String.fromCharCode(0x00a0); // 不换行空格
const IDEO = String.fromCharCode(0x3000); // 全角空格
const LS = String.fromCharCode(0x2028); // 行分隔符
const PS = String.fromCharCode(0x2029); // 段分隔符
const ZWSP = String.fromCharCode(0x200b); // 零宽空格

describe('从小红书、公众号复制来的隐形字符', () => {
  it('井号后面是不换行空格或全角空格，也要认成标题', () => {
    expect(parse(`#${NBSP}很多人问我。`)[0].type).toBe('title');
    expect(parse(`##${IDEO}第一步。`)[0].type).toBe('h2');
  });

  it('行里夹着 U+2028 / U+2029 时标题不能退化成正文', () => {
    // 这是用户实际遇到的：设为大标题之后，# 被当成正文原样显示出来
    expect(parse(`# 很多做养生号的朋友${LS}经常问我。`)[0].type).toBe('title');
    expect(parse(`# 很多做养生号的朋友${PS}经常问我。`)[0].type).toBe('title');
  });

  it('normalizeInput 把隐形换行变成真换行，零宽字符删掉', () => {
    expect(normalizeInput(`甲${LS}乙${PS}丙`)).toBe('甲\n乙\n丙');
    expect(normalizeInput(`你${ZWSP}好`)).toBe('你好');
  });

  it('normalizeInput 不动空格，中文输入法打出的全角空格要留着', () => {
    expect(normalizeInput(`甲${IDEO}乙`)).toBe(`甲${IDEO}乙`);
    expect(normalizeInput(`甲${NBSP}乙`)).toBe(`甲${NBSP}乙`);
  });

  it('快速清理会把异常空格统一掉', () => {
    expect(stripInvisible(`甲${NBSP}乙${IDEO}丙`)).toBe('甲 乙 丙');
    expect(clean(`店主说：${NBSP}每天发新品图。`)).toContain('店主说：每天发新品图。');
  });

  it('隐形换行会被切成不同段落，而不是糊成一段', () => {
    expect(parse(`第一段。${LS}第二段。`)).toHaveLength(2);
  });
});

describe('完整链路：粘贴 → 快速清理 → 设为大标题 → 排版', () => {
  const pasted =
    `很多做养生号的朋友经常问我：${NBSP}你们到底怎么做到一天拍100条视频的？` +
    `我一条都要准备半天。${LS}其实真相是：${NBSP}不是拍得多，而是会拆解、会结构。`;

  it('清理后第一段设为大标题，能正确排成标题', () => {
    const cleaned = clean(normalizeInput(pasted));
    const first = cleaned.split('\n').find((l) => l.trim())!;
    const at = cleaned.indexOf(first);
    const marked = toggleHeading(cleaned, at, at, 1);

    const blocks = parse(marked.text);
    expect(blocks[0].type).toBe('title');
    expect(blocks[0].text.startsWith('#')).toBe(false);
    expect(blocks[0].text).toContain('很多做养生号的朋友经常问我');
  });

  it('不点快速清理、直接设为大标题也要成立', () => {
    const normalized = normalizeInput(pasted);
    const marked = toggleHeading(normalized, 0, 0, 1);
    expect(parse(marked.text)[0].type).toBe('title');
  });
});
