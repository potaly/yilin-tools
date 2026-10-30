'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { track, visitorId } from '@/lib/analytics/visitor';
import { copyText } from '@/lib/clipboard';
import { TAG_LAYERS, promiseMismatch, type CopyResult, type Tag } from '@/lib/xhs/copy';
import { FORMS } from '@/lib/xhs/copy-prompt';
import { putHandoff, takeHandoff } from '@/lib/xhs/handoff';
import { scanDoc } from '@/lib/xhs/scan';
import {
  GOALS,
  TRAFFIC_TYPES,
  describeTitle,
  titleProblems,
  type ScoredTitle,
  type TrafficType,
} from '@/lib/xhs/title';
import { BODY_MAX_CHARS, TITLE_MAX_UNITS, measure } from '@/lib/xhs/units';
import styles from './xhs-copy.module.css';

const TOOL = 'xhs-copy';

interface Result extends CopyResult {
  traffic: TrafficType;
  keyword: string;
  warning?: string;
  quota?: { limit: number; used: number; left: number; scope: 'user' | 'anon' };
}

export default function XhsCopy() {
  const [topic, setTopic] = useState('');
  const [keyword, setKeyword] = useState('');
  const [traffic, setTraffic] = useState<TrafficType>('search');
  const [form, setForm] = useState('knowledge');
  const [material, setMaterial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [picked, setPicked] = useState(0);
  const [copied, setCopied] = useState('');
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    track('open', TOOL);
    const handed = takeHandoff();
    if (handed) {
      if (handed.title) setTopic(handed.title.slice(0, 60));
      if (handed.keyword) setKeyword(handed.keyword);
      if (handed.material) setMaterial(handed.material);
    }
  }, []);

  // 搜索型没单独填核心词时，拿主题词顶上 —— 和服务端口径一致
  const effectiveKeyword = traffic === 'search' ? keyword.trim() || topic.trim() : '';

  async function generate() {
    if (!topic.trim() || busy) return;
    track('run', TOOL);
    setBusy(true);
    setError('');
    setNeedLogin(false);

    try {
      const res = await fetch('/api/xhs-copy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vid: visitorId(),
          topic: topic.trim(),
          keyword: keyword.trim(),
          traffic,
          form,
          material: material.trim(),
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.error) {
        setNeedLogin(Boolean(data?.needLogin));
        setError(data?.error || '生成失败了，请稍后重试');
        return;
      }

      setResult(data as Result);
      setPicked((data as Result).recommend ?? 0);
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

  async function copy(what: 'all' | 'body', text: string) {
    if (!(await copyText(text))) {
      setError('浏览器不让自动复制，请手动选中文字');
      return;
    }
    track('take', TOOL);
    setCopied(what);
    setTimeout(() => setCopied(''), 1800);
  }

  function toHumanize() {
    if (!result) return;
    putHandoff({
      from: TOOL,
      title: result.titles[picked]?.text ?? '',
      body: result.fullBody,
    });
    window.location.href = '/tools/check';
  }

  return (
    <div className={`shell ${styles.page}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>小红书文案</h1>
        <p className={styles.sub}>
          一个主题词，出 5–6 个标题候选 + 正文 + 四层标签。
          <strong>候选按「冲什么」分组，不按修辞罗列</strong> ——
          你要做的是业务决定（这个标题能换来什么），不是修辞选择。
          单位数和核心词位置由代码算，不是模型说了算。
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
              placeholder="例：油皮防晒怎么选"
              maxLength={60}
            />

            <div className={styles.field}>
              <span className={styles.label}>这篇主要吃哪种流量</span>
              <p className={styles.why}>
                两种的标题写法几乎相反，所以这个判断要放在最前面。
                判断方法：把标题念出来，问「有人会在搜索框里打这几个字吗」。
              </p>
              <div className={styles.choices}>
                {TRAFFIC_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.choice} ${traffic === t.id ? styles.choiceOn : ''}`}
                    onClick={() => setTraffic(t.id)}
                    aria-pressed={traffic === t.id}
                  >
                    <span className={styles.choiceName}>{t.label}</span>
                    <span className={styles.choiceWhen}>{t.when}</span>
                  </button>
                ))}
              </div>
            </div>

            {traffic === 'search' && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="kw">
                  核心关键词
                </label>
                <input
                  id="kw"
                  className={styles.input}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={topic.trim() ? `留空就用「${topic.trim()}」` : '留空就用主题词'}
                  maxLength={30}
                />
                <p className={styles.why}>
                  它必须落在标题前 6 个字内 —— 搜索权重最高的位置。每个候选会标出它落在第几个字。
                </p>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="form">
                内容形式
              </label>
              <select
                id="form"
                className={styles.select}
                value={form}
                onChange={(e) => setForm(e.target.value)}
              >
                {FORMS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className={styles.why}>决定正文骨架：叙事型（痛点→原因→解法）还是干货清单型（结论→维度+场景分层）。</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="material">
                你的真实素材（强烈建议填）
              </label>
              <textarea
                id="material"
                className={styles.textarea}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="真用过的产品、具体数字、踩过的坑、花了多少钱、第几周有变化……"
                maxLength={2000}
                spellCheck={false}
              />
              <p className={styles.why}>
                <strong>不填的话，正文里一个具体数字都不会有。</strong>
                这是故意的：编一个「能多走两站路」比写一句空话伤害更大 ——
                读者会照着做，评论区也会有人较真。没素材时会降级成不带数字的表述，并告诉你降了哪几处。
              </p>
            </div>

            <div className={styles.actions}>
              <button
                className="btn btnPrimary"
                onClick={generate}
                disabled={busy || !topic.trim()}
              >
                {busy ? '正在写…' : '生成文案'}
              </button>
              {result?.quota && (
                <span className={styles.quota}>
                  今天还能生成 {result.quota.left} 次
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
            <span className={styles.panelTitle}>这个工具怎么想的</span>
            <ol className={styles.method}>
              <li>
                <strong>先定搜索型还是发现型。</strong>
                小红书是双列信息流，用户主动挑着点，封面和标题是整条漏斗最窄的闸。
                搜索型要把核心词压进标题开头，发现型要把钩子放前半句 —— 几乎相反。
              </li>
              <li>
                <strong>标题出候选，不一次写定。</strong>
                一次写一个，等于拿整篇的流量赌一个没有比较对象的直觉。
              </li>
              <li>
                <strong>候选按「冲什么」分组。</strong>
                {GOALS.map((g) => `${g.label}要${g.wants}`).join('；')}。
                三类打法不同，你挑的是目标，不是句式。
              </li>
              <li>
                <strong>单位数和核心词位置代码算。</strong>
                模型会把「SPF50」数成 5 个单位。标题上限 {TITLE_MAX_UNITS} 单位
                （全角 1、半角 0.5），正文 {BODY_MAX_CHARS} 字符且标签算在同一额度里。
              </li>
              <li>
                <strong>新写的内容不许带违禁词。</strong>
                用户自己的原文有风险词可以保留并提醒，但工具新写的标题、正文、标签里
                绝对化用语和功效宣称一个都不该有 —— 那是工具惹的祸，不是你的选择。
              </li>
            </ol>
          </div>
        </section>
      </div>

      {result && (
        <div className={styles.result} ref={resultRef}>
          {result.warning && <p className={styles.alert}>{result.warning}</p>}

          <div className={styles.panel}>
            <div className={styles.panelBar}>
              <span className={styles.panelTitle}>
                标题候选 · {result.titles.length} 条
              </span>
              <span className={styles.meta}>点一条切换下面的正文预览</span>
            </div>

            {GOALS.map((goal) => {
              const group = result.titles
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => t.goal === goal.id);
              if (!group.length) return null;

              return (
                <div key={goal.id} className={styles.goalGroup}>
                  <div className={styles.goalHead}>
                    <span className={styles.goalName}>{goal.label}</span>
                    <span className={styles.goalWants}>{goal.wants}</span>
                  </div>
                  <ul className={styles.titles}>
                    {group.map(({ t, i }) => (
                      <li key={i}>
                        <TitleRow
                          title={t}
                          traffic={result.traffic}
                          index={i}
                          on={picked === i}
                          recommended={result.recommend === i}
                          onPick={() => setPicked(i)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {result.recommendWhy && (
              <p className={styles.recommend}>
                <strong>推荐</strong>
                {result.titles[result.recommend]?.text}
                —— {result.recommendWhy}
              </p>
            )}
          </div>

          <BodyPanel
            result={result}
            picked={picked}
            copied={copied}
            onCopyAll={() =>
              copy('all', `${result.titles[picked]?.text ?? ''}\n\n${result.fullBody}`)
            }
            onCopyBody={() => copy('body', result.fullBody)}
            onHumanize={toHumanize}
          />
        </div>
      )}
    </div>
  );
}

function TitleRow({
  title,
  traffic,
  index,
  on,
  recommended,
  onPick,
}: {
  title: ScoredTitle;
  traffic: TrafficType;
  index: number;
  on: boolean;
  recommended: boolean;
  onPick: () => void;
}) {
  const problems = titleProblems(title, traffic);

  return (
    <button
      className={`${styles.titleRow} ${on ? styles.titleOn : ''}`}
      onClick={onPick}
      aria-pressed={on}
    >
      <span className={styles.titleIndex}>{String(index + 1).padStart(2, '0')}</span>
      <span className={styles.titleBody}>
        <span className={styles.titleText}>
          {title.text}
          {recommended && <span className={styles.star}>推荐</span>}
        </span>
        <span className={styles.titleMeta}>{describeTitle(title, traffic)}</span>
        {title.why && <span className={styles.titleWhy}>{title.why}</span>}
        {problems.map((p) => (
          <span key={p} className={styles.titleProblem}>
            {p}
          </span>
        ))}
      </span>
    </button>
  );
}

function BodyPanel({
  result,
  picked,
  copied,
  onCopyAll,
  onCopyBody,
  onHumanize,
}: {
  result: Result;
  picked: number;
  copied: string;
  onCopyAll: () => void;
  onCopyBody: () => void;
  onHumanize: () => void;
}) {
  const pickedTitle = result.titles[picked]?.text ?? '';
  // 换候选会改变标题单位数，正文额度不变但一起重算，省得两处数字对不上
  const limits = useMemo(
    () => measure(pickedTitle, result.fullBody),
    [pickedTitle, result.fullBody]
  );
  const risky = useMemo(
    () => scanDoc(pickedTitle, result.fullBody).issues,
    [pickedTitle, result.fullBody]
  );
  // 标题承诺 N 个点、正文给了别的数 —— 换候选时要跟着重算
  const mismatch = useMemo(
    () => promiseMismatch(pickedTitle, result.body),
    [pickedTitle, result.body]
  );

  return (
    <div className={styles.panel}>
      <div className={styles.panelBar}>
        <span className={styles.panelTitle}>正文</span>
        <span className={styles.meters}>
          <span className={limits.titleOver > 0 ? styles.meterOver : styles.meter}>
            标题 {limits.titleUnits}/{TITLE_MAX_UNITS} 单位
          </span>
          <span className={limits.bodyOver > 0 ? styles.meterOver : styles.meter}>
            正文 {limits.bodyChars}/{BODY_MAX_CHARS} 含标签 {limits.tagChars}
          </span>
        </span>
      </div>

      <p className={styles.pickedTitle}>{pickedTitle}</p>
      <div className={styles.body}>{result.body}</div>

      <TagRow tags={result.tags} />

      {result.downgraded.length > 0 && (
        <div className={styles.downgraded}>
          <strong>这几处因为没有素材做了降级表述</strong>
          <ul>
            {result.downgraded.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <span className={styles.why}>
            把你的真实数字填进「素材」再生成一次，这几处会变成具体的 —— 信息密度就是从这来的。
          </span>
        </div>
      )}

      {mismatch && (
        <p className={styles.alert}>
          这个标题承诺了 {mismatch.promised} 个点，正文给了 {mismatch.got} 个。
          读者点进来发现对不上，三秒就走 —— 把标题的数字改成 {mismatch.got}，或者正文增减一点。
        </p>
      )}

      {risky.length > 0 && (
        <p className={styles.alert}>
          发之前先改这几处：
          {risky.map((i) => `${i.label}（${i.hits.join('、')}）`).join('；')}
        </p>
      )}

      {result.note && <p className={styles.note}>{result.note}</p>}

      <div className={styles.panelFoot}>
        <button className="btn btnSm btnPrimary" onClick={onCopyAll}>
          {copied === 'all' ? '已复制' : '复制标题和正文'}
        </button>
        <button className="btn btnSm" onClick={onCopyBody}>
          {copied === 'body' ? '已复制' : '只复制正文'}
        </button>
        <button className="btn btnSm btnQuiet" onClick={onHumanize}>
          拿去查 AI 味 →
        </button>
      </div>
    </div>
  );
}

function TagRow({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;

  return (
    <div className={styles.tags}>
      {(['broad', 'niche', 'scene'] as const).map((layer) => {
        const group = tags.filter((t) => t.layer === layer);
        if (!group.length) return null;
        return (
          <div key={layer} className={styles.tagLayer}>
            <span className={styles.tagLayerName}>
              {TAG_LAYERS[layer].label}
              <span className={styles.tagLayerWhat}>{TAG_LAYERS[layer].what}</span>
            </span>
            <span className={styles.tagList}>
              {group.map((t) => (
                <span key={t.text} className={styles.tag}>
                  #{t.text}
                </span>
              ))}
            </span>
          </div>
        );
      })}
      <p className={styles.why}>
        第四层「当下正在爆的话题词」没给 —— 工具不知道此刻什么话题在爆，编一个假话题名比不写糟。
        去小红书搜你的核心词，看结果页顶部的话题聚合，自己挑一个挂上。
      </p>
    </div>
  );
}
