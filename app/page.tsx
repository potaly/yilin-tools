import { SITE, TOOLS, toolPath } from '@/lib/site';
import styles from './page.module.css';

export default function HomePage() {
  const ready = TOOLS.filter((t) => t.ready);

  return (
    <div className="shell">
      <section className={styles.hero}>
        <span className={styles.eyebrow}>打开就能用，不用注册</span>
        <h1 className={styles.title}>{SITE.tagline}</h1>
        <p className={styles.lede}>{SITE.description}</p>
      </section>

      <section className={styles.grid} aria-label="工具列表">
        {ready.map((tool) => (
          <a key={tool.slug} className={styles.card} href={toolPath(tool.slug)}>
            <span className={styles.cardIcon} aria-hidden="true">
              <CardsIcon />
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
    </div>
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
