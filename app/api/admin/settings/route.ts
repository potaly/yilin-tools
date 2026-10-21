/** 后台调参数：赠送额度、每次扣费、加价率、充值档位、是否计费、管理员名单 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkAdmin } from '@/lib/account/admin';
import { getSettings, saveSettings } from '@/lib/account/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req.headers.get('x-admin-token'));
  if (!admin.ok) return NextResponse.json({ error: '没有权限' }, { status: 403 });
  return NextResponse.json(await getSettings());
}

export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req.headers.get('x-admin-token'));
  if (!admin.ok) return NextResponse.json({ error: '没有权限' }, { status: 403 });

  const patch = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!patch) return NextResponse.json({ error: '参数不对' }, { status: 400 });

  try {
    const next = await saveSettings(patch);
    console.log(`[admin] ${admin.email ?? 'token'} 改了设置:`, JSON.stringify(next));
    return NextResponse.json({ ok: true, settings: next });
  } catch (e) {
    console.error('[admin] 保存设置失败:', (e as Error).message);
    return NextResponse.json({ error: '保存失败，检查 Redis 是否可用' }, { status: 500 });
  }
}
