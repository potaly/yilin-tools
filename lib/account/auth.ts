/** 会话 cookie 与「当前登录用户」 */

import 'server-only';
import { cookies } from 'next/headers';
import { getBalance, resolveSession, type User } from './store';

export const SESSION_COOKIE = 'yilin_session';

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export async function currentUser(): Promise<User | null> {
  return resolveSession(cookies().get(SESSION_COOKIE)?.value);
}

export async function currentAccount(): Promise<{ user: User; balance: number } | null> {
  const user = await currentUser();
  if (!user) return null;
  return { user, balance: await getBalance(user.id) };
}
