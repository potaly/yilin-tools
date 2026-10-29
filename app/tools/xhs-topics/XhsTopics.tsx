'use client';

import { useEffect, useRef, useState } from 'react';
import { track, visitorId } from '@/lib/analytics/visitor';
import { copyText } from '@/lib/clipboard';
import { putHandoff } from '@/lib/xhs/handoff';
import { MOTIVES, MOTHER_THEMES, VERIFY_STEPS, motiveMeta } from '@/lib/xhs/topics';
import type { TopicItem, TopicPlan } from '@/lib/xhs/topic-plan';
import styles from './xhs-topics.module.css';

const TOOL = 'xhs-topics';

interface Result extends TopicPlan {
  topic: string;
  warning?: string;
  quota?: { limit: number; used: number; left: number; scope: 'user' | 'anon' };
}

export default function XhsTopics() {
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    track('open', TOOL);
  }, []);

  async function generate() {
    if (!topic.trim() || busy) return;
    track('run', TOOL);
    setBusy(true);
    setError('');
    setNeedLogin(false);

    try {
      const res = await fetch('/api/xhs-topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vid: visitorId(), topic: topic.trim(), focus: focus.trim() }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.error) {
        setNeedLogin(Boolean(data?.needLogin));
        setError(data?.error || '生成失败了，请稍后重试');
        return;
      }

      setResult(data as Result);
      track('done', TOOL);
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      );
    } catch {
      setError('网络不太顺，请再试一次');
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    if (!result) return;
    if (!(await copyText(toText(result)))) {
      setError('浏览器不让自动复制，请手动选中文字');
      return;
    }
    track('take', TOOL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function writeIt(item: TopicItem) {
    putHandoff({
      from: TOOL,
      title: item.title,
      keyword: result?.topic ?? '',
      // 主线就是写这篇的素材，带过去省得用户再敲一遍
      material: [item.scene, item.why, ...item.actions].filter(Boolean).join('\n'),
    });
    window.location.href = '/tools/xhs-copy';
  }

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>小红书选题</h1>
        <p className={styles.sub}>
          一个主题词，拆成按人群和时刻分组的选题矩阵。每条标清<strong>动机和排期顺序</strong>，
          并告诉你<strong>哪一步必须自己去搜索框验证</strong> ——
          选题是扒出来的，不是想出来的，这个工具扒不到小红书的数据，所以不假装它扒过。
        </p>
      </header>

      <div className={styles.grid}>
        <section className={styles.left}>
          <div className={styles.panel}>
            <label className={styles.label} htmlFor="topic">
              主题词
            </label>
            <input
              id="topic"
              className={styles.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例：小户型收纳"
              maxLength={60}
            />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="focus">
                只要某个细分（可以不填）
              </label>
              <input
                id="focus"
                className={styles.input}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="例：只要租房党的、只要宝妈向"
                maxLength={120}
              />
              <p className={styles.why}>
                填了就在这一类里深挖，不硬凑满 6 组。
              </p>
            </div>

            <div className={styles.actions}>
              <button
                className="btn btnPrimary"
                onClick={generate}
                disabled={busy || !topic.trim()}
              >
                {busy ? '正在拆…' : '拆选题'}
              </button>
              {result?.quota && (
                <span className={styles.quota}>
                  今天还能拆 {result.quota.left} 次
                  {result.quota.scope === 'anon' && '（登录后每天 20 次）'}
                </span>
              )}
            </div>

            {error && (
              <p className={styles.error}>
                {error}
                {needLogin && (
                  <>
                    {' '}
                    <a className={styles.link} href="/login">
                      去登录
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </section>

        <section className={styles.right}>
          <div className={styles.panel}>
            <span className={styles.panelTitle}>搜同一个词的三种人</span>
            <p className={styles.why}>
              不分清就会把选题全写成泛科普：有阅读，没收藏，没关注。
              下面的矩阵里每条都会标出它服务哪一种。
            </p>
            <ul className={styles.motives}>
              {MOTIVES.map((m) => (
                <li key={m.id} className={styles.motive}>
                  <span className={`${styles.badge} ${styles[m.id]}`}>{m.label}</span>
                  <span className={styles.motiveBody}>
                    <span className={styles.motiveState}>{m.state}</span>
                    <span className={styles.motiveMeta}>
                      {m.positioning} · {m.pattern}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.schedule}>
              <strong>排期顺序</strong>
              {MOTIVES.map((m) => m.label).join(' → ')}：
              {MOTIVES.map((m) => m.why).join('；')}。
            </p>

            <details className={styles.about}>
              <summary>爆款选题跑不出的四个母题</summary>
              <ul className={styles.themes}>
                {MOTHER_THEMES.map((t) => (
                  <li key={t.label}>
                    <strong>{t.label}</strong>
                    <span>{t.drive}</span>
                    <span className={styles.themeForms}>{t.forms}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.why}>一篇笔记最好只服务一个母题。同时想讲省钱又讲情绪，两头都不到位。</p>
            </details>
          </div>
        </section>
      </div>

      {result && (
        <div className={styles.result} ref={resultRef}>
          {result.warning && <p className={styles.alert}>{result.warning}</p>}

          {result.intro && (
            <div className={styles.panel}>
              <p className={styles.intro}>{result.intro}</p>
            </div>
          )}

          {result.firstUp.length > 0 && (
            <div className={styles.panel}>
              <span className={styles.panelTitle}>建议先发这 {result.firstUp.length} 条</span>
              <p className={styles.why}>
                按排期顺序挑的：{MOTIVES.map((m) => m.label).join(' → ')}。
                新账号尤其先发外显型，它最容易冲过第一级流量池。
              </p>
              <ol className={styles.firstUp}>
                {result.firstUp.map(({ item, group }, i) => (
                  <li key={i}>
                    <span className={`${styles.badge} ${styles[item.motive]}`}>
                      {motiveMeta(item.motive).label}
                    </span>
                    <span className={styles.firstUpTitle}>{item.title}</span>
                    <span className={styles.firstUpGroup}>{group}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className={styles.panel}>
            <div className={styles.panelBar}>
              <span className={styles.panelTitle}>
                选题矩阵 · {result.groups.length} 组 {result.count} 条
              </span>
              <button className="btn btnSm" onClick={copyAll}>
                {copied ? '已复制' : '复制整份'}
              </button>
            </div>

            {result.groups.map((g) => (
              <div key={g.slice} className={styles.group}>
                <div className={styles.groupHead}>
                  <span className={styles.groupName}>{g.slice}</span>
                  {g.value && <span className={styles.groupValue}>{g.value}</span>}
                </div>
                <ul className={styles.items}>
                  {g.items.map((item, i) => (
                    <li key={i} className={styles.item}>
                      <div className={styles.itemHead}>
                        <span className={`${styles.badge} ${styles[item.motive]}`}>
                          {motiveMeta(item.motive).label}
                        </span>
                        <span className={styles.itemTitle}>{item.title}</span>
                        {item.claimsExperience && (
                          <span className={styles.mine} title="这条写成了「我做过」的口吻">
                            需你真做过
                          </span>
                        )}
                      </div>
                      <p className={styles.line}>
                        <span className={styles.lineStep}>{item.scene}</span>
                        <span className={styles.arrow} aria-hidden="true">
                          →
                        </span>
                        <span className={styles.lineStep}>{item.why}</span>
                        <span className={styles.arrow} aria-hidden="true">
                          →
                        </span>
                        <span className={styles.lineActions}>{item.actions.join('、')}</span>
                      </p>
                      <button className={styles.writeIt} onClick={() => writeIt(item)}>
                        用这条写文案 →
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {result.needsRealExperience.length > 0 && (
            <div className={styles.panel}>
              <span className={styles.panelTitle}>
                这 {result.needsRealExperience.length} 条写成了「我做过」的口吻
              </span>
              <p className={styles.why}>
                <strong>只有你真做过才用。</strong>
                第一人称经历是最好用的句式，也是最容易翻车的 ——
                编一段没发生过的经历，评论区一问细节就露馅，整篇的可信度就没了。
                没这段经历的话，把「我停掉了×××」改成「×××可以先停两周看看」，句式换掉，选题还在。
              </p>
              <ul className={styles.boundaries}>
                {result.needsRealExperience.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {result.formulas.length > 0 && (
            <div className={styles.panel}>
              <span className={styles.panelTitle}>这个主题的标题公式</span>
              <p className={styles.why}>
                从上面这批标题里归纳出来的，比通用句式好套 —— 也说明这张表不是模板填出来的。
              </p>
              <ul className={styles.formulas}>
                {result.formulas.map((f, i) => (
                  <li key={i}>
                    <span className={styles.pattern}>{f.pattern}</span>
                    {f.example && <span className={styles.example}>{f.example}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.panel}>
            <span className={styles.panelTitle}>下一步：去小红书验证</span>
            <p className={styles.why}>
              <strong>上面这张表是推出来的假设，不是扒出来的数据。</strong>
              专业的选题来自搜索下拉框和竞品评论区 —— 这个工具拿不到那些，
              所以把方法给你，别让它替你假装验证过。
            </p>
            {result.searchTerms.length > 0 && (
              <div className={styles.terms}>
                <span className={styles.termsLabel}>先去搜这几个词</span>
                <span className={styles.termsList}>
                  {result.searchTerms.map((t) => (
                    <span key={t} className={styles.term}>
                      {t}
                    </span>
                  ))}
                </span>
              </div>
            )}
            <ol className={styles.verify}>
              {VERIFY_STEPS.map((s) => (
                <li key={s.action}>
                  <strong>{s.action}</strong>
                  <span>{s.why}</span>
                </li>
              ))}
            </ol>
          </div>

          {result.boundaries.length > 0 && (
            <div className={styles.panel}>
              <span className={styles.panelTitle}>写作边界</span>
              <p className={styles.why}>
                这几条要写进交付物里，而不是靠每篇临场判断 —— 选题会被批量照着写，
                一条漏了会复制到十几篇里。
              </p>
              <ul className={styles.boundaries}>
                {result.boundaries.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 复制整份：给要存档排期的人 */
function toText(plan: Result): string {
  const lines: string[] = [`# ${plan.topic} · 小红书选题库`, ''];

  if (plan.intro) lines.push(plan.intro, '');

  for (const g of plan.groups) {
    lines.push(`## ${g.slice}${g.value ? `（${g.value}）` : ''}`);
    for (const item of g.items) {
      lines.push(`- [${motiveMeta(item.motive).label}] ${item.title}`);
      lines.push(`  ${item.scene} → ${item.why} → ${item.actions.join('、')}`);
    }
    lines.push('');
  }

  if (plan.formulas.length) {
    lines.push('## 标题公式');
    for (const f of plan.formulas) lines.push(`- ${f.pattern}${f.example ? `  例：${f.example}` : ''}`);
    lines.push('');
  }

  if (plan.searchTerms.length) {
    lines.push('## 去小红书验证', `先搜：${plan.searchTerms.join('、')}`);
    for (const s of VERIFY_STEPS) lines.push(`- ${s.action}（${s.why}）`);
    lines.push('');
  }

  if (plan.boundaries.length) {
    lines.push('## 写作边界');
    for (const b of plan.boundaries) lines.push(`- ${b}`);
  }

  return lines.join('\n');
}
