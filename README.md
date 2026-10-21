# Yilin 工具箱

一个可以不断加工具的轻量工具站。第一个工具是「长文图卡」：粘贴一段文字，自动排成手机比例的长图卡片（米白底、棕色字、大标题带高亮条），可以保存成 PNG、ZIP 或 PDF，并支持 **AI 一键排版**。

- 需求文档：[docs/requirements.md](docs/requirements.md)
- 架构设计与选型：[docs/architecture.md](docs/architecture.md)
- 视觉参考原型：[reference/longform-cards.html](reference/longform-cards.html)

## 技术栈

Next.js 14.2（App Router）· React 18 · TypeScript strict · CSS Modules · pnpm · Upstash Redis · Vercel（hkg1）

## 本地开发

```bash
corepack enable pnpm     # 本机没有 pnpm 时
pnpm install
cp .env.example .env.local   # 填上 AI_API_KEY 就能跑通 AI 排版
pnpm dev                 # http://localhost:3000
```

常用命令：

```bash
pnpm lint      # ESLint
pnpm test      # vitest，纯逻辑单测
pnpm build     # 生产构建
pnpm config:ai # 把 AI 配置写进 Redis（交互式，密钥不落盘）
```

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `AI_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `AI_MODEL` | 否 | 默认 `deepseek-flash` |
| `AI_API_KEY` | 否 | **本地开发用**；生产环境不要配，留给 Redis |
| `UPSTASH_REDIS_REST_URL` | 否 | Upstash REST 地址；生产环境用 Vercel Storage 连接时不用手配 |
| `UPSTASH_REDIS_REST_TOKEN` | 否 | 同上 |
| `REDIS_NAMESPACE` | 否 | 默认 `yilin:` |
| `RATE_LIMIT_BURST` | 否 | 突发窗口，默认 `2/10s` |
| `RATE_LIMIT_PER_HOUR` | 否 | 默认 20（按分块数扣额度） |
| `RATE_LIMIT_PER_DAY` | 否 | 默认 50 |
| `AI_DAILY_BUDGET` | 否 | 全站每日分块预算，默认 2000 |

### Redis 怎么接

**生产环境**：在 Vercel 项目的 **Storage** 里连接 Upstash 数据库即可，不用手动配任何 Redis 变量。连接后 Vercel 会自动注入 `KV_REST_API_URL`、`KV_REST_API_TOKEN`、`KV_URL`、`REDIS_URL` 等变量，`lib/redis.ts` 的读取顺序是 `UPSTASH_REDIS_REST_*` → `KV_REST_API_*`，所以开箱即用。

> 注意：**不要在连接 Storage 的同时又手动配 `UPSTASH_REDIS_REST_URL`**。手配的 URL 优先级更高，会和集成注入的 `KV_REST_API_TOKEN` 配成「URL 和 Token 来自不同来源」的一对。

**本地开发**：在 `.env.local` 里填 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。不填也能跑，限流会降级成进程内计数。

Upstash 只支持 0 号库（`SELECT 2` 会报 `ERR Only 0th database is supported!`），所以这里用 `yilin:` 前缀做命名空间，与同一实例上 activation-service 的 `code:*` 互不干扰。

### AI Key 放哪

**AI 配置的优先级是「环境变量优先，Redis 兜底」**，两种放法都行：

| 放法 | 换 Key 时 | 适用 |
|---|---|---|
| Vercel 环境变量 `AI_API_KEY` | 要 Redeploy 一次 | 简单直接，当前线上就是这种 |
| 写进 Redis（`pnpm config:ai`） | 改完立即生效，不用重新部署 | 需要频繁轮换 Key 时 |

改用 Redis 托管时，记得把 Vercel 上的 `AI_API_KEY` 删掉，否则环境变量会盖住 Redis 里的值。

**环境变量改完必须 Redeploy 才会生效**，Vercel 不会自动重建。

## 目录结构

```
app/            页面与接口（表现层，只调 lib）
  tools/<slug>/ 一个工具一个目录
  api/ai-format、api/health
lib/
  site.ts       站点名与工具注册表
  cards/        排版引擎（纯 TS：spec/parse/linebreak/paginate/draw/clean/export）
  ai/           AI 排版（prompt/client/chunk/validate）
  config/       AI 配置读取（env 优先，Redis 兜底，60s 缓存）
  redis.ts      Upstash REST 客户端 + 命名空间
  ratelimit.ts  分层防刷
tests/          vitest 单测
scripts/        set-ai-config.ts
```

## 怎么加第二个工具

1. 在 `lib/site.ts` 的 `TOOLS` 里加一条（slug / 名称 / 说明 / 图标）。
2. 建 `app/tools/<slug>/page.tsx`。
3. 纯逻辑放 `lib/<domain>/`，并在 `tests/` 里补单测。

首页会自动出现新卡片，不需要改首页代码。

## 接口

### `POST /api/ai-format`

入参 `{ "text": "..." }`，上限 1 万字。超过约 3000 字会按段落边界切块并行请求再合并，只有第一块产出大标题。

返回：

```json
{
  "title": "大标题",
  "blocks": [{ "type": "h2", "text": "小标题" }, { "type": "p", "text": "正文 **重点**" }],
  "density": "loose | standard | compact",
  "notes": "AI 的一句话说明",
  "warning": "可选，覆盖率低于 95% 时提醒核对"
}
```

防刷分层：并发锁 → 2 次/10 秒 → 20 次/小时（按分块数扣）→ 50 次/天 → 全站每日预算。超限返回 429/503 并带 `Retry-After`。

### `GET /api/health`

返回 Redis 与 AI 配置是否就绪，**不返回密钥**（只给末 4 位）。

## 部署

Vercel 导入本仓库，Framework 选 Next.js，配置上面的环境变量（不要配 `AI_API_KEY`），之后 push 到 `main` 自动部署。
