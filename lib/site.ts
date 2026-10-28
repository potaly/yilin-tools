/** 站点配置与工具注册表：加新工具只需在这里加一条，再建 app/tools/<slug>/page.tsx */

export const SITE = {
  name: '一人造物',
  /** 顶栏左上角那个小方块里的字 */
  mark: '造',
  tagline: '一个人用 AI 造东西，造好的免费放着',
  description: '查文字里的 AI 味，把长文排成手机长图卡片。打开就用，不用注册。',
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
    slug: 'ai-flavor',
    name: 'AI味检测',
    summary: '查文字里的 AI 味',
    detail: '粘一段文字，指出哪几句露了馅、具体在第几段。9 条规则写死在代码里，不调 AI。',
    icon: 'scan',
    ready: true,
  },
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
