import type { Metadata } from 'next';
import Check from './Check';

export const metadata: Metadata = {
  title: '发布前检查',
  description:
    '发小红书之前过一遍：哪些词建议自己再核实、哪几句读起来像模板、标题正文长度有没有超。词表和规则写死在代码里，检查在浏览器里完成，文字不会发出去。不用登录。',
};

export default function Page() {
  return <Check />;
}
