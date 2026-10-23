# Yilin 工具箱

一个可以不断加工具的轻量工具站。第一个工具是「长文图卡」：粘贴一段文字，自动排成手机比例的长图卡片（米白底、棕色字、大标题带高亮条），可以保存成 PNG、ZIP 或 PDF（手机上一键全部存进相册），并支持 **AI 一键排版**。

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
| `ADMIN_TOKEN` | 后台必填 | 进 `/admin` 的口令，自己设一个随机长字符串 |
| `RESEND_API_KEY` | 登录必填 | 发邮箱验证码用；没配时开发环境把验证码打到日志，生产环境报错 |
| `MAIL_FROM` | 否 | 发件人，默认 `Yilin 工具箱 <onboarding@resend.dev>` |
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

## 怎么加一套卡片模板

在 `lib/cards/templates.ts` 的 `TEMPLATES` 里加一条即可：一套颜色（`bg` / `title` / `h2` / `body` / `bold` / `meta` / `bar` / `rule`，封面可选 `coverBg` / `coverInk`）、标题装饰方式（`highlight` / `underline` / `none`）、标题与正文各自的字体（`titleFont` / `bodyFont`，`sans` 或 `serif`），以及两个版式开关（`marginRule` 页边竖线、`authorAt` 署名位置）。排版层不认识颜色，所以加模板不需要动分页代码，界面上的选择器会自动多出一个色块。

## 怎么加第二个工具

1. 在 `lib/site.ts` 的 `TOOLS` 里加一条（slug / 名称 / 说明 / 图标）。
2. 建 `app/tools/<slug>/page.tsx`。
3. 纯逻辑放 `lib/<domain>/`，并在 `tests/` 里补单测。

首页会自动出现新卡片，不需要改首页代码。

## 登录

`/login` 支持两种方式，都不设密码。

### 微信扫码登录

走微信开放平台「网站应用」，`scope=snsapi_login`。配齐这三个环境变量就会在登录页出现微信按钮：

| 变量 | 说明 |
|---|---|
| `WECHAT_APP_ID` | 网站应用的 AppID |
| `WECHAT_APP_SECRET` | AppSecret |
| `WECHAT_REDIRECT_URI` | 回调地址，域名必须和应用里填的「授权回调域」一致，且域名要已备案 |

微信那边的前置条件（代码给不了，得去申请）：

1. 微信开放平台账号 + **开发者资质认证**（要营业执照，年费 300 元）
2. 创建**网站应用**并通过审核，拿到 AppID / AppSecret
3. 在应用里填「授权回调域」

身份标识优先用 `unionid`，拿不到才退回 `openid`。回调用一次性 `state` 防 CSRF，存 Redis、10 分钟过期、用完即删。

> **在微信内置浏览器里打不开扫码页**——自己扫不了自己的码。那个场景要走公众号网页授权（另一个 AppID、另一套资质），登录方式已经做成 provider，以后加一个就行。

### 邮箱验证码登录第一次登录自动建账户并赠送算力（默认 20 次）。

- 发信走 Resend，需要 `RESEND_API_KEY`。**没配时**：开发环境把验证码直接显示在页面上，生产环境报错。
- 验证码 6 位、10 分钟有效、用一次就作废；同一邮箱和同一 IP 每分钟最多发 3 次。
- 会话存 Redis，30 天过期，cookie 是 httpOnly。
- `?next=` 只接受站内相对路径，挡掉跳转钓鱼。

### 本地开发不用配 Redis

没有 Upstash 凭据时，**非生产环境**会自动顶一个内存版 Redis（`lib/redis-memory.ts`），账户、算力、后台都能真跑，进程重启就清空。生产环境没凭据则照常报错，不会把数据悄悄写进内存。

## 后台

`/admin` 能看到用量、账户和运营参数。

进后台两种方式：

1. **口令**：访问 `/admin?token=<ADMIN_TOKEN>`，校验通过后换成 httpOnly cookie，12 小时内不用再带。`ADMIN_TOKEN` 是你在环境变量里自己设的随机长字符串，没设就进不去。
2. **管理员邮箱**：在后台的「管理员邮箱」里填上自己的邮箱，之后用那个账户登录就能直接进。

后台能看/能改：

- 总览与近 14 天：排版次数、分块数、字数、输入输出 token、真实成本、扣掉的算力
- **按 IP**：近 14 天里每个 IP 每天的排版次数、字数、输入输出 token、成本。没有登录的情况下，IP 是唯一能区分用户的东西，也是查谁在刷的依据
- 账户列表：邮箱、注册时间、最后登录、登录次数、剩余算力、累计排版与成本
- 运营参数（存 Redis，改完立即生效）：新账户赠送算力、每块扣多少、加价率、充值档位、管理员邮箱、**计费开关**
- 手动调算力：没接支付之前，用户付款后在这里给他加

> **计费开关默认关闭**。关着的时候照常记用量，但不要求登录、不扣算力。登录页做好之前别打开。

IP 用量按天存成一个 hash（字段是「IP|指标」），一次 `hgetall` 就能取回当天所有 IP，保留 45 天。IPv6 按 /64 归并，和限流用的是同一个口径。

## 算力口径

对用户只说「算力」，不出现 token 字样。

- 一次短文排版扣 1 点，1 万字约 4 块就扣 4 点
- 新账户默认送 20 点，成本约 0.09 元/人
- 真实成本按 DeepSeek 的分档价（缓存命中 / 未命中 / 输出）逐次计算，后台能看到
- 加价率只用于后台算账参考，DeepSeek 调价时改这个值即可

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
