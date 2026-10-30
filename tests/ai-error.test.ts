import { describe, expect, it } from 'vitest';
import { AiError } from '@/lib/ai/client';
import { ZERO_USAGE, addUsage } from '@/lib/account/credits';

/**
 * 失败路径上的钱最容易丢：请求打出去了、token 花了，但因为抛了异常，
 * 调用方拿不到任何数字。AiError 带着这两个量，就是为了让它们活到记账那一步。
 */
describe('AiError 带出已花掉的用量', () => {
  it('默认是空的，不会污染统计', () => {
    const e = new AiError('x', 'y');
    expect(e.requests).toBe(0);
    expect(e.usage).toEqual(ZERO_USAGE);
  });

  it('攒了几轮再抛时，token 和请求数都能带出来', () => {
    const spent = { promptTokens: 2400, cachedTokens: 0, completionTokens: 900 };
    const e = new AiError('两次结构都不合法', '请重试', 2, spent);
    expect(e.requests).toBe(2);
    expect(e.usage.promptTokens).toBe(2400);
  });

  it('把错误里的用量并回累计值，和成功路径同一套加法', () => {
    const first = { promptTokens: 1000, cachedTokens: 0, completionTokens: 400 };
    const e = new AiError('炸了', '请重试', 1, { promptTokens: 500, cachedTokens: 0, completionTokens: 200 });
    const total = addUsage(first, e.usage);
    expect(total.promptTokens).toBe(1500);
    expect(total.completionTokens).toBe(600);
  });

  it('chatJSON 自己抛错时用量未知，记 0 但请求数照记', () => {
    const e = new AiError('上游返回 429', '稍后重试', 1);
    expect(e.usage).toEqual(ZERO_USAGE); // 成本按 0 记 —— 是未知，不是免费
    expect(e.requests).toBe(1);
  });
});
