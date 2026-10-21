/** AI 排版接口 */

import { NextResponse, type NextRequest } from 'next/server';
import { currentAccount } from '@/lib/account/auth';
import { costCny, creditsFor, type Usage } from '@/lib/account/credits';
import { addCredits, getSettings, recordUsage, takeCredits } from '@/lib/account/store';
import { chunkByParagraph, mergeResults } from '@/lib/ai/chunk';
import { AiError, chatJSON, type ChatUsage } from '@/lib/ai/client';
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/ai/format-prompt';
import { coverage, validateShape } from '@/lib/ai/validate';
import { clean } from '@/lib/cards/clean';
import type { FormatResult } from '@/lib/cards/parse';
import { getAiConfig, type AiConfig } from '@/lib/config/ai-config';
import { guard, identify, release } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CHARS = 10_000;
const MIN_COVERAGE = 0.95;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  const retryAfter = typeof extra?.retryAfter === 'number' ? extra.retryAfter : undefined;
  return NextResponse.json(
    { error, ...extra },
    retryAfter ? { status, headers: { 'retry-after': String(retryAfter) } } : { status },
  );
}

interface ChunkOutcome {
  result: FormatResult;
  usage: ChatUsage;
}

/** 单块排版，结构不合法时重试 1 次 */
async function formatChunk(cfg: AiConfig, text: string, allowTitle: boolean): Promise<ChunkOutcome> {
  const prompt = { system: SYSTEM_PROMPT, user: buildUserPrompt(text, { allowTitle }) };
  const spent: ChatUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, usage } = await chatJSON(cfg, prompt);
    spent.promptTokens += usage.promptTokens;
    spent.cachedTokens += usage.cachedTokens;
    spent.completionTokens += usage.completionTokens;

    const parsed = validateShape(data);
    if (parsed) {
      return { result: allowTitle ? parsed : { ...parsed, title: '' }, usage: spent };
    }
    console.warn(`[ai-format] 第 ${attempt + 1} 次返回的结构不合法，块长度=${text.length}`);
  }
  throw new AiError('两次返回的 JSON 结构都不合法', 'AI 返回的结果无法识别，请重试一次');
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!text) return fail('请先粘贴要排版的文字', 400);
  if (text.length > MAX_CHARS) return fail('文字超过 1 万字，请分几次排版', 413);

  const cleaned = clean(text);
  const chunks = chunkByParagraph(cleaned);
  if (!chunks.length) return fail('请先粘贴要排版的文字', 400);

  const settings = await getSettings();
  const account = await currentAccount();
  const credits = creditsFor(chunks.length, settings);

  // 开启计费后才拦人；没开时照常记用量，谁都能用
  if (settings.billingEnabled) {
    if (!account) {
      return fail('请先登录后再使用 AI 排版', 401, { needLogin: true });
    }
    const left = await takeCredits(account.user.id, credits, `排版 ${chunks.length} 块`);
    if (left === null) {
      return fail(`算力不够了，这次需要 ${credits} 点`, 402, {
        needTopup: true,
        balance: account.balance,
        needed: credits,
      });
    }
  }

  const id = identify(req.headers, req.ip);
  const verdict = await guard(id, chunks.length);
  if (!verdict.ok) {
    // 限流拦下的请求要把刚扣的算力还回去
    if (settings.billingEnabled && account) {
      await addCredits(account.user.id, credits, 'refund', '被限流，退回');
    }
    return fail(verdict.error, verdict.status, { retryAfter: verdict.retryAfter });
  }

  const startedAt = Date.now();
  let refunded = false;
  const refund = async (why: string) => {
    if (settings.billingEnabled && account && !refunded) {
      refunded = true;
      await addCredits(account.user.id, credits, 'refund', why);
    }
  };

  try {
    const cfg = await getAiConfig();
    if (!cfg) {
      await refund('AI 未配置，退回');
      return fail('AI 排版暂未配置，请稍后再试', 503);
    }

    const outcomes = await Promise.all(chunks.map((c, i) => formatChunk(cfg, c, i === 0)));
    const merged = mergeResults(outcomes.map((o) => o.result));

    const usage: Usage = outcomes.reduce(
      (acc, o) => ({
        promptTokens: acc.promptTokens + o.usage.promptTokens,
        cachedTokens: acc.cachedTokens + o.usage.cachedTokens,
        completionTokens: acc.completionTokens + o.usage.completionTokens,
      }),
      { promptTokens: 0, cachedTokens: 0, completionTokens: 0 },
    );

    const output = merged.title + merged.blocks.map((b) => b.text).join('');
    const rate = coverage(cleaned, output);

    await recordUsage(account?.user.id ?? null, {
      ...usage,
      chunks: chunks.length,
      chars: text.length,
      costCny: costCny(usage),
      credits: settings.billingEnabled ? credits : 0,
    });

    console.log(
      `[ai-format] 完成 块数=${chunks.length} 字数=${text.length} 覆盖率=${rate.toFixed(3)}` +
        ` 成本=¥${costCny(usage).toFixed(4)} 耗时=${Date.now() - startedAt}ms` +
        ` 用户=${account?.user.email ?? '未登录'}`,
    );

    return NextResponse.json({
      ...merged,
      ...(rate < MIN_COVERAGE ? { warning: 'AI 可能改动了部分原文，请核对' } : {}),
      ...(settings.billingEnabled && account
        ? { credits: { spent: credits, balance: Math.max(0, account.balance - credits) } }
        : {}),
    });
  } catch (e) {
    await refund('排版失败，退回');
    if (e instanceof AiError) {
      console.error('[ai-format] 失败:', e.message);
      return fail(e.userMessage, 502);
    }
    console.error('[ai-format] 未预期的错误:', (e as Error).message);
    return fail('排版失败了，请稍后重试', 500);
  } finally {
    await release(id);
  }
}
