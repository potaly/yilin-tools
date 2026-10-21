/**
 * 卡片模板：一套配色 + 标题装饰方式 + 封面风格 + 页脚组件。
 *
 * 排版引擎（parse / linebreak / paginate）完全不关心颜色，模板只在绘制时生效，
 * 所以换模板不会改变分页结果，只改变长相。
 */

import { FALLBACK_FONT } from './spec';

export interface TemplateColors {
  bg: string;
  title: string;
  h2: string;
  body: string;
  bold: string;
  meta: string;
  /** 大标题下的高亮条 / 下划线 */
  bar: string;
  rule: string;
  /** 封面底色，留空则用 bg */
  coverBg?: string;
  coverInk?: string;
}

export type TitleDecor = 'highlight' | 'underline' | 'none';

export interface Template {
  id: string;
  name: string;
  /** 选择器上的一句话说明 */
  desc: string;
  colors: TemplateColors;
  /** 大标题的装饰方式 */
  decor: TitleDecor;
  /** 标题是否用衬线字体 */
  serifTitle?: boolean;
}

export const SERIF_FONT =
  '"Noto Serif SC","Songti SC","SimSun","STSong",serif';

export const TEMPLATES: Template[] = [
  {
    id: 'warm',
    name: '暖棕',
    desc: '米白底棕色字，耐看的默认款',
    decor: 'highlight',
    colors: {
      bg: '#FDF9F3',
      title: '#84461C',
      h2: '#84461C',
      body: '#8E5D36',
      bold: '#76390F',
      meta: '#AA8E74',
      bar: '#EFE5DA',
      rule: '#E8DED2',
      coverBg: '#F6EADA',
      coverInk: '#6F3813',
    },
  },
  {
    id: 'morandi',
    name: '莫兰迪',
    desc: '灰绿低饱和，安静克制',
    decor: 'highlight',
    colors: {
      bg: '#F2F1EC',
      title: '#44544A',
      h2: '#44544A',
      body: '#5F6B62',
      bold: '#2F3C34',
      meta: '#9AA39B',
      bar: '#DEE3DB',
      rule: '#DFE3DC',
      coverBg: '#E4E8E0',
      coverInk: '#36453C',
    },
  },
  {
    id: 'ink',
    name: '黑白杂志',
    desc: '衬线标题，像纸质刊物',
    decor: 'underline',
    serifTitle: true,
    colors: {
      bg: '#FBFBF9',
      title: '#141414',
      h2: '#1F1F1F',
      body: '#3A3A3A',
      bold: '#000000',
      meta: '#9A9A9A',
      bar: '#141414',
      rule: '#E2E2DE',
      coverBg: '#141414',
      coverInk: '#FBFBF9',
    },
  },
  {
    id: 'cream',
    name: '奶油',
    desc: '柔和暖黄，适合生活类内容',
    decor: 'highlight',
    colors: {
      bg: '#FFFBF2',
      title: '#B4601F',
      h2: '#B4601F',
      body: '#7A6753',
      bold: '#8A4712',
      meta: '#BFAE97',
      bar: '#FBE7C6',
      rule: '#F1E4CF',
      coverBg: '#FBE7C6',
      coverInk: '#8A4712',
    },
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0];

export function templateById(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? DEFAULT_TEMPLATE;
}

/** 标题字体族：衬线模板用衬线，其余跟正文一致 */
export function titleFamily(template: Template, bodyFamily: string): string {
  return template.serifTitle ? `${SERIF_FONT},${bodyFamily}` : bodyFamily;
}

/** 页脚配置，和模板无关，由用户在界面上开关 */
export interface FooterOptions {
  pageNumber: boolean;
  author: string;
}

export const EMPTY_FOOTER: FooterOptions = { pageNumber: false, author: '' };

export { FALLBACK_FONT };
