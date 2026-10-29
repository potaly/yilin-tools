/**
 * 工具之间的交接。
 *
 * 三个工具其实是一条流水线：**选题 → 写文案 → 查 AI 味**。
 * 专家的工作就是这个顺序（选题是弹药库，不是一次性交付），
 * 所以界面上也该能一步走过去，而不是让用户自己复制粘贴三次。
 *
 * 用 sessionStorage 不用 URL 参数：正文有几百字，塞进 query string 既难看
 * 又会被各种中间环节截断。sessionStorage 关掉标签页就没了，正合适 ——
 * 这是一次交接，不是要长期保存的东西。
 */

const KEY = 'yilin:xhs:handoff';

export interface Handoff {
  /** 从哪个工具来的，用来在目标页上说一句「这是从选题带过来的」 */
  from: string;
  title?: string;
  body?: string;
  /** 选题带过来的主线，写文案时当素材用 */
  material?: string;
  keyword?: string;
}

export function putHandoff(data: Handoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 隐私模式下会抛错，交接失败就让用户自己复制，不影响工具本身 */
  }
}

/** 取一次就清掉：交接是一次性的，刷新页面不该又把旧内容填回来 */
export function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Handoff;
    return parsed && typeof parsed === 'object' && typeof parsed.from === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}
