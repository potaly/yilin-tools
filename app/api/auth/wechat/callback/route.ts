/** 微信授权回调：验 state、换身份、建账户、发会话 */

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/account/auth';
import { createSession, findOrCreateUser, takeOauthState } from '@/lib/account/store';
import { WechatError, exchangeCode, getWechatConfig } from '@/lib/account/wechat';

export const runtime = 'nodejs';

function backToLogin(req: NextRequest, reason: string) {
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('wechat', reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const cfg = getWechatConfig();
  if (!cfg) return backToLogin(req, 'unconfigured');

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) return backToLogin(req, 'cancelled');

  // state 是一次性的，验不过就当成伪造的回调
  const next = await takeOauthState(state);
  if (next === null) return backToLogin(req, 'expired');

  try {
    const identity = await exchangeCode(cfg, code);
    const { user } = await findOrCreateUser({
      provider: 'wechat',
      key: identity.key,
      nickname: identity.nickname,
      avatar: identity.avatar,
    });
    const token = await createSession(user.id);
    const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 30));
    console.log(`[wechat] ${user.nickname ?? user.id} 登录成功`);
    return res;
  } catch (e) {
    console.error('[wechat] 回调失败:', (e as Error).message);
    return backToLogin(req, e instanceof WechatError ? 'failed' : 'error');
  }
}
