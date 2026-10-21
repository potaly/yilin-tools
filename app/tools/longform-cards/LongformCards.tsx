'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cardFont } from '@/app/fonts';
import { clean, normalizeInput } from '@/lib/cards/clean';
import { drawCover } from '@/lib/cards/cover';
import { drawPage, footerHeight } from '@/lib/cards/draw';
import {
  isTouchDevice,
  saveAllImages,
  savePage,
  savePdf,
  type PageImage,
} from '@/lib/cards/export';
import { createCanvasMeasurer } from '@/lib/cards/linebreak';
import {
  pushSnapshot,
  redoStep,
  snapshot,
  truncate,
  undoStep,
  type Snapshot,
} from '@/lib/cards/history';
import { clearHeading, toggleBold, toggleHeading, type MarkupResult } from '@/lib/cards/markup';
import { dropEmptyPages, paginate } from '@/lib/cards/paginate';
import { makeSlug, parse, plain, toEditorText, wordCount } from '@/lib/cards/parse';
import { SAMPLE } from '@/lib/cards/sample';
import {
  DEFAULT_TEMPLATE,
  TEMPLATES,
  templateById,
  titleFamily,
} from '@/lib/cards/templates';
import {
  DENSITY_LABEL,
  RATIO_HEIGHT,
  autoDensity,
  isDensity,
  metricsFor,
  readingMinutes,
  type Density,
  type Ratio,
} from '@/lib/cards/spec';
import styles from './longform.module.css';

const DRAFT_KEY = 'yilin:longform-cards:draft';
const FONT_FAMILY = cardFont.style.fontFamily;

type DensityChoice = 'auto' | Density;
type Busy = null | 'ai' | 'zip' | 'pdf';

interface Notice {
  tone: 'info' | 'warn';
  text: string;
}

