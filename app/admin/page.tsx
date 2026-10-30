import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/account/admin';
import {
  costYuan,
  EMPTY_STATS,
  getDailyStats,
  getIpStats,
  getSettings,
  getToolStats,
  getUserStats,
  listUsers,
  type StatsRow,
} from '@/lib/account/store';
import { EVENT_LABEL, EVENTS } from '@/lib/analytics/events';
import { getDailyVisitors, getEventStats, getRetention } from '@/lib/analytics/store';
import { TOOLS } from '@/lib/site';
import styles from './admin.module.css';
import { GrantForm, SettingsForm } from './AdminForms';

export const metadata: Metadata = { title: '后台', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * 一次调用大约 ¥0.005–0.015，两位小数全是 ¥0.01 或 ¥0.00，看不出差别，
 * 所以小额给 4 位。总额回到 2 位，免得一长串数字反而难读。
 */
function money(y: number): string {
  return `¥${y >= 1 ? y.toFixed(2) : y.toFixed(4)}`;
}

function sumYuan(rows: StatsRow[]): number {
  return rows.reduce((n, r) => n + costYuan(r), 0);
}

function day(iso: string): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—';
}

function sum(rows: StatsRow[], key: keyof StatsRow): number {
  return rows.reduce((n, r) => n + (r[key] || 0), 0);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { token?: string; denied?: string };
}) {
  if (searchParams.token) {
    redirect(`/admin/enter?token=${encodeURIComponent(searchParams.token)}`);
  }

  const admin = await checkAdmin();
  if (!admin.ok) {
    return (
      <div className="shell">
        <div className={styles.gate}>
          <h1 className={styles.title}>后台</h1>
          {searchParams.denied && <p className={styles.msgBad}>口令不对</p>}
          {admin.tokenConfigured ? (
            <p style={{ color: 'var(--ink-2)' }}>
              在地址后面加上 <code>?token=你的 ADMIN_TOKEN</code> 进来，之后 12 小时内不用再带。
            </p>
          ) : (
            <p style={{ color: 'var(--ink-2)' }}>
              服务端还没有配 <code>ADMIN_TOKEN</code>，后台进不来。去 Vercel 的环境变量里加一个随机长字符串，重新部署即可。
            </p>
          )}
        </div>
      </div>
    );
  }

  const [settings, daily, users, ipRows, events, visitors, retention, toolRows] = await Promise.all([
    getSettings(),
    getDailyStats(14),
    listUsers(),
    getIpStats(14),
    getEventStats(14),
    getDailyVisitors(14),
    getRetention(),
    getToolStats(14),
  ]);
  const visitorsByDay = new Map(visitors.map((v) => [v.day, v.count]));
  const eventTotals = events.reduce(
    (acc, d) => {
      for (const e of EVENTS) acc[e] += d.total[e];
      return acc;
    },
    { open: 0, run: 0, done: 0, take: 0 },
  );
  const perUser = await Promise.all(users.map((u) => getUserStats(u.id)));
  const rows = daily.map((d) => d.stats);
  // Redis 不可用时 daily 是空的，不能直接取 rows[0]
  const todayStats: StatsRow = rows[0] ?? EMPTY_STATS;

  return (
    <div className="shell">
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>后台</h1>
          <span className={styles.who}>
            {admin.email ? `以 ${admin.email} 身份` : '以 ADMIN_TOKEN 身份'}
            {admin.bootstrap && ' · 还没设管理员邮箱，建议在下面填上自己的'}
          </span>
        </header>

        <section className={styles.panel}>
          <span className={styles.panelTitle}>总览</span>
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>今日排版</div>
              <div className={styles.cardValue}>{todayStats.calls}</div>
              <div className={styles.cardNote}>近 14 天 {sum(rows, 'calls')} 次</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>今日成本</div>
              <div className={styles.cardValue}>{money(costYuan(todayStats))}</div>
              <div className={styles.cardNote}>近 14 天 {money(sumYuan(rows))}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>账户数</div>
              <div className={styles.cardValue}>{users.length}</div>
              <div className={styles.cardNote}>
                共持有算力 {users.reduce((n, u) => n + u.balance, 0)}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>今日消耗 token</div>
              <div className={styles.cardValue}>
                {(todayStats.promptTokens + todayStats.completionTokens).toLocaleString()}
              </div>
              <div className={styles.cardNote}>
                输入 {todayStats.promptTokens.toLocaleString()} · 输出{' '}
                {todayStats.completionTokens.toLocaleString()}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <span className={styles.panelTitle}>近 14 天分工具成本</span>
          {toolRows.length === 0 ? (
            <p className={styles.empty}>
              还没有分工具的数据。这份记录是 2026-10-30 才加的，在那之前的调用没有留下工具维度。
            </p>
          ) : (
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>工具</th>
                    <th className={styles.num}>调用</th>
                    <th className={styles.num}>失败</th>
                    <th className={styles.num}>上游请求</th>
                    <th className={styles.num}>成本</th>
                    <th className={styles.num}>每次成功</th>
                  </tr>
                </thead>
                <tbody>
                  {toolRows.map((t) => {
                    const done = t.stats.calls - t.stats.fails;
                    return (
                      <tr key={t.tool}>
                        <td>{TOOLS.find((x) => x.slug === t.tool)?.name ?? t.tool}</td>
                        <td className={styles.num}>{t.stats.calls}</td>
                        <td className={styles.num}>{t.stats.fails}</td>
                        <td className={styles.num}>{t.stats.requests || '—'}</td>
                        <td className={styles.num}>{money(costYuan(t.stats))}</td>
                        <td className={styles.num}>
                          {done > 0 ? money(costYuan(t.stats) / done) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.empty}>
            「上游请求」是真实打出去的请求数，含结构重试和参数降级重打，所以会大于调用次数；
            显示「—」是 2026-10-30 之前的行，那时还没记这个指标，不代表当时没有重试。
            失败的调用也记一行并计入成本，但**没拿到回复的那次请求 token 用量未知，按 0 记**
            —— 不是真的没花钱，所以这里的金额是下限。
            金额本身也是按写死的单价估的，不是账单；「每次被采用结果的成本」要等埋点把复制/改写接上才能算。
          </p>
        </section>

        {daily.length === 0 && (
          <section className={styles.panel}>
            <span className={styles.panelTitle}>Redis 没连上</span>
            <p className={styles.empty}>
              读不到任何数据。检查 UPSTASH_REDIS_REST_* 或 Vercel Storage 里的 Redis 是否连着。
            </p>
          </section>
        )}

        <section className={styles.panel}>
          <span className={styles.panelTitle}>匿名访客与漏斗（近 14 天）</span>
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>今日访客</div>
              <div className={styles.cardValue}>{visitors[0]?.count ?? 0}</div>
              <div className={styles.cardNote}>
                近 14 天去重前共 {visitors.reduce((n, v) => n + v.count, 0)} 人次
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>次周留存</div>
              <div className={styles.cardValue}>
                {retention.rate === null ? '—' : `${Math.round(retention.rate * 100)}%`}
              </div>
              <div className={styles.cardNote}>
                上个 7 天来过 {retention.lastWeek} 人，回来 {retention.returned} 人
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>完成率</div>
              <div className={styles.cardValue}>
                {eventTotals.open ? `${Math.round((eventTotals.done / eventTotals.open) * 100)}%` : '—'}
              </div>
              <div className={styles.cardNote}>
                打开 {eventTotals.open} → 用上 {eventTotals.done}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>拿走结果</div>
              <div className={styles.cardValue}>{eventTotals.take}</div>
              <div className={styles.cardNote}>复制报告 / 保存图片</div>
            </div>
          </div>

          <p className={styles.empty} style={{ marginTop: 10 }}>
            匿名 id 存在浏览器里，清缓存或换设备会冲掉，所以留存是<strong>偏低</strong>的真实下界。
            事件体里只有 id、事件名、工具名，没有任何正文。
          </p>

          <div className={styles.scroll}>
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th className={styles.num}>访客</th>
                  <th>工具</th>
                  {EVENTS.map((e) => (
                    <th key={e} className={styles.num}>
                      {EVENT_LABEL[e]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.flatMap((d) =>
                  TOOLS.map((t, i) => {
                    const f = d.byTool[t.slug];
                    if (!f) return null;
                    return (
                      <tr key={`${d.day}-${t.slug}`}>
                        <td>{i === 0 ? d.day : ''}</td>
                        <td className={styles.num}>{i === 0 ? (visitorsByDay.get(d.day) ?? 0) : ''}</td>
                        <td>{t.name}</td>
                        {EVENTS.map((e) => (
                          <td key={e} className={styles.num}>
                            {f[e]}
                          </td>
                        ))}
                      </tr>
                    );
                  }).filter(Boolean),
                )}
              </tbody>
            </table>
          </div>
          {eventTotals.open === 0 && (
            <p className={styles.empty}>还没有埋点数据。有人打开工具之后，这里就会有行。</p>
          )}
        </section>

        <section className={styles.panel}>
          <span className={styles.panelTitle}>AI 用量合计（近 14 天）</span>
          <div className={styles.scroll}>
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th className={styles.num}>调用</th>
                  <th className={styles.num}>分块数</th>
                  <th className={styles.num}>上游请求</th>
                  <th className={styles.num}>字数</th>
                  <th className={styles.num}>输入 token</th>
                  <th className={styles.num}>输出 token</th>
                  <th className={styles.num}>成本</th>
                  <th className={styles.num}>扣算力</th>
                </tr>
              </thead>
              <tbody>
                {daily.map(({ day: d, stats }) => (
                  <tr key={d}>
                    <td>{d}</td>
                    <td className={styles.num}>{stats.calls}</td>
                    <td className={styles.num}>{stats.chunks}</td>
                    <td className={styles.num}>{stats.requests || '—'}</td>
                    <td className={styles.num}>{stats.chars.toLocaleString()}</td>
                    <td className={styles.num}>{stats.promptTokens.toLocaleString()}</td>
                    <td className={styles.num}>{stats.completionTokens.toLocaleString()}</td>
                    <td className={styles.num}>{money(costYuan(stats))}</td>
                    <td className={styles.num}>{stats.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.empty}>
            这张表是所有工具的合计。「分块数」一直是内容切块数；「上游请求」含重试，
            2026-10-30 之前没记，显示「—」。2026-10-30 之前这里只有长文排版的数据，
            三个小红书工具那之前的调用没有留下任何记录。
          </p>
        </section>

        <section className={styles.panel}>
          <span className={styles.panelTitle}>按 IP（近 14 天，{ipRows.length} 条）</span>
          {ipRows.length === 0 ? (
            <p className={styles.empty}>还没有记录。有人用过 AI 排版之后，这里会按天列出每个 IP 的用量。</p>
          ) : (
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>IP</th>
                    <th className={styles.num}>排版次数</th>
                    <th className={styles.num}>字数</th>
                    <th className={styles.num}>输入 token</th>
                    <th className={styles.num}>输出 token</th>
                    <th className={styles.num}>成本</th>
                  </tr>
                </thead>
                <tbody>
                  {ipRows.map((r) => (
                    <tr key={`${r.day}-${r.ip}`}>
                      <td>{r.day}</td>
                      <td>{r.ip}</td>
                      <td className={styles.num}>{r.stats.calls}</td>
                      <td className={styles.num}>{r.stats.chars.toLocaleString()}</td>
                      <td className={styles.num}>{r.stats.promptTokens.toLocaleString()}</td>
                      <td className={styles.num}>{r.stats.completionTokens.toLocaleString()}</td>
                      <td className={styles.num}>{money(costYuan(r.stats))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <span className={styles.panelTitle}>账户（{users.length}）</span>
          {users.length === 0 ? (
            <p className={styles.empty}>还没有账户。登录页做好之后，用户注册就会出现在这里。</p>
          ) : (
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>邮箱</th>
                    <th>注册时间</th>
                    <th>最后登录</th>
                    <th className={styles.num}>登录次数</th>
                    <th className={styles.num}>剩余算力</th>
                    <th className={styles.num}>累计排版</th>
                    <th className={styles.num}>累计 token</th>
                    <th className={styles.num}>累计成本</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{day(u.createdAt)}</td>
                      <td>{day(u.lastLoginAt)}</td>
                      <td className={styles.num}>{u.loginCount}</td>
                      <td className={styles.num}>{u.balance}</td>
                      <td className={styles.num}>{perUser[i].calls}</td>
                      <td className={styles.num}>
                        {(perUser[i].promptTokens + perUser[i].completionTokens).toLocaleString()}
                      </td>
                      <td className={styles.num}>{money(costYuan(perUser[i]))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <SettingsForm initial={settings} />
        <GrantForm />
      </div>
    </div>
  );
}
