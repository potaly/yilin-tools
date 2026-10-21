/** 当前登录状态与算力余额，前端用来决定显示登录还是余额 */

import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/account/auth';
import { getSettings } from '@/lib/account/store';
import { isAdmin } from '@/lib/account/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const account = await currentAccount();
  const settings = await getSettings();
  if (!account) {
    return NextResponse.json({ signedIn: false, billingEnabled: settings.billingEnabled });
  }
  return NextResponse.json({
    signedIn: true,
    email: account.user.email,
    balance: account.balance,
    billingEnabled: settings.billingEnabled,
    admin: isAdmin(settings, account.user.email),
  });
}
