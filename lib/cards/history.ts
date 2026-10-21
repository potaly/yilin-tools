/**
 * 编辑器的撤销 / 重做栈。
 *
 * 受控 textarea 配上程序化改值（格式按钮、AI 排版、快速清理）之后，
 * 浏览器自带的撤销栈就废了，所以这里自己维护一份，连光标位置一起记。
 */

export interface Snapshot {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export const MAX_HISTORY = 100;

export function snapshot(text: string, selectionStart = text.length, selectionEnd = selectionStart): Snapshot {
  return { text, selectionStart, selectionEnd };
}

/** 入栈；和栈顶文字一样就不重复记，超长丢掉最旧的 */
export function pushSnapshot(past: Snapshot[], snap: Snapshot): Snapshot[] {
  if (past.length && past[past.length - 1].text === snap.text) return past;
  const next = [...past, snap];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

export interface HistoryMove {
  past: Snapshot[];
  future: Snapshot[];
  snapshot: Snapshot;
}

export function undoStep(past: Snapshot[], future: Snapshot[], current: Snapshot): HistoryMove | null {
  if (!past.length) return null;
  const snap = past[past.length - 1];
  return { past: past.slice(0, -1), future: [...future, current], snapshot: snap };
}

export function redoStep(past: Snapshot[], future: Snapshot[], current: Snapshot): HistoryMove | null {
  if (!future.length) return null;
  const snap = future[future.length - 1];
  return { past: [...past, current], future: future.slice(0, -1), snapshot: snap };
}

/** 把历史截断到某个长度，用于把「快速清理 + AI 结果」合成一步 */
export function truncate(past: Snapshot[], length: number): Snapshot[] {
  return past.slice(0, Math.max(0, Math.min(length, past.length)));
}
