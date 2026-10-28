/**
 * 浏览器端：匿名访客 id + 发事件。
 *
 * 为什么不是登录、也不是 IP：
 * 登录是漏斗上的摩擦，现在唯一需要的是试用量；而国内移动网络的 IP 会漂
 * （运营商 NAT、4G 切换），同一个人下次来大概率是另一个 IP，算不准回访。
 * uuid 会被清缓存和换设备冲掉，所以它算出来的留存**偏低** —— 但偏低的真数据
 * 比准不了的 IP 有用得多。
 *
 * 发送一律是「尽力而为」：失败、被拦截、没网，全部静默忽略，不影响工具本身。
 */

import { EVENTS, type EventName } from './events';

const KEY = 'yilin:vid';
const ENDPOINT = '/api/track';

/** 同一次页面加载里，同一个 (工具, 事件) 只发一次，避免 React 重复挂载刷量 */
const sent = new Set<string>();

export function visitorId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved;
    const id = newId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return ''; // 隐私模式下 localStorage 会抛错，直接不埋
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 老浏览器兜底，格式要和服务端的校验对得上
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * 发一个事件。只发 { vid, event, tool }，不带任何正文内容。
 * @param once 默认 true：同一次页面加载内去重
 */
export function track(event: EventName, tool: string, once = true): void {
  if (typeof window === 'undefined') return;
  if (!EVENTS.includes(event)) return;

  const key = `${tool}:${event}`;
  if (once) {
    if (sent.has(key)) return;
    sent.add(key);
  }

  const vid = visitorId();
  if (!vid) return;

  const body = JSON.stringify({ vid, event, tool });
  try {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 埋点失败从不影响工具本身 */
  }
}

/** 测试用：清掉本次页面加载的去重记录 */
export function resetTrackDedupe(): void {
  sent.clear();
}
