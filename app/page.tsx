import PasteBox from './PasteBox';
import { SITE, TOOLS, toolPath } from '@/lib/site';
import styles from './page.module.css';

export default function HomePage() {
  const ready = TOOLS.filter((t) => t.ready);

  return (
    <div className="shell">
      {/*
        首屏只做一件事：让有稿子的人立刻粘进来。
        工具列表还在，但降到下面 —— 和粘贴框等重的四张卡片等于没做选择。
      */}
      <section className={styles.hero}>
        <span className={styles.eyebrow}>打开就能用，不用注册</span>
        <h1 className={styles.title}>{SITE.tagline}</h1>
        <PasteBox />
        <p className={styles.quick}>
          还没想好写什么？
          <a href={toolPath('xhs-topics')}>找选题 →</a>
          <span aria-hidden="true"> · </span>
          要把长文排成图卡？
          <a href={toolPath('longform-cards')}>去排版 →</a>
        </p>
      </section>

      <h2 className={styles.gridTitle}>或者直接挑一个工具</h2>
      <section className={styles.grid} aria-label="工具列表">
        {ready.map((tool) => (
          <a key={tool.slug} className={styles.card} href={toolPath(tool.slug)}>
            <span className={styles.cardIcon} aria-hidden="true">
              <ToolIcon name={tool.icon} />
            </span>
            <span className={styles.cardName}>{tool.name}</span>
            <span className={styles.cardDetail}>{tool.detail}</span>
            <span className={styles.cardGo}>
              开始使用 <span aria-hidden="true">→</span>
            </span>
          </a>
        ))}
        <div className={`${styles.card} ${styles.soon}`}>
          <span style={{ fontSize: 22 }} aria-hidden="true">
            ✦
          </span>
          <span>更多工具陆续加进来</span>
        </div>
      </section>

      {/* 作者署名降到这里：它解释了为什么没有注册墙，但它不是标题 */}
      <p className={styles.maker}>
        {SITE.name} · {SITE.maker}
      </p>
    </div>
  );
}

/** 按注册表里的 icon 字段选图标，加工具时只需在这里补一个分支 */
function ToolIcon({ name }: { name: string }) {
  if (name === 'grid') return <GridIcon />;
  if (name === 'pen') return <PenIcon />;
  if (name === 'wand') return <WandIcon />;
  if (name === 'scan') return <ScanIcon />;
  return <CardsIcon />;
}

function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L19.3 8.7a2.4 2.4 0 0 0 0-3.4l-.6-.6a2.4 2.4 0 0 0-3.4 0L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14.2 5.8 18.2 9.8" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20 15.5 8.5M14 4.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 13.2l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".45"
      />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M3.5 12h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7.5 8.2h9M7.5 15.8h5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".45"
      />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="2.5" width="13" height="19" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6.5 7.5h6M6.5 11.5h6M6.5 15.5h3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M19 6.2a3 3 0 0 1 2 2.8v9a3 3 0 0 1-3 3H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".45"
      />
    </svg>
  );
}
