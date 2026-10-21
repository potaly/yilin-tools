/** 用验证码换登录会话 */

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/account/auth';
import { createSession, findOrCreateUser, getBalance, normalizeEmail, verifyLoginCode } from '@/lib/account/store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '请填写邮箱和 6 位验证码' }, { status: 400 });
  }

  try {
    if (!(await verifyLoginCode(email, code))) {
      return NextResponse.json({ error: '验证码不对或已过期' }, { status: 401 });
    }
    const { user, isNew } = await findOrCreateUser({ provider: 'email', key: email });
    const token = await createSession(user.id);
    const res = NextResponse.json({
      ok: true,
      isNew,
      user: { email: user.email },
      balance: await getBalance(user.id),
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 30));
    return res;
  } catch (e) {
    console.error('[auth] 登录失败:', (e as Error).message);
    return NextResponse.json({ error: '登录失败了，请稍后再试' }, { status: 500 });
  }
}
