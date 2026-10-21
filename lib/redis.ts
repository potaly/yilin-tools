/**
 * Upstash Redis（REST）客户端。
 *
 * Upstash 只支持 0 号库（SELECT 非 0 会返回 "ERR Only 0th database is supported!"），
 * 所以用 key 前缀做命名空间，与 activation-service 的 code:* 共用同一个实例互不干扰。
 */

import { Redis } from '@upstash/redis';

let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export function namespace(): string {
  return process.env.REDIS_NAMESPACE || 'yilin:';
}

export function nsKey(key: string): string {
  return namespace() + key;
}

export const AI_CONFIG_KEY = 'config:ai';
