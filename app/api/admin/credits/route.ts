/** 后台手动给某个账户加算力：没接支付之前，充值就靠这个 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkAdmin } from '@/lib/account/admin';
import { addCredits, getBalance, normalizeEmail } from '@/lib/account/store';
import { getRedis, nsKey } from '@/lib/redis';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req.headers.get('x-admin-token'));
  if (!admin.ok) return NextResponse.json({ error: '没有权限' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { email?: unknown; amount?: unknown; note?: unknown } | null;
  const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
  const amount = Math.round(Number(body?.amount));
  const note = typeof body?.note === 'string' ? body.note.slice(0, 60) : '后台调整';

  if (!email) return NextResponse.json({ error: '请填邮箱' }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000) {
    return NextResponse.json({ error: '数量要是非零整数' }, { status: 400 });
  }

  const redis = getRedis();
  const userId = redis ? await redis.get<string>(nsKey(`user:email:${email}`)) : null;
  if (!userId) return NextResponse.json({ error: '没有这个账户' }, { status: 404 });

  const balance = await addCredits(userId, amount, amount > 0 ? 'topup' : 'adjust', note);
  console.log(`[admin] ${admin.email ?? 'token'} 给 ${email} ${amount > 0 ? '加' : '减'} ${Math.abs(amount)} 算力`);
  return NextResponse.json({ ok: true, email, balance: await getBalance(userId) === balance ? balance : balance });
}
