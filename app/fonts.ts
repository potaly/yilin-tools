import { Noto_Sans_SC } from 'next/font/google';

/**
 * 卡片绘制用的字体。走 next/font 自托管，页面不会直接请求 fonts.googleapis.com，
 * 国内用户也能正常加载。Canvas 绘制时用 cardFont.style.fontFamily。
 */
export const cardFont = Noto_Sans_SC({
  weight: ['500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-card',
  fallback: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
});
