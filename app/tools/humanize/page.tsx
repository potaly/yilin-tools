import { permanentRedirect } from 'next/navigation';

/**
 * 「去AI味」已经并进「发布前检查」。
 *
 * 两个工具原来调的是同一套规则（analyze / scanDoc），拆成两个入口既分流量
 * 也分用户心智。这里留一个永久跳转，旧链接和收藏不至于 404。
 */
export default function Page() {
  permanentRedirect('/tools/check');
}
