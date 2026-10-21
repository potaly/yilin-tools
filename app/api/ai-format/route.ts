/** AI 排版接口 */

import { NextResponse, type NextRequest } from 'next/server';
import { chunkByParagraph, mergeResults } from '@/lib/ai/chunk';
import { AiError, chatJSON } from '@/lib/ai/client';
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

function fail(error: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    retryAfter ? { error, retryAfter } : { error },
    retryAfter ? { status, headers: { 'retry-after': String(retryAfter) } } : { status },
  );
}

/** 单块排版，结构不合法时重试 1 次 */
async function formatChunk(cfg: AiConfig, text: string, allowTitle: boolean): Promise<FormatResult> {
  const prompt = { system: SYSTEM_PROMPT, user: buildUserPrompt(text, { allowTitle }) };
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = validateShape(await chatJSON(cfg, prompt));
    if (parsed) return allowTitle ? parsed : { ...parsed, title: '' };
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

  const id = identify(req.headers, req.ip);
  const verdict = await guard(id, chunks.length);
  if (!verdict.ok) return fail(verdict.error, verdict.status, verdict.retryAfter);

  const startedAt = Date.now();
  try {
    const cfg = await getAiConfig();
    if (!cfg) return fail('AI 排版暂未配置，请稍后再试', 503);

    const parts = await Promise.all(chunks.map((c, i) => formatChunk(cfg, c, i === 0)));
    const merged = mergeResults(parts);

    // 比对时要把 h2 和标题也算进去：AI 会把原文里的「第一件事……」抽成小标题，
    // 只看正文块会把这种正确的结构化误判成改写。
    const output = merged.title + merged.blocks.map((b) => b.text).join('');
    const rate = coverage(cleaned, output);

    console.log(
      `[ai-format] 完成 块数=${chunks.length} 字数=${text.length} 覆盖率=${rate.toFixed(3)} 耗时=${Date.now() - startedAt}ms`,
    );

    return NextResponse.json({
      ...merged,
      ...(rate < MIN_COVERAGE ? { warning: 'AI 可能改动了部分原文，请核对' } : {}),
    });
  } catch (e) {
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
