/** 后台的准入判断：登录用户在管理员名单里，或者带对了 ADMIN_TOKEN */

import 'server-only';
import { currentUser } from './auth';
import { isAdmin } from './settings';
import { getSettings } from './store';

export interface AdminCheck {
  ok: boolean;
  /** 还没设过管理员名单，此时允许用 ADMIN_TOKEN 进来做初始化 */
  bootstrap: boolean;
  email?: string;
}

export async function checkAdmin(headerToken?: string | null): Promise<AdminCheck> {
  const settings = await getSettings();
  const envToken = (process.env.ADMIN_TOKEN || '').trim();
  const bootstrap = settings.adminEmails.length === 0;

  if (envToken && headerToken && headerToken.trim() === envToken) {
    return { ok: true, bootstrap };
  }
  const user = await currentUser();
  if (user && isAdmin(settings, user.email)) {
    return { ok: true, bootstrap: false, email: user.email };
  }
  return { ok: false, bootstrap };
}
