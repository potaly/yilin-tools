/** 带 token 进后台：校验通过就换成 httpOnly cookie，免得 token 一直留在地址栏 */

import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminCookieOptions, adminTokenMatches } from '@/lib/account/admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const target = new URL('/admin', req.nextUrl.origin);

  if (!adminTokenMatches(token)) {
    target.searchParams.set('denied', '1');
    return NextResponse.redirect(target);
  }
  const res = NextResponse.redirect(target);
  res.cookies.set(ADMIN_COOKIE, token!.trim(), adminCookieOptions(60 * 60 * 12));
  return res;
}
