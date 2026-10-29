import type { Metadata } from 'next';
import XhsTopics from './XhsTopics';

export const metadata: Metadata = {
  title: '小红书选题',
  description:
    '一个主题词拆成按人群和时刻分组的选题矩阵，每条标清解释型/外显型/纠错型和排期顺序，附本主题定制的标题公式，并给出要去小红书搜索框验证的具体词。',
};

export default function Page() {
  return <XhsTopics />;
}
