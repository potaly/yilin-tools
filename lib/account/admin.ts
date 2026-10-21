/**
 * 后台准入。
 *
 * 两条路：
 * 1. 登录用户的邮箱在管理员名单里（名单在后台自己维护）；
 * 2. 带对 ADMIN_TOKEN——用 /admin?token=xxx 进一次，之后存成 httpOnly cookie。
 *
 * 第 2 条是给「还没有登录页」和「忘了自己是不是管理员」兜底的，
 * 名单为空时也只能靠它，否则后台就锁死了。
 */

import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { currentUser } from './auth';
import { isAdmin } from './settings';
import { getSettings } from './store';

export const ADMIN_COOKIE = 'yilin_admin';

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function adminTokenMatches(candidate: string | undefined | null): boolean {
  const expected = (process.env.ADMIN_TOKEN || '').trim();
  const got = (candidate || '').trim();
  return Boolean(expected) && Boolean(got) && sameToken(expected, got);
}

export function adminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export interface AdminCheck {
  ok: boolean;
  /** 还没设过管理员名单，提示先把自己加进去 */
  bootstrap: boolean;
  /** 服务端压根没配 ADMIN_TOKEN，后台进不去 */
  tokenConfigured: boolean;
  email?: string;
}

export async function checkAdmin(headerToken?: string | null): Promise<AdminCheck> {
  const settings = await getSettings();
  const base = {
    bootstrap: settings.adminEmails.length === 0,
    tokenConfigured: Boolean((process.env.ADMIN_TOKEN || '').trim()),
  };

  if (adminTokenMatches(headerToken) || adminTokenMatches(cookies().get(ADMIN_COOKIE)?.value)) {
    return { ok: true, ...base };
  }
  const user = await currentUser();
  if (user && isAdmin(settings, user.email)) {
    return { ok: true, ...base, bootstrap: false, email: user.email };
  }
  return { ok: false, ...base };
}
