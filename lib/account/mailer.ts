/**
 * 发登录验证码。
 *
 * 默认走 Resend（注册只要邮箱，免费额度够用）。没配 key 时不发信，
 * 把验证码打到服务端日志，方便本地开发；生产环境没配就直接报错，
 * 免得用户干等一个永远不会到的邮件。
 */

import 'server-only';

export interface MailResult {
  sent: boolean;
  /** 没配发信服务时把验证码回传，只在开发环境使用 */
  devCode?: string;
}

export async function sendLoginCode(email: string, code: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Yilin 工具箱 <onboarding@resend.dev>';

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('未配置发信服务（RESEND_API_KEY）');
    }
    console.log(`[mail] 未配置发信服务，${email} 的登录验证码是 ${code}`);
    return { sent: false, devCode: code };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `登录验证码 ${code}`,
      text: `你的登录验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人操作，忽略这封邮件即可。`,
    }),
  });

  if (!res.ok) {
    throw new Error(`发信失败 ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  return { sent: true };
}
