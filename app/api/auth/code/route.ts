/** 发送登录验证码 */

import { NextResponse, type NextRequest } from 'next/server';
import { sendLoginCode } from '@/lib/account/mailer';
import { issueLoginCode, normalizeEmail } from '@/lib/account/store';
import { identify } from '@/lib/ratelimit';
import { getRedis, nsKey } from '@/lib/redis';

export const runtime = 'nodejs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: '请填写正确的邮箱地址' }, { status: 400 });
  }

  // 同一邮箱和同一 IP 都限速，免得被拿去刷别人的邮箱
  const redis = getRedis();
  if (redis) {
    for (const key of [nsKey(`codelimit:${email}`), nsKey(`codelimit:ip:${identify(req.headers, req.ip)}`)]) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 60);
      if (n > 3) {
        return NextResponse.json(
          { error: '发送太频繁了，请一分钟后再试', retryAfter: 60 },
          { status: 429, headers: { 'retry-after': '60' } },
        );
      }
    }
  }

  try {
    const code = await issueLoginCode(email);
    const result = await sendLoginCode(email, code);
    return NextResponse.json({ ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
  } catch (e) {
    console.error('[auth] 发验证码失败:', (e as Error).message);
    return NextResponse.json({ error: '验证码发不出去，请稍后再试' }, { status: 502 });
  }
}
