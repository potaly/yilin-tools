/**
 * 快速清理：纯规则整理文本，不调 AI。
 * 既给「快速清理」按钮用，也作为 AI 排版的服务端预处理。
 */

/** 零宽字符、BOM、软连字符：看不见但会影响匹配 */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
/** 各种换行：\r\n、\r、行分隔符 U+2028、段分隔符 U+2029、NEL U+0085 */
const LINE_SEPARATORS = /\r\n?|[\u2028\u2029\u0085]/g;
/** 不换行空格、全角空格之类，看着是空格但不是 U+0020 */
const EXOTIC_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const CJK = '\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3000-\\u303f\\uff01-\\uff60';
const CJK_RE = new RegExp(`[${CJK}]`);

/** 整行就是复制残留时才删，避免误伤正文 */
const NOISE_LINE =
  /^(展开全文|点击展开|阅读原文|点击阅读原文|点击上方.{0,12}关注|长按.{0,8}二维码.{0,8}|原文链接|编辑[:：].{0,10}|责任编辑[:：].{0,10})$/;

const SENTENCE_END = /[。！？…；]["'”’』」）】]*$/;
const LATIN_SENTENCE_END = /[.!?]["')\]]*$/;

/** 结构化的行：`#`/`##`、「第一、」「一、」「1.」「【x】」 */
const HEADING_RE =
  /^(#{1,2}\s|第[一二三四五六七八九十百零]+[、，,.．:：]?\s*[^\s]|[一二三四五六七八九十]+[、．.]\s*|\d+[、．.)）]\s*|【[^】]{1,20}】)/;

/**
 * 编辑器入口的规范化：只动会破坏结构的字符。
 *
 * 从小红书、公众号复制来的文字里常夹着 U+2028 / U+2029 这种「看不见的换行」。
 * 它们在 textarea 里显示成换行，但 split('\n') 切不开，正则里的 `.` 也匹配不到，
 * 结果就是「设为大标题」之后 `#` 被当成正文原样显示出来。
 * 这里不动空格，免得把中文输入法打出的全角空格也一并改掉。
 */
export function normalizeInput(text: string): string {
  return text.replace(LINE_SEPARATORS, '\n').replace(INVISIBLE, '');
}

/** 快速清理内部用：在入口规范化之外，把各种异常空格也统一成普通空格 */
export function stripInvisible(text: string): string {
  return normalizeInput(text).replace(EXOTIC_SPACES, ' ');
}

export function isHeadingLike(line: string): boolean {
  if (/^#{1,2}\s/.test(line)) return true;
  if (line.length > 30) return false;
  return HEADING_RE.test(line);
}

function endsSentence(line: string): boolean {
  return SENTENCE_END.test(line) || LATIN_SENTENCE_END.test(line);
}

function joinLines(a: string, b: string): string {
  const tail = a.slice(-1);
  const head = b.slice(0, 1);
  // 中英文之间保留一个空格，中文之间直接拼
  if (CJK_RE.test(tail) || CJK_RE.test(head)) return a + b;
  return `${a} ${b}`;
}

/**
 * 合并被硬换行折断的行：
 * 上一行没有以句末标点结尾、且下一行不像标题时，两行属于同一段。
 */
export function mergeHardWraps(lines: string[]): string[] {
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (NOISE_LINE.test(line)) continue;
    if (/^#{1,2}\s/.test(line) || (buf && isHeadingLike(line))) {
      flush();
      out.push(line);
      continue;
    }
    if (!buf) {
      buf = line;
      continue;
    }
    if (endsSentence(buf)) {
      flush();
      buf = line;
    } else {
      buf = joinLines(buf, line);
    }
  }
  flush();
  return out;
}

/** 删掉中文字符之间多余的空格 */
export function removeCjkSpaces(text: string): string {
  const re = new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, 'g');
  let prev: string;
  let cur = text;
  do {
    prev = cur;
    cur = cur.replace(re, '$1');
  } while (cur !== prev);
  return cur.replace(/[ \t]{2,}/g, ' ');
}

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s，。、；！？"'（）【】\u4e00-\u9fff\u3400-\u4dbf]+|[\w.+-]+@[\w-]+\.[\w.-]+/g;
const DECIMAL_RE = /\d+(?:\.\d+)+%?/g;
const LIST_MARKER_RE = /^\s*\d+[.)]\s/;

/**
 * 中文语境里把半角标点转全角。
 * URL、邮箱、小数、列表序号、纯英文句子都不动。
 */
export function toFullWidthPunctuation(text: string): string {
  if (!CJK_RE.test(text)) return text; // 整行没有中文，按英文句子处理，不转
  const keep: string[] = [];
  const stash = (s: string) => {
    keep.push(s);
    return `\u0000${keep.length - 1}\u0000`;
  };

  let marker = '';
  const m = text.match(LIST_MARKER_RE);
  if (m) {
    marker = m[0];
    text = text.slice(marker.length);
  }

  // URL 末尾的半角标点不属于地址本身，留在正文里参与全角转换
  let t = text
    .replace(URL_RE, (m) => {
      const trail = m.match(/[,.;:!?]+$/)?.[0] ?? '';
      return stash(m.slice(0, m.length - trail.length)) + trail;
    })
    .replace(DECIMAL_RE, stash);

  const C = `[${CJK}]`;
  t = t
    .replace(new RegExp(`(?<=${C}\\s*),`, 'g'), '，')
    .replace(new RegExp(`,(?=\\s*${C})`, 'g'), '，')
    .replace(new RegExp(`(?<=${C}\\s*);`, 'g'), '；')
    .replace(new RegExp(`(?<=${C}\\s*):`, 'g'), '：')
    .replace(new RegExp(`(?<=${C}\\s*)\\?`, 'g'), '？')
    .replace(new RegExp(`(?<=${C}\\s*)!`, 'g'), '！')
    .replace(new RegExp(`(?<=${C}\\s*)\\.(?![\\w])`, 'g'), '。')
    .replace(new RegExp(`\\((?=\\s*${C})`, 'g'), '（')
    .replace(new RegExp(`(?<=${C}\\s*)\\)`, 'g'), '）');

  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
  return marker + t;
}

/** 结尾连着两个以上话题标签（#养生赛道 #大健康）时，把它们拆成单独一段 */
const TRAILING_TAGS = /(?:[ \t]*#[^\s#]+){2,}[ \t]*$/;

export function splitTrailingTags(line: string): string[] {
  const m = line.match(TRAILING_TAGS);
  if (!m || m.index === undefined || m.index === 0) return [line];
  const body = line.slice(0, m.index).trim();
  const tags = m[0].trim().replace(/[ \t]{2,}/g, ' ');
  return body ? [body, tags] : [tags];
}

/** 超过 limit 字的段落在句末标点处拆开；单句本身过长则不拆 */
export function splitLongParagraph(line: string, limit = 150): string[] {
  if (line.length <= limit) return [line];
  const sentences = line.match(/[^。！？…]*[。！？…]+["'”’』」）】]*|[^。！？…]+$/g);
  if (!sentences || sentences.length < 2) return [line];

  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && buf.length + s.length > limit) {
      out.push(buf);
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 完整的快速清理流程 */
export function clean(input: string, limit = 150): string {
  const lines = mergeHardWraps(stripInvisible(input).split('\n'));
  const out: string[] = [];
  for (const line of lines) {
    if (/^#{1,2}\s/.test(line)) {
      out.push(line);
      continue;
    }
    const normalized = toFullWidthPunctuation(removeCjkSpaces(line)).trim();
    if (!normalized) continue;
    for (const piece of splitTrailingTags(normalized)) {
      out.push(...splitLongParagraph(piece, limit));
    }
  }
  return out.join('\n\n').trim() + (out.length ? '\n' : '');
}
