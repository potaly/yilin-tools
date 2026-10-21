/**
 * Upstash Redis（REST）客户端。
 *
 * Upstash 只支持 0 号库（SELECT 非 0 会返回 "ERR Only 0th database is supported!"），
 * 所以用 key 前缀做命名空间，与 activation-service 的 code:* 共用同一个实例互不干扰。
 */

import { Redis } from '@upstash/redis';
import { MemoryRedis } from './redis-memory';

/** 对调用方来说，内存版和真 Redis 用法一致 */
type RedisLike = Pick<
  Redis,
  | 'ping' | 'get' | 'set' | 'del' | 'expire' | 'incrby' | 'decrby' | 'incr'
  | 'sadd' | 'smembers' | 'lpush' | 'ltrim' | 'lrange' | 'hincrby' | 'hgetall'
>;

let client: RedisLike | null | undefined;

export function getRedis(): RedisLike | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

  if (url && token) {
    client = new Redis({ url, token });
  } else if (process.env.NODE_ENV !== 'production') {
    // 本地没配凭据时顶一个内存版，让账户和算力能真跑；进程一重启就清空。
    // 挂在 globalThis 上：开发模式下每个路由是单独的 bundle，模块级变量不共享，
    // 不这样做的话「发验证码」和「校验验证码」会各自拿到一个空的实例。
    const g = globalThis as { __yilinMemoryRedis?: MemoryRedis };
    if (!g.__yilinMemoryRedis) {
      console.warn('[redis] 没有配 Upstash 凭据，本地用内存版顶替，数据不会保留');
      g.__yilinMemoryRedis = new MemoryRedis();
    }
    client = g.__yilinMemoryRedis as unknown as RedisLike;
  } else {
    client = null;
  }
  return client;
}

/** 当前用的是不是内存版（后台会提示一下） */
export function isMemoryRedis(): boolean {
  return getRedis() instanceof MemoryRedis;
}

/**
 * 只返回真正的 Upstash 客户端。
 * @upstash/ratelimit 要用 evalsha 跑 Lua 脚本，内存版顶不了，
 * 拿不到就让限流降级成进程内计数。
 */
export function getUpstashRedis(): Redis | null {
  const r = getRedis();
  return r instanceof Redis ? r : null;
}

export function namespace(): string {
  return process.env.REDIS_NAMESPACE || 'yilin:';
}

export function nsKey(key: string): string {
  return namespace() + key;
}

export const AI_CONFIG_KEY = 'config:ai';
