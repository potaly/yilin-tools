import type { Metadata } from 'next';
import Humanize from './Humanize';

export const metadata: Metadata = {
  title: '去AI味 · 一键改成人话',
  description:
    '粘一段文案，标出哪几句露了馅、哪些词会被限流，再给你一版改好的。违禁词表和废话句清单写死在代码里，不靠模型临场判断。不用登录。',
};

export default function Page() {
  return <Humanize />;
}
