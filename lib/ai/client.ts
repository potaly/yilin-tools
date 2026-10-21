/** OpenAI 兼容的 Chat Completions 调用，用原生 fetch，不引入 SDK */

import 'server-only';
import type { AiConfig } from '@/lib/config/ai-config';

/** 带中文用户提示的错误；message 只进日志，userMessage 才返回给前端 */
export class AiError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
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

async function callOnce(cfg: AiConfig, prompt: Prompt, jsonMode: boolean): Promise<Response> {
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
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 调一次模型并解析出 JSON；对方不支持 json mode 时自动去掉该参数重试 */
export async function chatJSON(cfg: AiConfig, prompt: Prompt): Promise<unknown> {
  let res: Response;
  try {
    res = await callOnce(cfg, prompt, true);
    if (res.status === 400) {
      // 可能是不支持 response_format，去掉再试一次
      console.warn('[ai] 带 json mode 的请求被拒，去掉该参数重试:', (await res.clone().text()).slice(0, 200));
      res = await callOnce(cfg, prompt, false);
    }
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new AiError(
      `请求失败: ${(e as Error).message}`,
      aborted ? 'AI 响应超时了，文字太长可以分两次排版' : 'AI 服务暂时不可用，请稍后重试',
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
    throw new AiError(`上游返回 ${res.status}: ${detail.slice(0, 200)}`, hint);
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AiError('上游返回内容为空', 'AI 没有返回内容，请重试一次');
  const parsed = extractJson(content);
  if (parsed === null) {
    console.error('[ai] 无法从回复中解析出 JSON，开头 160 字:', content.slice(0, 160));
  }
  return parsed;
}
