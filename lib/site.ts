/** 站点配置与工具注册表：加新工具只需在这里加一条，再建 app/tools/<slug>/page.tsx */

export const SITE = {
  name: '一人造物',
  /** 顶栏左上角那个小方块里的字 */
  mark: '造',
  tagline: '一个人用 AI 造东西，造好的免费放着',
  description:
    '发小红书之前过一遍检查，拆选题、写文案，把长文排成手机长图卡片。打开就用，不用注册。',
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
    slug: 'check',
    name: '发布前检查',
    summary: '发之前过一遍',
    detail:
      '粘进来就分组列出：哪些词建议自己再核实、哪几句读起来像模板、长度有没有超。查表不靠模型，文字不离开浏览器。要的话再让 AI 改一版。',
    icon: 'scan',
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
