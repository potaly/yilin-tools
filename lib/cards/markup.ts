/**
 * 给编辑器加格式标记的纯函数。
 *
 * 用户不该需要知道 Markdown：界面上点「大标题」，由这里负责往行首插 `# `。
 * 纯字符串进出，所以可以直接单测，不用碰 DOM。
 */

export interface MarkupResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export type HeadingLevel = 1 | 2;

/** 选区覆盖到的完整行范围 */
function lineRange(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const found = text.indexOf('\n', end);
  return [from, found === -1 ? text.length : found];
}

const HEADING_PREFIX = /^#{1,2}[ \t]+/;

/**
 * 把选中的行设成大标题 / 小标题；已经是这一级时再点一次就去掉。
 * 选区跨多行时整段一起处理。
 */
export function toggleHeading(
  text: string,
  start: number,
  end: number,
  level: HeadingLevel,
): MarkupResult {
  const [from, to] = lineRange(text, start, end);
  const marker = '#'.repeat(level);
  const lines = text.slice(from, to).split('\n');
  const already = new RegExp(`^${marker}[ \\t]+`);
  const filled = lines.filter((l) => l.trim());
  const allSame = filled.length > 0 && filled.every((l) => already.test(l));

  const next = lines
    .map((line) => {
      if (!line.trim()) return line;
      const bare = line.replace(HEADING_PREFIX, '');
      return allSame ? bare : `${marker} ${bare}`;
    })
    .join('\n');

  return {
    text: text.slice(0, from) + next + text.slice(to),
    selectionStart: from,
    selectionEnd: from + next.length,
  };
}

/** 给选中的文字加 / 去加粗标记；没选中时插入一对标记并把光标放中间 */
export function toggleBold(text: string, start: number, end: number): MarkupResult {
  const selected = text.slice(start, end);

  if (!selected) {
    return {
      text: `${text.slice(0, start)}****${text.slice(start)}`,
      selectionStart: start + 2,
      selectionEnd: start + 2,
    };
  }

  // 选区正好在一对标记中间
  if (text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
    return {
      text: text.slice(0, start - 2) + selected + text.slice(end + 2),
      selectionStart: start - 2,
      selectionEnd: start - 2 + selected.length,
    };
  }

  // 选区本身带着标记
  if (selected.startsWith('**') && selected.endsWith('**') && selected.length > 4) {
    const inner = selected.slice(2, -2);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  return {
    text: `${text.slice(0, start)}**${selected}**${text.slice(end)}`,
    selectionStart: start + 2,
    selectionEnd: start + 2 + selected.length,
  };
}

/** 去掉选中行的标题标记，变回正文 */
export function clearHeading(text: string, start: number, end: number): MarkupResult {
  const [from, to] = lineRange(text, start, end);
  const next = text
    .slice(from, to)
    .split('\n')
    .map((line) => (line.trim() ? line.replace(HEADING_PREFIX, '') : line))
    .join('\n');
  return {
    text: text.slice(0, from) + next + text.slice(to),
    selectionStart: from,
    selectionEnd: from + next.length,
  };
}
