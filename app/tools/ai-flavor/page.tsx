import type { Metadata } from 'next';
import AiFlavor from './AiFlavor';

export const metadata: Metadata = {
  title: 'AI味检测',
  description:
    '粘一段文字，指出哪几句露了馅、具体在第几段。9 条规则写死在代码里，不调 AI，断网也能用。',
};

export default function Page() {
  return <AiFlavor />;
}
