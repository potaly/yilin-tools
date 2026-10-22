/** 当前登录状态与算力余额，前端用来决定显示登录还是余额 */

import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/account/auth';
import { getSettings } from '@/lib/account/store';
import { isAdmin } from '@/lib/account/settings';
import { wechatConfigured } from '@/lib/account/wechat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const account = await currentAccount();
  const settings = await getSettings();
  const common = {
    billingEnabled: settings.billingEnabled,
    wechat: wechatConfigured(),
    // 没配发信服务时邮箱登录是废的，别让页面显示一个按了就报错的表单
    emailLogin: Boolean((process.env.RESEND_API_KEY || '').trim()) || process.env.NODE_ENV !== 'production',
  };
  if (!account) {
    return NextResponse.json({ signedIn: false, ...common });
  }
  return NextResponse.json({
    signedIn: true,
    email: account.user.email,
    nickname: account.user.nickname ?? null,
    balance: account.balance,
    admin: isAdmin(settings, account.user.email),
    ...common,
  });
}
