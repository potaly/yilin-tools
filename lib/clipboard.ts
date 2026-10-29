/**
 * 复制到剪贴板，带兜底。
 *
 * `navigator.clipboard` 不是随时都有：非 https 的源上它根本不存在（localhost 例外），
 * 权限被拒时 writeText 会抛错。直接 await 它的话，不只是复制失败 ——
 * 后面那行埋点也一起不执行了，于是「复制结果」这个事件会悄悄少掉一批。
 *
 * 所以这里永远不抛错，只返回成功与否，让调用方自己决定怎么提示、要不要埋点。
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到下面的兜底 */
  }

  // 老办法：塞一个看不见的 textarea，选中，execCommand。
  // 已废弃但所有浏览器都还支持，而且不需要权限。
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
