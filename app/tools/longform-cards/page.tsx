import type { Metadata } from 'next';
import LongformCards from './LongformCards';

export const metadata: Metadata = {
  title: '长文图卡',
  description: '粘贴一段文字，自动排成手机比例的长图卡片，可以保存成图片或 PDF。',
};

export default function Page() {
  return <LongformCards />;
}
