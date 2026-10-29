'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { track, visitorId } from '@/lib/analytics/visitor';
import { copyText } from '@/lib/clipboard';
import { analyze } from '@/lib/aiwei/engine';
import { dedupe } from '@/lib/aiwei/match';
import type { Span } from '@/lib/aiwei/types';
import { SAMPLE_BODY, SAMPLE_TITLE } from '@/lib/xhs/sample';
import { scanDoc, type Issue } from '@/lib/xhs/scan';
import { BODY_MAX_CHARS, TITLE_MAX_UNITS } from '@/lib/xhs/units';
import styles from './humanize.module.css';

const TOOL = 'humanize';
/** 检测是纯客户端算的，没有请求要省；300ms 只是为了不在每次按键时重排界面 */
const DEBOUNCE_MS = 300;
const MIN_CHARS = 20;

/** 问题清单上的一条：词表命中和 AI 味命中统一成同一种形状，界面才能混排 */
interface Row {
  key: string;
  label: string;
  /** hard 要用红点，它是「不改就别发」 */
  hard: boolean;
  detail: string;
  hint: string;
  spans: Span[];
}

function rowsOf(issues: Issue[], text: string): Row[] {
  const scan: Row[] = issues.map((i) => ({
    key: `w:${i.kind}:${i.industry ?? ''}`,
    label: i.label,
    hard: i.severity === 'hard',
    detail: i.hits.map((w) => `「${w}」`).join('、'),
    hint: i.recipe,
    spans: i.spans,
  }));

  const ai: Row[] = analyze(text).findings.map((f) => ({
    key: `a:${f.rule}`,
    label: f.label,
    hard: false,
    detail: f.detail,
    hint: f.hint,
    spans: f.spans,
  }));

  // 词表在前：会被限流的事比读起来像 AI 更急
  return [...scan.filter((r) => r.hard), ...scan.filter((r) => !r.hard), ...ai];
}

interface Result {
  title: string;
  body: string;
  note: string;
  changes: { from: string; to: string; why: string }[];
  score: number;
  after: { score: number; issues: Issue[] };
  warning?: string;
  quota?: { limit: number; used: number; left: number; scope: 'user' | 'anon' };
}

