'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';
import styles from './login.module.css';

type Step = 'loading' | 'email' | 'code' | 'signedIn';
type Notice = { tone: 'info' | 'bad'; text: string } | null;

interface Me {
  signedIn: boolean;
  email?: string;
  nickname?: string | null;
  balance?: number;
  admin?: boolean;
  wechat?: boolean;
  emailLogin?: boolean;
}

/** 微信回调带回来的结果说明 */
const WECHAT_MESSAGES: Record<string, string> = {
  unconfigured: '微信登录还没配置好，先用邮箱登录吧。',
  cancelled: '你取消了微信授权。',
  expired: '这次扫码超时了，请重新点一次微信登录。',
  failed: '微信授权没通过，请重新扫码。',
  error: '微信登录失败了，请稍后再试。',
};

/** 只接受站内相对路径，避免被拿去做跳转钓鱼 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/tools/longform-cards';
  return raw;
}

export default function LoginForm() {
  const [step, setStep] = useState<Step>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [devCode, setDevCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);
  const next = typeof window === 'undefined' ? '/' : safeNext(new URLSearchParams(location.search).get('next'));

  const loadMe = useCallback(async () => {
    try {
      const data: Me = await fetch('/api/me').then((r) => r.json());
      setMe(data);
      setStep(data.signedIn ? 'signedIn' : 'email');
    } catch {
      setStep('email');
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // 微信回调失败时会带着原因跳回来
  useEffect(() => {
    const reason = new URLSearchParams(location.search).get('wechat');
    if (reason && WECHAT_MESSAGES[reason]) {
      setNotice({ tone: 'bad', text: WECHAT_MESSAGES[reason] });
    }
  }, []);

  // 重发倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(resend = false) {
    if (busy || !email.trim()) return;
    setBusy(true);
    setNotice(null);
    setDevCode('');
    try {
      const res = await fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ tone: 'bad', text: data?.error ?? '验证码发不出去' });
        if (typeof data?.retryAfter === 'number') setCooldown(data.retryAfter);
        return;
      }
      setStep('code');
      setCooldown(60);
      if (data.devCode) {
        setDevCode(String(data.devCode));
        setNotice({ tone: 'info', text: '服务端还没配发信服务，这个验证码只在开发环境显示：' });
      } else {
        setNotice({ tone: 'info', text: `验证码发到 ${email} 了，10 分钟内有效${resend ? '（已重发）' : ''}。` });
      }
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setNotice({ tone: 'bad', text: '网络不太稳，请再试一次' });
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (busy || code.trim().length !== 6) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDevCode('');
        setNotice({ tone: 'bad', text: data?.error ?? '登录失败' });
        return;
      }
      location.href = next;
    } catch {
      setNotice({ tone: 'bad', text: '网络不太稳，请再试一次' });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCode('');
      setNotice(null);
      await loadMe();
    } finally {
      setBusy(false);
    }
  }

  if (step === 'loading') {
    return (
      <div className={styles.card}>
        <p className={styles.lede}>正在检查登录状态…</p>
      </div>
    );
  }

  if (step === 'signedIn' && me?.signedIn) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>已登录</h1>
        <div className={styles.account}>
          <span className={styles.accountEmail}>{me.nickname || me.email || '微信用户'}</span>
          <span className={styles.accountBalance}>
            剩余算力 {me.balance ?? 0}
            {me.balance !== undefined && `，大约还能排版 ${me.balance} 次`}
          </span>
        </div>
        <a className="btn btnPrimary" href={next} style={{ width: '100%', minHeight: 46 }}>
          回去做图卡
        </a>
        <div className={styles.row}>
          {me.admin && <a className={styles.linkBtn} href="/admin">进后台</a>}
          <button className={styles.linkBtn} type="button" onClick={signOut} disabled={busy}>
            退出登录
          </button>
        </div>
      </div>
    );
  }

  // 一种登录方式都没配时，老老实实说还没开放，别给一个按了就报错的表单
  if (me && !me.wechat && !me.emailLogin) {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>登录还没开放</h1>
        <p className={styles.lede}>
          现在所有功能都不用登录就能用：排版、换模板、保存图片、导出 PDF，AI 排版也是免费的。
        </p>
        <a className="btn btnPrimary" href="/tools/longform-cards" style={{ width: '100%', minHeight: 46 }}>
          去做图卡
        </a>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>登录{SITE.name}</h1>
      <p className={styles.lede}>
        {me?.wechat ? '微信扫一扫或者用邮箱验证码都能登录，不用设密码。' : '用邮箱收一个验证码就能登录，不用设密码。'}
        新账户送 20 次 AI 排版。
      </p>

      {me?.wechat && (
        <>
          <a className={`btn ${styles.wechat}`} href={`/api/auth/wechat?next=${encodeURIComponent(next)}`}>
            <WechatIcon />
            微信扫码登录
          </a>
          {me.emailLogin && (
            <div className={styles.divider}>
              <span>或用邮箱登录</span>
            </div>
          )}
        </>
      )}

      {me?.emailLogin && (
      <div className={styles.field}>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          className={styles.input}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          disabled={step === 'code'}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendCode()}
        />
      </div>
      )}

      {step === 'code' && (
        <div className={styles.field}>
          <label htmlFor="code">验证码</label>
          <input
            id="code"
            ref={codeRef}
            className={`${styles.input} ${styles.code}`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
          />
        </div>
      )}

      {notice && (
        <p className={`${styles.note} ${notice.tone === 'bad' ? styles.bad : ''}`}>
          {notice.text}
          {devCode && notice.tone === 'info' && <> <span className={styles.devCode}>{devCode}</span></>}
        </p>
      )}

      {!me?.emailLogin ? null : step === 'email' ? (
        <button
          className="btn btnPrimary"
          type="button"
          onClick={() => sendCode()}
          disabled={busy || !email.trim()}
        >
          {busy ? '发送中…' : '发送验证码'}
        </button>
      ) : (
        <>
          <button
            className="btn btnPrimary"
            type="button"
            onClick={signIn}
            disabled={busy || code.length !== 6}
          >
            {busy ? '登录中…' : '登录'}
          </button>
          <div className={styles.row}>
            <button
              className={styles.linkBtn}
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setNotice(null);
                setDevCode('');
              }}
            >
              换个邮箱
            </button>
            <button
              className={styles.linkBtn}
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => sendCode(true)}
            >
              {cooldown > 0 ? `${cooldown} 秒后可重发` : '没收到？重新发一次'}
            </button>
          </div>
        </>
      )}

      <p className={styles.foot}>
        登录只用来记录你的算力余额和用量。图片仍然全部在你的浏览器里生成，文字不会上传，除非你点「AI 排版」。
      </p>
    </div>
  );
}

function WechatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.1 3C4.9 3 1.5 5.9 1.5 9.4c0 2 1.1 3.8 2.9 5l-.7 2.2 2.6-1.3c.9.2 1.8.4 2.8.4h.5a5.9 5.9 0 0 1-.2-1.5c0-3.4 3.3-6.1 7.4-6.1h.6C16.7 5 13.2 3 9.1 3Zm-2.5 3.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      <path d="M22.5 14.1c0-2.9-2.9-5.2-6.4-5.2s-6.4 2.3-6.4 5.2 2.9 5.2 6.4 5.2c.8 0 1.5-.1 2.2-.3l2.1 1.1-.6-1.8c1.6-1 2.7-2.5 2.7-4.2Zm-8.4-1.5a.9.9 0 1 1 0 1.7.9.9 0 0 1 0-1.7Zm4.1 0a.9.9 0 1 1 0 1.7.9.9 0 0 1 0-1.7Z" />
    </svg>
  );
}
