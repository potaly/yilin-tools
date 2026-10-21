import type { Metadata, Viewport } from 'next';
import { SITE, TOOLS, toolPath } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  icons: {
    icon: [
      {
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#9A5522"/><rect x="8" y="9" width="16" height="3" rx="1.5" fill="#FDF9F3"/><rect x="8" y="15" width="16" height="2" rx="1" fill="#FDF9F3" opacity=".7"/><rect x="8" y="20" width="11" height="2" rx="1" fill="#FDF9F3" opacity=".7"/></svg>`,
          ),
        type: 'image/svg+xml',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1ec' },
    { media: '(prefers-color-scheme: dark)', color: '#121110' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="siteHeader">
          <div className="shell siteHeaderInner">
            <a className="brand" href="/">
              <span className="brandMark" aria-hidden="true">
                Y
              </span>
              {SITE.name}
            </a>
            <nav>
              {TOOLS.filter((t) => t.ready).map((t) => (
                <a key={t.slug} className="navLink" href={toolPath(t.slug)}>
                  {t.name}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="shell siteFooter">
          <span>{SITE.name}</span>
          <span>图片在你的浏览器里生成，文字不会上传，除非你点「AI 排版」</span>
        </footer>
      </body>
    </html>
  );
}
