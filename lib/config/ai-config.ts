/**
 * AI 配置读取。
 *
 * 优先级：环境变量优先，Redis 兜底（按字段）。
 * 生产环境不要配置 AI_API_KEY，让 Redis 里的值生效，这样换 Key 不必重新部署。
 */

import 'server-only';
import { AI_CONFIG_KEY, getRedis, nsKey } from '@/lib/redis';

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  source: 'env' | 'redis' | 'mixed';
}

interface StoredConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  updatedAt?: string;
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-flash';
const TTL_MS = 60_000;

let cache: { value: AiConfig | null; at: number } | null = null;

export function clearAiConfigCache() {
  cache = null;
}

async function readStored(): Promise<StoredConfig | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<StoredConfig | string>(nsKey(AI_CONFIG_KEY));
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as StoredConfig) : raw;
  } catch (e) {
    console.error('[ai-config] 读取 Redis 失败:', (e as Error).message);
    return null;
  }
}

export async function getAiConfig(): Promise<AiConfig | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const envKey = (process.env.AI_API_KEY || '').trim();
  const stored = envKey ? null : await readStored();
  const storedKey = (stored?.apiKey || '').trim();
  const apiKey = envKey || storedKey;

  let value: AiConfig | null = null;
  if (apiKey) {
    const fromEnv = Boolean(envKey);
    value = {
      baseUrl: (process.env.AI_BASE_URL || stored?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
      model: process.env.AI_MODEL || stored?.model || DEFAULT_MODEL,
      apiKey,
      source: fromEnv ? (process.env.AI_MODEL || process.env.AI_BASE_URL ? 'env' : 'mixed') : 'redis',
    };
  }

  cache = { value, at: Date.now() };
  return value;
}
