/** 站点配置与工具注册表：加新工具只需在这里加一条，再建 app/tools/<slug>/page.tsx */

export const SITE = {
  name: '一人造物',
  /** 顶栏左上角那个小方块里的字 */
  mark: '造',
  tagline: '一个人用 AI 造东西，造好的免费放着',
  description: '把 AI 写的文案改成人话，查文字里的 AI 味，把长文排成手机长图卡片。打开就用，不用注册。',
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
    slug: 'humanize',
    name: '去AI味',
    summary: '一键改成人话',
    detail:
      '粘一段文案，标出哪几句露了馅、哪些词会被限流，再给你一版改好的。违禁词表写在代码里，不靠模型判断。',
    icon: 'wand',
    ready: true,
  },
  {
    slug: 'xhs-topics',
    name: '小红书选题',
    summary: '一个词拆成一排选题',
    detail:
      '给一个主题词，拆成按人群和时刻分组的选题矩阵，每条带动机标签和排期顺序，并告诉你哪一步要自己去搜索框验证。',
    icon: 'grid',
    ready: true,
  },
  {
    slug: 'xhs-copy',
    name: '小红书文案',
    summary: '主题词变成能发的笔记',
    detail:
      '先定搜索型还是发现型，再出 5–6 个标题候选（按冲收藏/冲流量/冲涨粉分组，单位数和核心词位置代码算），配正文和四层标签。',
    icon: 'pen',
    ready: true,
  },
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
