/** OpenAI 兼容的 Chat Completions 调用，用原生 fetch，不引入 SDK */

import 'server-only';
import type { AiConfig } from '@/lib/config/ai-config';

export interface ChatUsage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

const NO_USAGE: ChatUsage = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 };

/** 带中文用户提示的错误；message 只进日志，userMessage 才返回给前端 */
export class AiError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    /** 抛出之前已经打出去几个上游请求 */
    readonly requests = 0,
    /**
     * 抛出之前已经确认花掉的 token。
     *
     * chatJSON 自己抛错时这里是 0 —— 那次请求没拿到回复，用量未知。
     * 但**调用方攒了好几轮再抛**的情况（见 ai-format 的 formatChunk：
     * 两次返回的结构都不合法）token 是真花了的，必须带出来，否则这笔钱
     * 在成本表里凭空消失。
     */
    readonly usage: ChatUsage = NO_USAGE,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const TIMEOUT_MS = 50_000; // Vercel 上限 60s，留 10s 给合并与校验

function endpoint(baseUrl: string): string {
  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
}

/** 从可能带 markdown 围栏或解释文字的回复里抠出 JSON */
export function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : content).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

interface Prompt {
  system: string;
  user: string;
}

/**
 * 关掉模型的「思考」。
 *
 * 实测 deepseek-flash 在开启思考时会先生成 1500–3000 个推理 token 才开始输出正文，
 * 慢的时候整次调用要 10–35 秒；关掉之后推理 token 为 0，排版质量没有下降
 * （覆盖率 0.991 vs 0.960，段落长度 60 字 vs 51 字，更贴近 40–120 字的要求）。
 * 需要让模型多想时把 AI_THINKING 设成 enabled。
 */
function thinkingParam(): Record<string, unknown> {
  return (process.env.AI_THINKING || 'disabled') === 'enabled'
    ? {}
    : { thinking: { type: 'disabled' } };
}

async function callOnce(cfg: AiConfig, prompt: Prompt, extras: boolean): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(endpoint(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        // 这两个参数不是所有 OpenAI 兼容服务都认，被拒时整体去掉重试一次
        ...(extras ? { response_format: { type: 'json_object' }, ...thinkingParam() } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatResult {
  data: unknown;
  usage: ChatUsage;
  /**
   * 这次 chatJSON 实际打出去几个上游请求。
   *
   * 通常是 1，但对方不认 response_format 时会去掉参数再打一次 —— 那一次
   * 被 400 拒掉，不计费，可是它确实是一个请求。调用方要统计请求数就得知道。
   */
  requests: number;
}

/** 调一次模型并解析出 JSON；对方不支持 json mode 时自动去掉该参数重试 */
export async function chatJSON(cfg: AiConfig, prompt: Prompt): Promise<ChatResult> {
  let res: Response;
  let requests = 0;
  try {
    requests++;
    res = await callOnce(cfg, prompt, true);
    if (res.status === 400) {
      // 可能是不认 response_format 或 thinking，去掉这两个参数再试一次
      console.warn('[ai] 带可选参数的请求被拒，去掉后重试:', (await res.clone().text()).slice(0, 200));
      requests++;
      res = await callOnce(cfg, prompt, false);
    }
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new AiError(
      `请求失败: ${(e as Error).message}`,
      aborted ? 'AI 响应超时了，文字太长可以分两次排版' : 'AI 服务暂时不可用，请稍后重试',
      requests,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const hint =
      res.status === 401 || res.status === 403
        ? 'AI 密钥无效，请联系管理员'
        : res.status === 402
          ? 'AI 账户余额不足，请联系管理员'
          : res.status === 429
            ? 'AI 服务正忙，请稍后重试'
            : 'AI 服务暂时不可用，请稍后重试';
    throw new AiError(`上游返回 ${res.status}: ${detail.slice(0, 200)}`, hint, requests);
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_cache_hit_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  } | null;

  const u = data?.usage;
  const usage: ChatUsage = u
    ? {
        promptTokens: u.prompt_tokens ?? 0,
        cachedTokens: u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
      }
    : NO_USAGE;

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AiError('上游返回内容为空', 'AI 没有返回内容，请重试一次', requests);
  const parsed = extractJson(content);
  if (parsed === null) {
    console.error('[ai] 无法从回复中解析出 JSON，开头 160 字:', content.slice(0, 160));
  }
  return { data: parsed, usage, requests };
}
