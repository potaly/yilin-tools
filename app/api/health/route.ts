/** 健康检查：只报告配置是否就绪，绝不返回密钥 */

import { NextResponse } from 'next/server';
import { getAiConfig } from '@/lib/config/ai-config';
import { getRedis, namespace } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const redis = getRedis();
  let redisOk = false;
  if (redis) {
    try {
      await redis.ping();
      redisOk = true;
    } catch {
      redisOk = false;
    }
  }

  const cfg = await getAiConfig();
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    redis: { configured: Boolean(redis), reachable: redisOk, namespace: namespace() },
    ai: {
      configured: Boolean(cfg),
      source: cfg?.source ?? 'none',
      model: cfg?.model ?? null,
      keyTail: cfg ? `****${cfg.apiKey.slice(-4)}` : null,
    },
  });
}