export default function Humanize() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [debounced, setDebounced] = useState({ title: '', body: '' });
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const firstMark = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ title, body }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title, body]);

  useEffect(() => {
    track('open', TOOL);
  }, []);

  const scan = useMemo(() => scanDoc(debounced.title, debounced.body), [debounced]);
  const rows = useMemo(() => rowsOf(scan.issues, scan.text), [scan]);
  const activeRow = rows.find((r) => r.key === active) ?? null;

  // 选中的那条被改没了（边改边看），自动退回编辑态
  useEffect(() => {
    if (active && !rows.some((r) => r.key === active)) setActive(null);
  }, [active, rows]);

  useEffect(() => {
    if (activeRow) firstMark.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeRow]);

  const { limits } = scan;
  const ready = debounced.body.trim().length >= MIN_CHARS;
  const hardCount = rows.filter((r) => r.hard).length;

  async function rewrite() {
    if (!ready || busy) return;
    track('run', TOOL);
    setBusy(true);
    setError('');
    setNeedLogin(false);
    // 不先清掉上一版：这次要是被额度拦下来或者网络出错，
    // 用户刚拿到的那版还在手上，不该因为手滑多点一次就没了

    try {
      const res = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vid: visitorId(), title, text: body }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.error) {
        setNeedLogin(Boolean(data?.needLogin));
        setError(data?.error || '改写失败了，请稍后重试');
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

  async function copyResult() {
    if (!result) return;
    const text = result.title ? `${result.title}\n\n${result.body}` : result.body;
    if (!(await copyText(text))) {
      // 剪贴板被拒时别假装成功 —— 用户会以为复制到了，粘出来是空的
      setError('浏览器不让自动复制，请手动选中上面的文字');
      return;
    }
    track('take', TOOL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function fillSample() {
    setTitle(SAMPLE_TITLE);
    setBody(SAMPLE_BODY);
    setResult(null);
    setActive(null);
  }

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>去AI味 · 一键改成人话</h1>
        <p className={styles.sub}>
          粘一段文案，<strong>先标出哪几句露了馅、哪些词会被限流，再给你一版改好的。</strong>
          违禁词表和废话句清单写死在代码里，不靠模型临场判断 —— 模型只负责改写，不负责判断。
        </p>
        <div className={styles.steps}>
          <span className={styles.step}>
            <span className={styles.stepNum}>1</span>粘进去，右边立刻列出问题
          </span>
          <span className={styles.step}>
            <span className={styles.stepNum}>2</span>点一条，跳到原文那个位置
          </span>
          <span className={styles.step}>
            <span className={styles.stepNum}>3</span>点「改成人话」拿改好的一版
          </span>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.left}>
          <div className={styles.panel}>
            <div className={styles.panelBar}>
              <span className={styles.panelTitle}>
                {activeRow ? `原文 · ${activeRow.label}` : '原文'}
              </span>
              <Meters
                titleUnits={limits.titleUnits}
                titleOver={limits.titleOver}
                bodyChars={limits.bodyChars}
                bodyOver={limits.bodyOver}
                tagChars={limits.tagChars}
                tagCount={limits.tags.length}
              />
            </div>

            {activeRow ? (
              <>
                <Highlighted text={scan.text} spans={activeRow.spans} firstRef={firstMark} />
                <div className={styles.panelFoot}>
                  <button className="btn btnSm" onClick={() => setActive(null)}>
                    继续编辑
                  </button>
                  <span className={styles.hint}>{activeRow.hint}</span>
                </div>
              </>
            ) : (
              <>
                <input
                  className={`${styles.titleInput} ${limits.titleOver > 0 ? styles.over : ''}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="标题（可以不填）"
                  spellCheck={false}
                />
                <textarea
                  className={`${styles.input} ${limits.bodyOver > 0 ? styles.over : ''}`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="把文案粘到这里。标签直接写在最后一行，形如 #养生 #秋季养生 —— 它们算在正文的 1000 字额度里。"
                  spellCheck={false}
                />
                <div className={styles.panelFoot}>
                  <button className="btn btnSm" onClick={fillSample}>
                    填个示例看看
                  </button>
                  {(title || body) && (
                    <button
                      className="btn btnSm btnQuiet"
                      onClick={() => {
                        setTitle('');
                        setBody('');
                        setResult(null);
                      }}
                    >
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
            {!ready ? (
              <p className={styles.placeholder}>
                左边粘一段文案，这里会实时列出问题。
                <br />
                不确定从哪开始？点「填个示例看看」。
              </p>
            ) : (
              <>
                <div className={styles.summary}>
                  <strong className={styles.count}>{rows.length}</strong>
                  <span className={styles.countMeta}>
                    <span>处问题</span>
                    {hardCount > 0 && (
                      <span className={styles.hardNote}>{hardCount} 处不改就别发</span>
                    )}
                  </span>
                </div>

                {limits.overLimit && (
                  <p className={styles.alert}>
                    {limits.titleOver > 0 &&
                      `标题超 ${limits.titleOver} 单位。`}
                    {limits.bodyOver > 0 &&
                      `正文超 ${limits.bodyOver} 字符（标签占了 ${limits.tagChars}）。`}
                    发布时会被截断，改写会一起压进额度。
                  </p>
                )}

                {rows.length === 0 ? (
                  <p className={styles.clean}>词表和 9 条规则都没命中，这段可以直接发。</p>
                ) : (
                  <ul className={styles.rows}>
                    {rows.map((r) => (
                      <li key={r.key}>
                        <button
                          className={`${styles.row} ${active === r.key ? styles.rowOn : ''}`}
                          onClick={() => setActive(active === r.key ? null : r.key)}
                          aria-pressed={active === r.key}
                        >
                          <span className={`${styles.dot} ${r.hard ? styles.hard : ''}`} />
                          <span className={styles.rowBody}>
                            <span className={styles.rowName}>{r.label}</span>
                            <span className={styles.rowDetail}>{r.detail}</span>
                          </span>
                          <span className={styles.rowGo} aria-hidden="true">
                            定位
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.actions}>
                  <button
                    className="btn btnPrimary"
                    onClick={rewrite}
                    disabled={busy || !ready}
                  >
                    {busy ? '正在改…' : '改成人话'}
                  </button>
                  {result?.quota && (
                    <span className={styles.quota}>
                      今天还能改 {result.quota.left} 次
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

                <details className={styles.about}>
                  <summary>这个工具怎么判断的</summary>
                  <p>
                    导流、医疗断言、《广告法》绝对化用语、五个行业的功效宣称词
                    （养生 / 医美 / 母婴 / 金融 / 食品），加一张「凑字数的话」清单，
                    全部是写死在代码里的词表，查表不靠判断 ——
                    靠判断会漏掉「祛湿」「补气血」「增强免疫力」这类词。
                  </p>
                  <p>
                    改写交给模型，但<strong>问题清单是代码算完之后塞给它的</strong>，
                    它只能照着改，不能自己决定什么算违规。改完再跑一遍同一个扫描器，
                    还剩必须改的词就重来一次；两次都没改干净会如实告诉你。
                  </p>
                  <p>
                    标题按平台的口径数单位（全角 1、半角 0.5，上限 {TITLE_MAX_UNITS}），
                    正文上限 {BODY_MAX_CHARS} 字符，<strong>标签算在同一个额度里</strong>。
                  </p>
                </details>
              </>
            )}
          </div>
        </section>
      </div>

      {result && (
        <div className={styles.result} ref={resultRef}>
          <div className={styles.panel}>
            <div className={styles.panelBar}>
              <span className={styles.panelTitle}>改好的一版</span>
              <span className={styles.delta}>
                AI味 {result.score} → <strong>{result.after.score}</strong> ·
                问题 {rows.length} → <strong>{result.after.issues.length}</strong>
              </span>
            </div>

            {result.warning && <p className={styles.alert}>{result.warning}</p>}

            {result.title && (
              <p className={styles.outTitle}>
                {result.title}
                <span className={styles.outMeta}>
                  {scanDoc(result.title, result.body).limits.titleUnits} / {TITLE_MAX_UNITS} 单位
                </span>
              </p>
            )}

            <div className={styles.outBody}>{result.body}</div>

            <div className={styles.panelFoot}>
              <button className="btn btnSm btnPrimary" onClick={copyResult}>
                {copied ? '已复制' : '复制标题和正文'}
              </button>
              <span className={styles.outMeta}>
                {scanDoc(result.title, result.body).limits.bodyChars} / {BODY_MAX_CHARS} 字符（含标签）
              </span>
            </div>

            {result.note && <p className={styles.note}>{result.note}</p>}

            {result.changes.length > 0 && (
              <details className={styles.about} open>
                <summary>改了哪几处（{result.changes.length}）</summary>
                <ul className={styles.changes}>
                  {result.changes.map((c, i) => (
                    <li key={i}>
                      <span className={styles.from}>{c.from}</span>
                      <span className={styles.arrow} aria-hidden="true">
                        →
                      </span>
                      <span className={styles.to}>{c.to}</span>
                      {c.why && <span className={styles.why}>{c.why}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Meters({
  titleUnits,
  titleOver,
  bodyChars,
  bodyOver,
  tagChars,
  tagCount,
}: {
  titleUnits: number;
  titleOver: number;
  bodyChars: number;
  bodyOver: number;
  tagChars: number;
  tagCount: number;
}) {
  return (
    <span className={styles.meters}>
      <span className={titleOver > 0 ? styles.meterOver : styles.meter}>
        标题 {titleUnits}/{TITLE_MAX_UNITS} 单位
      </span>
      <span
        className={bodyOver > 0 ? styles.meterOver : styles.meter}
        title={tagCount ? `其中标签 ${tagCount} 个，占 ${tagChars} 字符` : undefined}
      >
        正文 {bodyChars}/{BODY_MAX_CHARS}
        {tagCount > 0 && ` 含标签 ${tagChars}`}
      </span>
    </span>
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
