/**
 * 词表扫描：把 words.ts 的表跑一遍，产出带原文下标的问题清单。
 *
 * 全部确定性，零网络请求。同一段文字每次扫出来的结果一样 ——
 * 这是整个工具可信的前提，也是它和「让模型自己看看有没有问题」的根本差别。
 *
 * span 下标相对 normalizeInput 之后的文本，和 lib/aiwei 用的是同一个基准，
 * 两边的命中位置可以画在同一份原文上。
 */

import { normalizeInput } from '@/lib/cards/clean';
import { dedupe, findPhrases } from '@/lib/aiwei/match';
import type { Span } from '@/lib/aiwei/types';
import { MEDICAL, TABLES, type IssueKind, type Severity } from './words';
import { measure, type Limits } from './units';

export interface Issue {
  kind: IssueKind;
  label: string;
  severity: Severity;
  why: string;
  recipe: string;
  /** 命中的词，去重后按出现顺序 */
  hits: string[];
  spans: Span[];
  /** 行业名，只有功效宣称词有 */
  industry?: string;
}

/** 医疗词里例外正则最长能跨多少字符，用来定位命中周围要看多宽的窗口 */
const EXC_WINDOW = 8;

/**
 * 医疗断言的例外判断。
 *
 * check_copy.py 是拿例外正则搜**全文**：只要文里有一处「治愈系」，
 * 所有「治愈」就都被放过。这里改成只看命中点附近的窗口 ——
 * 同一篇里既写了「治愈系氛围」又写了「根治失眠」时，后者不该被前者赦免。
 * 比 Python 版更严，方向上是对的（漏判比误判贵）。
 */
function excused(text: string, span: Span, exception: string): boolean {
  const from = Math.max(0, span.start - EXC_WINDOW);
  const window = text.slice(from, span.end + EXC_WINDOW);
  const re = new RegExp(exception, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(window))) {
    const start = from + m.index;
    const end = start + m[0].length;
    // 例外串盖住了这处命中，才算例外
    if (start <= span.start && end >= span.end) return true;
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return false;
}

function medicalSpans(text: string): { spans: Span[]; hits: string[] } {
  const spans: Span[] = [];
  const hits = new Set<string>();

  for (const [word, exception] of MEDICAL) {
    for (const span of findPhrases(text, [word])) {
      if (exception && excused(text, span, exception)) continue;
      spans.push(span);
      hits.add(word);
    }
  }

  return { spans: spans.sort((a, b) => a.start - b.start), hits: [...hits] };
}

/**
 * 扫一段文字。
 *
 * @param text 要扫的文本。标题和正文都要扫，所以通常把两者拼起来传进来 ——
 *   check_copy.py 也是扫整份 markdown（`raw`），标题里的违禁词一样会被拦。
 */
export function scanText(text: string): Issue[] {
  const normalized = normalizeInput(text);
  const issues: Issue[] = [];

  for (const table of TABLES) {
    const { spans, hits } =
      table.kind === 'medical'
        ? medicalSpans(normalized)
        : (() => {
            const found = findPhrases(normalized, table.words);
            const seen = table.words.filter((w) => normalized.includes(w));
            return { spans: found, hits: [...seen] };
          })();

    if (!spans.length) continue;

    issues.push({
      kind: table.kind,
      label: table.label,
      severity: table.severity,
      why: table.why,
      recipe: table.recipe,
      hits,
      spans: dedupe(spans),
      ...(table.industry ? { industry: table.industry } : {}),
    });
  }

  // hard 排前面：那是「不改就别发」，soft 是「自己决定」
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'hard' ? -1 : 1));
}

export interface ScanResult {
  /** 规范化后的全文（标题 + 正文），span 下标相对它 */
  text: string;
  issues: Issue[];
  limits: Limits;
  /** 有硬错误或超限：这篇现在发不出去，或者发了会被限流 */
  blocking: boolean;
}

/** 整篇扫描：词表 + 硬约束 */
export function scanDoc(title: string, body: string): ScanResult {
  const joined = title ? `${title}\n${body}` : body;
  const issues = scanText(joined);
  const limits = measure(title, body);

  return {
    text: normalizeInput(joined),
    issues,
    limits,
    blocking: limits.overLimit || issues.some((i) => i.severity === 'hard'),
  };
}

/** 改写结果的闸门用它：输出里还剩哪些硬错误 */
export function hardHits(text: string): string[] {
  return scanText(text)
    .filter((i) => i.severity === 'hard')
    .flatMap((i) => i.hits);
}
