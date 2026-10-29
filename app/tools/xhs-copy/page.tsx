import type { Metadata } from 'next';
import XhsCopy from './XhsCopy';

export const metadata: Metadata = {
  title: '小红书文案生成',
  description:
    '给一个主题词，先定搜索型还是发现型，再出 5–6 个标题候选并按冲收藏/冲流量/冲涨粉分组，标题单位数和核心词位置由代码计算。配正文和四层标签，不编数字。',
};

export default function Page() {
  return <XhsCopy />;
}
