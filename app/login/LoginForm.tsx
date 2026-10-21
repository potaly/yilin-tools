'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';
import styles from './login.module.css';

type Step = 'loading' | 'email' | 'code' | 'signedIn';
type Notice = { tone: 'info' | 'bad'; text: string } | null;

interface Me {
  signedIn: boolean;
  email?: string;
  balance?: number;
  admin?: boolean;
}

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
          <span className={styles.accountEmail}>{me.email}</span>
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

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>登录{SITE.name}</h1>
      <p className={styles.lede}>
        用邮箱收一个验证码就能登录，不用设密码。新账户送 20 次 AI 排版。
      </p>

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

      {step === 'email' ? (
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
