/** 跳到微信扫码授权页 */

import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { saveOauthState } from '@/lib/account/store';
import { buildAuthUrl, getWechatConfig } from '@/lib/account/wechat';

export const runtime = 'nodejs';

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/tools/longform-cards';
  return raw;
}

export async function GET(req: NextRequest) {
  const cfg = getWechatConfig();
  if (!cfg) {
    const back = new URL('/login', req.nextUrl.origin);
    back.searchParams.set('wechat', 'unconfigured');
    return NextResponse.redirect(back);
  }

  const state = randomBytes(16).toString('base64url');
  try {
    await saveOauthState(state, safeNext(req.nextUrl.searchParams.get('next')));
  } catch (e) {
    console.error('[wechat] 存 state 失败:', (e as Error).message);
    const back = new URL('/login', req.nextUrl.origin);
    back.searchParams.set('wechat', 'failed');
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(buildAuthUrl(cfg, state));
}
