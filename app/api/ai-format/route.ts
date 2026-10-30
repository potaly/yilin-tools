/** AI 排版接口 */

import { NextResponse, type NextRequest } from 'next/server';
import { currentAccount } from '@/lib/account/auth';
import { ZERO_USAGE, addUsage, costCny, creditsFor, type Usage } from '@/lib/account/credits';
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
  /** 这一块实际打出去几个上游请求（含结构重试和 chatJSON 内部的参数降级重试） */
  requests: number;
}

/** 单块排版，结构不合法时重试 1 次 */
async function formatChunk(cfg: AiConfig, text: string, allowTitle: boolean): Promise<ChunkOutcome> {
  const prompt = { system: SYSTEM_PROMPT, user: buildUserPrompt(text, { allowTitle }) };
  const spent: ChatUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
  let requests = 0;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, usage, requests: n } = await chatJSON(cfg, prompt);
      requests += n;
      spent.promptTokens += usage.promptTokens;
      spent.cachedTokens += usage.cachedTokens;
      spent.completionTokens += usage.completionTokens;

      const parsed = validateShape(data);
      if (parsed) {
        return { result: allowTitle ? parsed : { ...parsed, title: '' }, usage: spent, requests };
      }
      console.warn(`[ai-format] 第 ${attempt + 1} 次返回的结构不合法，块长度=${text.length}`);
    }
    throw new AiError('两次返回的 JSON 结构都不合法', 'AI 返回的结果无法识别，请重试一次');
  } catch (e) {
    // 结构不合法的那两次是**拿到回复了的**，token 真花了；chatJSON 自己抛的
    // 那次没拿到回复，它的 usage 是 0、requests 才是要补的。两种都靠这里带出去
    if (e instanceof AiError) {
      throw new AiError(e.message, e.userMessage, requests + e.requests, addUsage(spent, e.usage));
    }
    throw e;
  }
}

/** 从一个分块的结果或错误里取出它花掉的用量 —— 失败的分块也付了钱 */
function spendOf(s: PromiseSettledResult<ChunkOutcome>): { usage: ChatUsage; requests: number } {
  if (s.status === 'fulfilled') return { usage: s.value.usage, requests: s.value.requests };
  const e = s.reason;
  return e instanceof AiError
    ? { usage: e.usage, requests: e.requests }
    : { usage: ZERO_USAGE, requests: 0 };
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

  /** 所有分块累计花掉的 token 与打出去的上游请求数，成功失败都往里加 */
  let spent: Usage = ZERO_USAGE;
  let upstream = 0;
  /** 和 refunded 一样是防重的闸：失败路径记过之后，外层 catch 不能再记一遍 */
  let recorded = false;
  const record = async (ok: boolean) => {
    if (recorded) return;
    recorded = true;
    await recordUsage(
      account?.user.id ?? null,
      {
        ...spent,
        chunks: chunks.length, // 内容分块数，和历史口径一致
        requests: upstream, // 真实上游请求数，含结构重试与参数降级重打
        chars: text.length,
        costCny: costCny(spent),
        credits: settings.billingEnabled ? credits : 0,
        fails: ok ? 0 : 1,
      },
      id, // 没有登录时，IP 是唯一能区分用户的东西
      'longform-cards', // 和 lib/site.ts 的 slug 对齐，后台按工具分表时才并得上
    );
  };

  try {
    const cfg = await getAiConfig();
    if (!cfg) {
      await refund('AI 未配置，退回');
      return fail('AI 排版暂未配置，请稍后再试', 503);
    }

    // allSettled 而不是 all：一块失败时，其它块**已经付过钱了**，
    // Promise.all 会把它们的用量一起扔掉
    const settled = await Promise.allSettled(chunks.map((c, i) => formatChunk(cfg, c, i === 0)));

    for (const s of settled) {
      const { usage: u, requests: n } = spendOf(s);
      spent = addUsage(spent, u);
      upstream += n;
    }

    const failed = settled.filter((s) => s.status === 'rejected');
    if (failed.length > 0) {
      await refund(`${failed.length} 块失败，退回`);
      await record(false);
      const first = (failed[0] as PromiseRejectedResult).reason;
      console.error(`[ai-format] ${failed.length}/${chunks.length} 块失败:`, (first as Error).message);
      if (first instanceof AiError) return fail(first.userMessage, 502);
      return fail('排版失败了，请稍后重试', 500);
    }

    const outcomes = settled.map((s) => (s as PromiseFulfilledResult<ChunkOutcome>).value);
    const merged = mergeResults(outcomes.map((o) => o.result));
    const usage: Usage = spent;

    const output = merged.title + merged.blocks.map((b) => b.text).join('');
    const rate = coverage(cleaned, output);

    await record(true);

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
    // 走到这里说明是分块之后的环节炸了（合并、校验）。分块的钱已经付了，
    // record() 自带防重，失败路径记过就不会再记一遍
    if (e instanceof AiError) upstream += e.requests;
    if (upstream > 0) await record(false);
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
