'use client';

import { useState } from 'react';
import type { Settings } from '@/lib/account/settings';
import styles from './admin.module.css';

type Msg = { tone: 'ok' | 'bad'; text: string } | null;

export function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState({
    signupGrant: String(initial.signupGrant),
    costPerChunk: String(initial.costPerChunk),
    markupRate: String(initial.markupRate),
    topupTiers: initial.topupTiers.join(', '),
    adminEmails: initial.adminEmails.join(', '),
    billingEnabled: initial.billingEnabled,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: 'bad', text: data?.error ?? '保存失败' });
        return;
      }
      setMsg({ tone: 'ok', text: '已保存，立即生效' });
    } catch {
      setMsg({ tone: 'bad', text: '网络不稳，没保存成功' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <span className={styles.panelTitle}>运营参数</span>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label htmlFor="signupGrant">新账户赠送算力</label>
          <input
            id="signupGrant"
            type="number"
            value={form.signupGrant}
            onChange={(e) => set('signupGrant', e.target.value)}
          />
          <small>默认 20，够排版 20 次短文，成本约 0.09 元/人</small>
        </div>

        <div className={styles.field}>
          <label htmlFor="costPerChunk">每块扣多少算力</label>
          <input
            id="costPerChunk"
            type="number"
            value={form.costPerChunk}
            onChange={(e) => set('costPerChunk', e.target.value)}
          />
          <small>短文是 1 块，1 万字约 4 块，所以长文会多扣</small>
        </div>

        <div className={styles.field}>
          <label htmlFor="markupRate">加价率</label>
          <input
            id="markupRate"
            type="number"
            step="0.05"
            value={form.markupRate}
            onChange={(e) => set('markupRate', e.target.value)}
          />
          <small>1.3 表示在 AI 成本上加三成。DeepSeek 调价时改这里，下面的成本表会跟着算</small>
        </div>

        <div className={styles.field}>
          <label htmlFor="topupTiers">充值档位（元）</label>
          <input
            id="topupTiers"
            type="text"
            value={form.topupTiers}
            onChange={(e) => set('topupTiers', e.target.value)}
          />
          <small>逗号分隔，会自动去重排序</small>
        </div>

        <div className={styles.field}>
          <label htmlFor="adminEmails">管理员邮箱</label>
          <input
            id="adminEmails"
            type="text"
            value={form.adminEmails}
            onChange={(e) => set('adminEmails', e.target.value)}
          />
          <small>逗号分隔。填了之后这些账户登录就能直接进后台，不用再带 token</small>
        </div>
      </div>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={form.billingEnabled}
          onChange={(e) => set('billingEnabled', e.target.checked)}
        />
        开启计费（未登录不能用 AI 排版，算力不够会拦下来）
      </label>
      <small style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -6 }}>
        关闭时照常记用量，谁都能用。登录页还没做，现在先别开。
      </small>

      <div className={styles.actions}>
        <button className="btn btnPrimary" type="button" onClick={save} disabled={busy}>
          {busy ? '保存中…' : '保存设置'}
        </button>
        {msg && <span className={`${styles.msg} ${msg.tone === 'bad' ? styles.msgBad : ''}`}>{msg.text}</span>}
      </div>
    </section>
  );
}

export function GrantForm() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, amount, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: 'bad', text: data?.error ?? '操作失败' });
        return;
      }
      setMsg({ tone: 'ok', text: `${data.email} 现在有 ${data.balance} 算力` });
      setAmount('');
      setNote('');
    } catch {
      setMsg({ tone: 'bad', text: '网络不稳，没成功' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <span className={styles.panelTitle}>手动调算力</span>
      <small style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: -8 }}>
        没接支付之前，用户付款后在这里给他加。填负数就是扣。
      </small>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label htmlFor="grantEmail">账户邮箱</label>
          <input id="grantEmail" type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="grantAmount">加多少（负数为扣）</label>
          <input id="grantAmount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="grantNote">备注</label>
          <input id="grantNote" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="微信转账 10 元" />
        </div>
      </div>

      <div className={styles.actions}>
        <button className="btn" type="button" onClick={submit} disabled={busy || !email || !amount}>
          {busy ? '处理中…' : '确认调整'}
        </button>
        {msg && <span className={`${styles.msg} ${msg.tone === 'bad' ? styles.msgBad : ''}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
