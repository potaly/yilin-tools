'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '@/lib/aiwei/engine';
import { dedupe } from '@/lib/aiwei/match';
import { toPlainText } from '@/lib/aiwei/report';
import { ALL_RULES } from '@/lib/aiwei/rules';
import { SAMPLE } from '@/lib/aiwei/sample';
import { LEVEL_TEXT, SCORE_FORMULA } from '@/lib/aiwei/score';
import type { RuleId, Span } from '@/lib/aiwei/types';
import styles from './ai-flavor.module.css';

/** 纯客户端计算，没有请求要省，300ms 只是为了不在每次按键时重排界面 */
const DEBOUNCE_MS = 300;

export default function AiFlavor() {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState<RuleId | null>(null);
  const [copied, setCopied] = useState(false);
  const firstMark = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const report = useMemo(() => analyze(debounced), [debounced]);
  const activeFinding = report.findings.find((f) => f.rule === active) ?? null;

  // 选中的命中项被改没了（边改边测），自动退回编辑态
  useEffect(() => {
    if (active && !report.findings.some((f) => f.rule === active)) setActive(null);
  }, [active, report]);

  useEffect(() => {
    if (activeFinding) firstMark.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeFinding]);

  const empty = debounced.trim().length === 0;

  async function copyReport() {
    await navigator.clipboard.writeText(toPlainText(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>AI味检测</h1>
        <p className={styles.sub}>
          粘一段文字，告诉你哪几句露了馅、在第几段。
          <strong>9 条规则写死在代码里，不调 AI</strong> —— 不上传、断网也能用。
        </p>
        <div className={styles.steps}>
          <span className={styles.step}>
            <span className={styles.stepNum}>1</span>粘进去
          </span>
          <span className={styles.step}>
            <span className={styles.stepNum}>2</span>看命中了哪几条
          </span>
          <span className={styles.step}>
            <span className={styles.stepNum}>3</span>点一条，跳到原文那个位置
          </span>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.left}>
          <div className={styles.panel}>
            <div className={styles.panelBar}>
              <span className={styles.panelTitle}>
                {activeFinding ? `原文 · ${activeFinding.label}` : '原文'}
              </span>
              <span className={styles.count}>{report.stats.charCount} 字</span>
            </div>

            {activeFinding ? (
              <>
                <Highlighted
                  text={report.text}
                  spans={activeFinding.spans}
                  firstRef={firstMark}
                />
                <div className={styles.panelFoot}>
                  <button className="btn btnSm" onClick={() => setActive(null)}>
                    继续编辑
                  </button>
                  <span className={styles.hint}>{activeFinding.hint}</span>
                </div>
              </>
            ) : (
              <>
                <textarea
                  className={styles.input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="把要检查的文字粘到这里。不用登录，文字只留在你自己的浏览器里。"
                  spellCheck={false}
                />
                <div className={styles.panelFoot}>
                  <button className="btn btnSm" onClick={() => setText(SAMPLE)}>
                    填个示例看看
                  </button>
                  {text && (
                    <button className="btn btnSm btnQuiet" onClick={() => setText('')}>
                      清空
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section className={styles.right}>
          <div className={styles.panel}>
            {empty ? (
              <p className={styles.placeholder}>
                左边粘一段文字，这里会实时给出结果。
                <br />
                不确定从哪开始？点「填个示例看看」。
              </p>
            ) : (
              <>
                <div className={styles.scoreRow}>
                  <strong className={`${styles.score} ${styles[report.level]}`}>
                    {report.score}
                  </strong>
                  <span className={styles.scoreMeta}>
                    <span className={styles.scoreLabel}>AI味指数 / 100</span>
                    <span className={styles.scoreLevel}>{LEVEL_TEXT[report.level]}</span>
                  </span>
                </div>

                {report.findings.length === 0 ? (
                  <p className={styles.clean}>9 条规则一条都没命中。</p>
                ) : (
                  <ul className={styles.findings}>
                    {report.findings.map((f) => (
                      <li key={f.rule}>
                        <button
                          className={`${styles.finding} ${
                            active === f.rule ? styles.findingOn : ''
                          }`}
                          onClick={() => setActive(active === f.rule ? null : f.rule)}
                          aria-pressed={active === f.rule}
                        >
                          <span className={`${styles.dot} ${styles[`sev${f.severity}`]}`} />
                          <span className={styles.findingBody}>
                            <span className={styles.findingName}>{f.label}</span>
                            <span className={styles.findingDetail}>{f.detail}</span>
                          </span>
                          <span className={styles.findingGo} aria-hidden="true">
                            定位
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.actions}>
                  <button className="btn btnSm btnPrimary" onClick={copyReport}>
                    {copied ? '已复制' : '复制报告'}
                  </button>
                </div>

                <details className={styles.about}>
                  <summary>分数是怎么算的</summary>
                  <p className={styles.formula}>{SCORE_FORMULA}</p>
                  <ul className={styles.ruleList}>
                    {ALL_RULES.map((r) => (
                      <li key={r.id}>
                        <span>{r.label}</span>
                        <span className={styles.weight}>权重 {r.weight}</span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.formula}>
                    规则是确定的，同一段文字每次检测结果都一样。模型会临场判断，所以它会漏。
                  </p>
                </details>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Highlighted({
  text,
  spans,
  firstRef,
}: {
  text: string;
  spans: Span[];
  firstRef: React.MutableRefObject<HTMLElement | null>;
}) {
  const merged = useMemo(() => dedupe(spans), [spans]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  merged.forEach((s, i) => {
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    parts.push(
      <mark key={i} className={styles.mark} ref={i === 0 ? firstRef : undefined}>
        {text.slice(s.start, s.end)}
      </mark>
    );
    cursor = s.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <div className={styles.reader}>{parts}</div>;
}