export default function LongformCards() {
  const [text, setText] = useState(SAMPLE);
  const [ratio, setRatio] = useState<Ratio>('3:5');
  const [densityChoice, setDensityChoice] = useState<DensityChoice>('auto');
  const [showMeta, setShowMeta] = useState(true);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.id);
  const [useCover, setUseCover] = useState(false);
  const [showPageNumber, setShowPageNumber] = useState(false);
  const [author, setAuthor] = useState('');

  const [pages, setPages] = useState<{ url: string; image: PageImage }[]>([]);
  const [words, setWords] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [toast, setToast] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [onPhone, setOnPhone] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastRecord = useRef(0);
  const pendingSelection = useRef<[number, number] | null>(null);
  const seq = useRef(0);
  const urls = useRef<string[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const say = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const density: Density = densityChoice === 'auto' ? autoDensity(words) : densityChoice;

  /* ---------- 排版与绘制 ---------- */

  const render = useCallback(async () => {
    const mine = ++seq.current;
    const blocks = parse(text);
    const count = wordCount(blocks);
    setWords(count);

    const picked: Density = densityChoice === 'auto' ? autoDensity(count) : densityChoice;
    await ensureFonts(text);
    if (mine !== seq.current) return;

    const height = RATIO_HEIGHT[ratio];
    const metrics = metricsFor(picked);
    const measure = createCanvasMeasurer();
    const info = { words: count, minutes: readingMinutes(count) };
    const template = templateById(templateId);
    const titleFont = titleFamily(template, FONT_FAMILY);
    const footer = { pageNumber: showPageNumber, author };

    // 开了封面页就把大标题抽出来单独成页，正文从第二页开始
    const titleBlock = useCover ? blocks.find((b) => b.type === 'title') : undefined;
    const flow = titleBlock ? blocks.filter((b) => b !== titleBlock) : blocks;

    const ops = flow.length
      ? dropEmptyPages(
          paginate(flow, {
            height,
            showMeta,
            metrics,
            measure,
            fontFamily: FONT_FAMILY,
            titleFontFamily: titleFont,
            footerH: footerHeight(footer),
          }),
        )
      : [];

    const total = ops.length + (titleBlock ? 1 : 0);
    const canvases: HTMLCanvasElement[] = [];
    if (titleBlock) {
      canvases.push(
        drawCover({
          height,
          title: titleBlock.text,
          subtitle: subtitleOf(flow),
          template,
          footer,
          fontFamily: FONT_FAMILY,
          titleFontFamily: titleFont,
          measure,
        }),
      );
    }
    ops.forEach((page, i) =>
      canvases.push(
        drawPage(page, {
          height,
          info,
          metrics,
          fontFamily: FONT_FAMILY,
          titleFontFamily: titleFont,
          template,
          footer,
          pageNumber: i + 1 + (titleBlock ? 1 : 0),
          pageCount: total,
        }),
      ),
    );

    const blobs = await Promise.all(
      canvases.map(
        (c) => new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png')),
      ),
    );
    if (mine !== seq.current) return;

    const slug = makeSlug(blocks);
    const next = blobs.flatMap((blob, i) =>
      blob
        ? [
            {
              url: URL.createObjectURL(blob),
              image: { blob, name: `${slug}-${String(i + 1).padStart(2, '0')}.png` },
            },
          ]
        : [],
    );

    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = next.map((p) => p.url);
    setPages(next);
  }, [text, ratio, densityChoice, showMeta, templateId, useCover, showPageNumber, author]);

  // 输入防抖 300ms
  useEffect(() => {
    const timer = setTimeout(render, 300);
    return () => clearTimeout(timer);
  }, [render]);

  // 字体加载完成后再排一次，否则第一张图会是系统字体
  useEffect(() => {
    if (!document.fonts?.addEventListener) return;
    const onDone = () => render();
    document.fonts.addEventListener('loadingdone', onDone);
    return () => document.fonts.removeEventListener('loadingdone', onDone);
  }, [render]);

  useEffect(() => setOnPhone(isTouchDevice()), []);

  // 点完格式按钮把光标放回原处，不然每点一次都要重新选
  useEffect(() => {
    const sel = pendingSelection.current;
    const el = editorRef.current;
    if (!sel || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
  }, [text]);

  // AI 排版期间走一个秒表，上游慢的时候让用户看得见在动
  useEffect(() => {
    if (busy !== 'ai') return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // 草稿：进来时读一次。
  // 保存只跟着用户的实际改动走，不用 useEffect——否则挂载那一轮会先用示例文字把草稿覆盖掉。
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft && draft.trim()) setText(draft);
    } catch {
      /* 隐私模式下读不到就算了 */
    }
  }, []);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /* ---------- 操作 ---------- */

  const saveDraft = useCallback((value: string) => {
    try {
      localStorage.setItem(DRAFT_KEY, value);
    } catch {
      /* 写不进去也不影响使用 */
    }
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  /** 当前编辑状态，含光标位置 */
  const currentSnapshot = useCallback((): Snapshot => {
    const el = editorRef.current;
    return snapshot(text, el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length);
  }, [text]);

  /**
   * 改文字的唯一入口。
   * mode 为 'typing' 时把连续输入合并成一步（停顿 700ms 才开新的一步），
   * 'action' 是按钮触发的整体改动，每次都单独记一步。
   */
  const updateText = useCallback(
    (raw: string, mode: 'typing' | 'action' = 'action') => {
      // 粘进来的文字可能带 U+2028 这类看不见的换行，先统一掉再进状态
      const next = normalizeInput(raw);
      const now = Date.now();
      const shouldRecord = mode === 'action' || now - lastRecord.current >= 700;
      if (shouldRecord) {
        past.current = pushSnapshot(past.current, currentSnapshot());
        future.current = [];
        lastRecord.current = now;
        syncHistoryFlags();
      }
      setText(next);
      saveDraft(next);
    },
    [currentSnapshot, saveDraft, syncHistoryFlags],
  );

  const applySnapshot = useCallback(
    (snap: Snapshot) => {
      pendingSelection.current = [snap.selectionStart, snap.selectionEnd];
      setText(snap.text);
      saveDraft(snap.text);
      lastRecord.current = 0; // 撤销之后再输入要开新的一步
      syncHistoryFlags();
    },
    [saveDraft, syncHistoryFlags],
  );

  const doUndo = useCallback(() => {
    const move = undoStep(past.current, future.current, currentSnapshot());
    if (!move) return;
    past.current = move.past;
    future.current = move.future;
    applySnapshot(move.snapshot);
  }, [applySnapshot, currentSnapshot]);

  const doRedo = useCallback(() => {
    const move = redoStep(past.current, future.current, currentSnapshot());
    if (!move) return;
    past.current = move.past;
    future.current = move.future;
    applySnapshot(move.snapshot);
  }, [applySnapshot, currentSnapshot]);

  /** 对当前选区套用一个格式标记 */
  function applyMarkup(fn: (text: string, start: number, end: number) => MarkupResult) {
    const el = editorRef.current;
    if (!el) return;
    const result = fn(text, el.selectionStart, el.selectionEnd);
    pendingSelection.current = [result.selectionStart, result.selectionEnd];
    updateText(result.text);
  }

  async function runAi() {
    if (!text.trim() || busy) return;
    const original = text;
    setBusy('ai');

    // 记下动手前的历史长度，等 AI 回来把「快速清理 + AI 结果」合成一步撤销
    const mark = past.current.length;

    // 先用规则清理出一版，点下去立刻能看到卡片变化，不用盯着转圈等
    const quick = clean(original);
    if (quick.trim() && quick.trim() !== original.trim()) updateText(quick);
    setNotice({ tone: 'info', text: '已先做了一遍快速清理，AI 正在重新分段和提炼小标题。' });

    try {
      const res = await fetch('/api/ai-format', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: original }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateText(original); // 失败就回到原文，不留下半成品
        past.current = truncate(past.current, mark);
        syncHistoryFlags();
        setNotice(null);
        say(data?.retryAfter ? `${data.error}（${data.retryAfter} 秒后可再试）` : (data?.error ?? '排版失败了'));
        return;
      }
      updateText(toEditorText(data));
      // 快速清理和 AI 结果合成一步：撤销一次就回到原文
      past.current = pushSnapshot(truncate(past.current, mark), snapshot(original));
      syncHistoryFlags();
      if (isDensity(data.density)) setDensityChoice(data.density);
      setNotice(data.warning ? { tone: 'warn', text: data.warning } : null);
      say('已排版，可以继续手改');
    } catch {
      updateText(original);
      past.current = truncate(past.current, mark);
      syncHistoryFlags();
      setNotice(null);
      say('网络不太稳，请再试一次');
    } finally {
      setBusy(null);
    }
  }

  function runClean() {
    if (!text.trim()) return;
    const next = clean(text);
    if (next.trim() === text.trim()) {
      say('已经很整齐了，没有需要清理的地方');
      return;
    }
    updateText(next);
    setNotice(null);
    say('已清理，可以继续点「AI 排版」');
  }

  async function exportAll(kind: 'zip' | 'pdf') {
    if (!pages.length || busy) return;
    setBusy(kind);
    try {
      const slug = pages[0].image.name.replace(/-\d+\.png$/, '');
      const images = pages.map((p) => p.image);
      const result =
        kind === 'zip'
          ? await saveAllImages(images, `${slug}.zip`)
          : await savePdf(images, { width: 1080, height: RATIO_HEIGHT[ratio] }, `${slug}.pdf`);
      if (result === 'downloaded') say(kind === 'zip' ? '图片已打包下载' : 'PDF 已下载');
      else if (result === 'shared') say(kind === 'zip' ? '选「存储图像」就进相册了' : '已发送');
    } catch {
      say('导出失败了，请重试');
    } finally {
      setBusy(null);
    }
  }

  const empty = !text.trim() || !pages.length;

  return (
    <div className="shell">
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>长文图卡</h1>
          <p className={styles.sub}>
            把一段文字排成手机比例的长图卡片，米白底、棕色字，适合发朋友圈、小红书和公众号。
          </p>
          <div className={styles.steps}>
            <span className={styles.step}>
              <span className={styles.stepNum}>1</span>粘贴你的文字
            </span>
            <span className={styles.step}>
              <span className={styles.stepNum}>2</span>点「AI 排版」自动分段
            </span>
            <span className={styles.step}>
              <span className={styles.stepNum}>3</span>保存成图片或 PDF
            </span>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={styles.left}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>你的文字</span>
                <div className={styles.toolbarRight}>
                  <button className="btn btnQuiet btnSm" type="button" onClick={() => updateText(SAMPLE)}>
                    填入示例
                  </button>
                  <button
                    className="btn btnQuiet btnSm"
                    type="button"
                    disabled={!text}
                    onClick={() => {
                      updateText('');
                      setNotice(null);
                    }}
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className={styles.toolbar}>
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={runAi}
                  disabled={!text.trim() || busy !== null}
                >
                  {busy === 'ai' ? (
                    <>
                      <span className={styles.busy} aria-hidden="true" />{' '}
                      {elapsed > 1 ? `排版中 ${elapsed}s…` : '排版中…'}
                    </>
                  ) : (
                    <>✦ AI 排版</>
                  )}
                </button>
                <button className="btn" type="button" onClick={runClean} disabled={!text.trim() || busy !== null}>
                  快速清理
                </button>
                <button className="btn" type="button" disabled={!canUndo} onClick={doUndo}>
                  撤销
                </button>
                <button className="btn" type="button" disabled={!canRedo} onClick={doRedo}>
                  重做
                </button>
              </div>

              {notice && (
                <p className={`${styles.hint} ${notice.tone === 'warn' ? styles.hintWarn : ''}`}>
                  <span aria-hidden="true">{notice.tone === 'warn' ? '⚠' : '✦'}</span>
                  {notice.text}
                </p>
              )}

              <div className={styles.formatBar}>
                <span className={styles.formatHint}>把光标放到某一行，或选中一段文字：</span>
                <div className={styles.formatBtns}>
                  <button
                    className="btn btnSm"
                    type="button"
                    onClick={() => applyMarkup((t, a, b) => toggleHeading(t, a, b, 1))}
                  >
                    设为大标题
                  </button>
                  <button
                    className="btn btnSm"
                    type="button"
                    onClick={() => applyMarkup((t, a, b) => toggleHeading(t, a, b, 2))}
                  >
                    设为小标题
                  </button>
                  <button
                    className="btn btnSm"
                    type="button"
                    onClick={() => applyMarkup(toggleBold)}
                  >
                    加粗
                  </button>
                  <button
                    className="btn btnQuiet btnSm"
                    type="button"
                    onClick={() => applyMarkup(clearHeading)}
                  >
                    变回正文
                  </button>
                </div>
              </div>

              <textarea
                ref={editorRef}
                className={styles.editor}
                value={text}
                spellCheck={false}
                aria-label="要排版的文字"
                placeholder={
                  '把你要做成图片的文字粘到这里。\n\n' +
                  '不用懂格式：粘好之后，把光标放到想当标题的那一行，点上面的「设为大标题」就行。\n\n' +
                  '或者直接点「AI 排版」，让 AI 帮你分好段、起好标题。'
                }
                onChange={(e) => updateText(e.target.value, 'typing')}
                onKeyDown={(e) => {
                  if (!(e.metaKey || e.ctrlKey)) return;
                  const key = e.key.toLowerCase();
                  if (key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) doRedo();
                    else doUndo();
                  } else if (key === 'y') {
                    e.preventDefault();
                    doRedo();
                  }
                }}
              />

              <details className={styles.syntaxBox}>
                <summary>想自己敲格式？点这里看写法</summary>
                <div className={styles.syntax}>
                  <span>
                    <code># 文字</code>大标题（井号后面要有空格）
                  </span>
                  <span>
                    <code>## 文字</code>小标题
                  </span>
                  <span>
                    <code>**文字**</code>加粗
                  </span>
                  <span>每一行是一段，空行会被忽略</span>
                  <span>
                    <code>#话题</code>不带空格的话题标签不会变成标题
                  </span>
                </div>
              </details>
            </div>

            <div className={styles.panel}>
              <span className={styles.panelTitle}>样式</span>
              <div className={styles.rows}>
                <div className={`${styles.row} ${styles.rowStack}`}>
                  <span className={styles.rowLabel}>
                    模板
                    <span className={styles.rowNote}>{templateById(templateId).desc}</span>
                  </span>
                  <div className={styles.swatches} role="radiogroup" aria-label="卡片模板">
                    {TEMPLATES.map((t) => (
                      <label key={t.id} className={styles.swatch}>
                        <input
                          type="radio"
                          name="template"
                          value={t.id}
                          checked={templateId === t.id}
                          onChange={() => setTemplateId(t.id)}
                        />
                        <span
                          className={styles.swatchFace}
                          style={{ background: t.colors.bg, borderColor: t.colors.rule }}
                        >
                          <span style={{ background: t.colors.title }} />
                          <span style={{ background: t.colors.bar }} />
                          <span style={{ background: t.colors.body }} />
                        </span>
                        <span className={styles.swatchName}>{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.row}>
                  <span className={styles.rowLabel}>
                    图片比例
                    <span className={styles.rowNote}>3:5 适合长文，3:4 是小红书常用尺寸</span>
                  </span>
                  <Segmented
                    name="ratio"
                    value={ratio}
                    onChange={(v) => setRatio(v as Ratio)}
                    options={[
                      { value: '3:5', label: '3:5 长图' },
                      { value: '3:4', label: '3:4 小红书' },
                    ]}
                  />
                </div>

                <div className={styles.row}>
                  <span className={styles.rowLabel}>
                    疏密
                    <span className={styles.rowNote}>
                      {densityChoice === 'auto'
                        ? `自动：按字数选了「${DENSITY_LABEL[density]}」`
                        : '你已手动选择'}
                    </span>
                  </span>
                  <Segmented
                    name="density"
                    value={densityChoice}
                    onChange={(v) => setDensityChoice(v as DensityChoice)}
                    options={[
                      { value: 'auto', label: '自动' },
                      { value: 'loose', label: '宽松' },
                      { value: 'standard', label: '标准' },
                      { value: 'compact', label: '紧凑' },
                    ]}
                  />
                </div>

                <div className={styles.row}>
                  <span className={styles.rowLabel}>
                    封面页
                    <span className={styles.rowNote}>大标题单独占第一页，正文从第二页开始</span>
                  </span>
                  <span className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={useCover}
                      aria-label="用大标题做独立封面页"
                      onChange={(e) => setUseCover(e.target.checked)}
                    />
                    <span className={styles.switchFace} />
                  </span>
                </div>

                <div className={styles.row}>
                  <span className={styles.rowLabel}>
                    页码
                    <span className={styles.rowNote}>每页右下角显示「2 / 6」</span>
                  </span>
                  <span className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={showPageNumber}
                      aria-label="每页显示页码"
                      onChange={(e) => setShowPageNumber(e.target.checked)}
                    />
                    <span className={styles.switchFace} />
                  </span>
                </div>

                <div className={styles.row}>
                  <span className={styles.rowLabel}>
                    署名
                    <span className={styles.rowNote}>写了就显示在每页左下角和封面上</span>
                  </span>
                  <input
                    className={styles.textInput}
                    value={author}
                    maxLength={16}
                    placeholder="@你的账号名"
                    aria-label="署名"
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>

                <div className={styles.row}>
                  <span className={styles.rowLabel}>
                    顶部显示字数
                    <span className={styles.rowNote}>第一页顶部加「全文 X 字 ｜ 阅读需要 X 分钟」</span>
                  </span>
                  <span className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={showMeta}
                      aria-label="顶部显示字数和阅读时长"
                      onChange={(e) => setShowMeta(e.target.checked)}
                    />
                    <span className={styles.switchFace} />
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.panel} aria-label="卡片预览">
            <div className={styles.panelHead}>
              <span className={styles.stats}>
                {empty ? (
                  '还没有卡片'
                ) : (
                  <>
                    全文 <b>{words}</b> 字 · 共 <b>{pages.length}</b> 页
                  </>
                )}
              </span>
              <div className={styles.toolbar}>
                <button
                  className="btn btnSm"
                  type="button"
                  disabled={empty || busy !== null}
                  onClick={() => exportAll('zip')}
                >
                  {busy === 'zip' ? '保存中…' : onPhone ? `全部存到相册（${pages.length}）` : '保存全部图片'}
                </button>
                <button
                  className="btn btnSm"
                  type="button"
                  disabled={empty || busy !== null}
                  onClick={() => exportAll('pdf')}
                >
                  {busy === 'pdf' ? '生成中…' : '保存 PDF'}
                </button>
              </div>
            </div>

            {onPhone && !empty && (
              <p className={styles.saveTip}>
                点「全部存到相册」会弹出系统分享，选「存储 {pages.length} 张图像」即可。
              </p>
            )}

            {empty ? (
              <p className={styles.empty}>在左边粘贴文字，这里会实时排好卡片。</p>
            ) : (
              <div className={styles.pages}>
                {pages.map((page, i) => (
                  <figure className={styles.figure} key={page.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.url} alt={`第 ${i + 1} 页`} width={1080} height={RATIO_HEIGHT[ratio]} />
                    <figcaption className={styles.cap}>
                      <span>
                        {i + 1} / {pages.length}
                      </span>
                      <button
                        className="btn btnQuiet btnSm"
                        type="button"
                        onClick={async () => {
                          const r = await savePage(page.image);
                          if (r === 'downloaded') say('已保存这一页');
                        }}
                      >
                        保存这页
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Segmented({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.seg} role="radiogroup">
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span className={styles.segFace}>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/** 封面副标题：取正文第一段的第一句，最多 42 字 */
function subtitleOf(blocks: { type: string; text: string }[]): string {
  const first = blocks.find((b) => b.type === 'p');
  if (!first) return '';
  const sentence = plain(first.text).split(/(?<=[。！？])/)[0] ?? '';
  return sentence.length > 42 ? `${sentence.slice(0, 42)}…` : sentence;
}

/** 按当前文字里实际出现的字符加载三个字重，最多等 5 秒 */
async function ensureFonts(text: string) {
  if (!document.fonts?.load) return;
  const chars = [
    ...new Set(plain(text).replace(/\s/g, '') + '全文字阅读需要分钟0123456789｜'),
  ].join('');
  if (!chars) return;
  const loads = [500, 700, 900].map((w) =>
    document.fonts.load(`${w} 40px ${FONT_FAMILY}`, chars).catch(() => []),
  );
  await Promise.race([
    Promise.all(loads),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}
