/** 站点配置与工具注册表：加新工具只需在这里加一条，再建 app/tools/<slug>/page.tsx */

export const SITE = {
  name: 'Yilin 工具箱',
  tagline: '几个趁手的小工具，打开就能用',
  description: '把长文变成手机长图卡片，AI 一键排版，随手保存成图片或 PDF。',
} as const;

export interface ToolMeta {
  slug: string;
  name: string;
  summary: string;
  /** 首页卡片上的简短说明，写清楚「能帮你做成什么」 */
  detail: string;
  icon: string;
  ready: boolean;
}

export const TOOLS: ToolMeta[] = [
  {
    slug: 'longform-cards',
    name: '长文图卡',
    summary: '长文变成手机长图',
    detail: '粘贴一段文字，自动排成米白底的长图卡片，可以存成图片或 PDF 发朋友圈、小红书。',
    icon: 'cards',
    ready: true,
  },
];

export function toolPath(slug: string): string {
  return `/tools/${slug}`;
}
