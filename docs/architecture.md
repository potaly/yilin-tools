# Yilin 工具箱 — 架构设计与选型

- 版本：v1.0（2026-10-21）
- 配套文档：[需求文档](requirements.md)

---

## 1. 技术栈

| 层 | 选择 | 理由 |
|---|---|---|
| 框架 | Next.js 14.2（App Router）+ React 18 | 与 activation-service 一致，Vercel 一等公民，API Route 与页面同仓 |
| 语言 | TypeScript strict，路径别名 `@/*` | 同上 |
| 包管理 | pnpm（提交 `pnpm-lock.yaml`） | 同上；本机用 `corepack enable pnpm` 启用 |
| 样式 | CSS Modules + `app/globals.css` CSS 变量 | 不引入 Tailwind / UI 库，站点只有少量界面，变量足够支撑深浅色 |
| 字体 | `next/font/google` 自托管 Noto Sans SC 500/700/900 | 国内不可访问 fonts.googleapis.com，必须自托管 |
| 图片生成 | 浏览器端 Canvas 2D | 沿用原型，像素级可控；服务端不生成图片，零成本、无字体环境问题 |
| 打包下载 | `jszip`（ZIP）+ `jspdf`（PDF），都走动态 import | 需求指定 ZIP；PDF 为后加需求，页面尺寸直接用卡片像素尺寸，不重排版 |
| 存储 | Upstash Redis（REST，`@upstash/redis`） | 与 activation-service 同一实例，Serverless 无连接数问题 |
| 限流 | `@upstash/ratelimit` 多层滑动窗口 + 并发锁，降级为进程内计数 | 站点对外开放，见需求 FR-6.1 |
| AI | 原生 `fetch` 调 OpenAI 兼容 Chat Completions | 不引入 openai SDK，减少依赖与体积 |
| 测试 | vitest（node 环境） | 纯逻辑单测，不需要 jsdom/canvas |
| 部署 | Vercel，`regions: ["hkg1"]`，push `main` 自动部署 | 与 activation-service 一致，离国内用户近 |

---

## 2. 分层与依赖方向

```
app/（表现层：React、路由、HTTP）
 │  只做：读表单状态、调 lib、渲染
 ▼
lib/cards/（排版引擎：纯 TS）      lib/ai/（AI 排版：纯 TS + fetch）
 │  parse → linebreak → paginate → draw        prompt → client → validate
 ▼                                              ▼
（无依赖，可在 node 下单测）              lib/config/、lib/redis.ts、lib/ratelimit.ts（平台层）
```

硬性约束（靠 code review 与 lint 守住）：

1. `lib/cards/*` **不得** import React / Next / 浏览器全局；需要测量文字宽度时由调用方注入 `Measurer`。
2. `lib/ai/*`、`lib/config/*`、`lib/redis.ts` 是服务端模块，顶部加 `import 'server-only'`，保证密钥不可能进前端 bundle。
3. `lib/` **不得** import `app/`；工具之间不互相 import。
4. 一个文件只做一件事；超过约 200 行就该拆。

---

## 3. 目录结构

```
app/
  layout.tsx                 # 顶部站点名+导航，底部版权，注入 next/font
  page.tsx                   # 首页：遍历注册表渲染工具卡片
  globals.css                # CSS 变量、深浅色、基础排版
  tools/longform-cards/
    page.tsx                 # 工具页（客户端组件入口）
    *.module.css
  api/
    ai-format/route.ts       # AI 排版接口（nodejs，maxDuration 60）
    health/route.ts          # 健康检查
lib/
  site.ts                    # 站点名 + 工具注册表
  redis.ts                   # Upstash REST 客户端 + 命名空间
  ratelimit.ts               # 限流（Upstash / 进程内降级）
  config/ai-config.ts        # AI 配置读取（env 优先，Redis 兜底，60s 缓存）
  cards/
    spec.ts                  # 画布常量、颜色、三档密度
    parse.ts                 # 文本 ⇄ blocks
    linebreak.ts             # 测量抽象 + 避头尾断行
    paginate.ts              # 分页
    draw.ts                  # Canvas 绘制
    clean.ts                 # 规则清理
    export.ts                # 导出 PNG / ZIP / PDF，手机走系统分享
    sample.ts                # 示例文字
  ai/
    format-prompt.ts         # 提示词
    client.ts                # OpenAI 兼容调用
    chunk.ts                 # 长文分块与结果合并
    validate.ts              # 结构校验 + 原文覆盖率
scripts/
  set-ai-config.ts           # 本地写入 yilin:config:ai
reference/longform-cards.html
docs/{requirements.md,architecture.md}
tests/                       # vitest 单测
```

> 与原始需求的目录清单相比，新增 `lib/ai/chunk.ts`、`lib/redis.ts`、`lib/ratelimit.ts`、`lib/config/ai-config.ts`。理由：让 `route.ts` 只负责 HTTP（校验、限流、编排），分块与配置读取各自可单测、可复用给以后的工具。

---

## 4. 模块契约

### 4.1 排版引擎

```ts
// spec.ts
export type Density = 'loose' | 'standard' | 'compact';
export const CANVAS = { w: 1080, mx: 66, top: 100, bottom: 110,
                        firstTopNoMeta: 170, metaY: 250, ruleY: 300, afterRule: 70 };
export const RATIO_HEIGHT = { '3:5': 1800, '3:4': 1440 };
export const COLORS = { bg:'#FDF9F3', title:'#84461C', h2:'#84461C',
                        body:'#8E5D36', bold:'#76390F', meta:'#AA8E74',
                        bar:'#EFE5DA', rule:'#E8DED2' };
export function metricsFor(d: Density): Metrics;   // title 参数三档相同，p / h2 按密度表变化
export function autoDensity(words: number): Density;
```

```ts
// parse.ts
parse(src: string): Block[]                 // Block = { type:'title'|'h2'|'p', text:string }
plain(text: string): string                 // 去掉 ** 标记
wordCount(blocks: Block[]): number          // 去掉空白后的字符数
toEditorText(r: FormatResult): string       // AI 结果 → 编辑器语法（# / ## / 段落）
```

```ts
// linebreak.ts
export type Measurer = (font: string, text: string) => number;
createCanvasMeasurer(fontFamily: string): Measurer   // 唯一接触 canvas 的地方，内部带缓存
tokenize(text, kind, metrics, measure): Unit[]       // 切出中文单字/英文单词/空格，带 font+color+宽度
breakLines(units, maxW): Line[]                      // 避头尾 + 不拆英文单词
```

**关键决策**：测量函数以接口注入。浏览器注入 canvas 测量器；单测注入「中文 1 字宽、英文 0.5 字宽」的假测量器，于是避头尾、两端对齐阈值、英文不拆这些规则全部能在 node 下断言，不需要 jsdom 或 node-canvas。

```ts
// paginate.ts
paginate(blocks, { height, showMeta, metrics, measure }): PageOp[][]
// PageOp = { type:'meta' } | { type:'rule' } | { type:'line', kind, line, cy, justify }
```

分页只产出**绘制指令**，不碰 canvas：页数、断行、每行 y 坐标都可在单测里直接断言（小标题跟随两行正文、段落首行不孤立）。

```ts
// draw.ts
drawPage(ops, { height, info, metrics, fontFamily }): HTMLCanvasElement

// export.ts
deliver(blob, filename, type): Promise<'shared' | 'downloaded' | 'cancelled'>
// 触摸设备且支持 canShare({files}) 时走 navigator.share，否则 <a download>
savePage(page)                     // 单张 PNG
saveZip(pages, filename)           // 动态 import jszip
savePdf(pages, size, filename)
// 动态 import jspdf；unit:'px'，format 直接用 [1080, 卡片高度]，一页一张图，不在 PDF 里重排文字
```

### 4.2 AI 排版

```ts
// format-prompt.ts
SYSTEM_PROMPT: string                       // 7 条规则 + 1 个乱文本→JSON 示例
buildUserPrompt(text: string, opts: { allowTitle: boolean }): string

// client.ts
chatJSON(cfg: AiConfig, prompt: {system,user}, opts?: { timeoutMs?: number }): Promise<unknown>
// temperature 0.2；先带 response_format:{type:'json_object'}，被拒(400) 则去掉重试并从文本提取 JSON；
// AbortController 50s 超时，留 10s 给 Vercel 的 60s 上限

// chunk.ts
chunkByParagraph(text: string, limit = 3000): string[]   // 只在段落边界切，不切断句子
mergeResults(parts: FormatResult[]): FormatResult        // 只取第一块的 title；density 按合并后总字数重算

// validate.ts
normalize(text: string): string                          // 去空白、标点、**
coverage(original: string, output: string): number       // ≤2000 字用 LCS，更长用字符频次近似
validateShape(json: unknown): FormatResult | null        // 结构非法返回 null → 上层重试 1 次
```

### 4.3 配置与存储

```ts
// redis.ts
getRedis(): Redis | null          // 缺凭据返回 null，调用方降级，不抛异常
nsKey(key: string): string        // `${process.env.REDIS_NAMESPACE ?? 'yilin:'}${key}`

// config/ai-config.ts  （'server-only'）
getAiConfig(): Promise<AiConfig | null>
// 字段级优先：env 有值用 env，否则读 yilin:config:ai；进程内缓存 60s；
// 返回 { baseUrl, apiKey, model, source:'env'|'redis'|'mixed' }，缺 apiKey 返回 null

// ratelimit.ts  （'server-only'）
identify(req: NextRequest): string
// req.ip → x-forwarded-for 首段 → 'unknown'；IPv6 归并到 /64 前缀

guard(id: string, cost: number): Promise<GuardResult>
// 依次检查：并发锁 → 突发(2/10s) → 小时(20，按 cost 扣) → 单日(50) → 全站日预算
// 任一层不过立即返回 { ok:false, status, error, retryAfter }，后面的层不再发 Redis 命令
// 三个窗口各是一个 Ratelimit 实例，带各自 prefix 与共享的 ephemeralCache(Map)
// analytics 关闭（省 Redis 命令）；缺凭据时整体降级为进程内计数

release(id: string): Promise<void>   // 释放并发锁，放在 finally 里
```

**Upstash 只有 0 号库**（`SELECT` 非 0 返回 `ERR Only 0th database is supported!`，官方建议用 key 前缀），所以「第 2 个库」落地为 `yilin:` 前缀命名空间，与 activation-service 的 `code:*` 完全不冲突，复用同一个实例与同一套 REST 凭据。

---

## 5. 数据流

### 排版流（全在浏览器）

```
textarea 输入 → debounce 300ms → parse → wordCount → (未手动则 autoDensity)
→ tokenize + measure → breakLines → paginate → drawPage ×N → canvas.toBlob
→ objectURL 预览（旧 URL revoke）→ 保存/打包
```

并发保护：每次重绘自增 `seq`，异步步骤（字体加载、toBlob）回来后 `seq` 不匹配则丢弃结果，避免快速输入时旧结果覆盖新结果（沿用原型做法）。

### AI 排版流

```
前端 POST { text }
 → 长度校验（空 → 400；>10000 字 → 413）          ← 不碰 Redis
 → identify(req) 得到 IP 身份（IPv6 取 /64）
 → 预估块数 cost = ceil(字数 / 3000)
 → guard(id, cost)：并发锁 → 突发 → 小时 → 单日 → 全站预算（不过 → 429/503 + Retry-After）
 → getAiConfig()（缺失 → 503）
 → clean(text) 预处理
 → chunkByParagraph（>3000 字才切）
 → Promise.all(chunk → chatJSON)，仅首块 allowTitle
 → validateShape（失败重试 1 次）
 → mergeResults
 → coverage < 95% → 附 warning
 → 200 { title, blocks, density, notes, warning? }
 → finally: release(id) 释放并发锁
前端：存撤销快照 → toEditorText 写回 textarea → 切密度 → 重绘 → toast
```

---

## 6. 错误码与文案

| 场景 | HTTP | `error` 文案 |
|---|---|---|
| 文本为空 | 400 | 请先粘贴要排版的文字 |
| 超过 10000 字 | 413 | 文字超过 1 万字，请分几次排版 |
| 同一 IP 已有请求在跑 | 429 | 上一次排版还没结束，请等它完成 |
| 10 秒内超过 2 次 | 429 | 操作太快了，请过几秒再试 |
| 超过每小时 20 次（按块扣） | 429 | 排版次数达到上限，请一小时后再试 |
| 超过每天 50 次 | 429 | 今天的排版次数用完了，明天再来 |
| 全站当日预算用尽 | 503 | 今天的 AI 排版额度已用完，请明天再试 |
| 未配置 AI | 503 | AI 排版暂未配置，请稍后再试 |
| 上游报错 / 超时 | 502 | AI 服务暂时不可用，请稍后重试 |
| JSON 结构重试后仍非法 | 502 | AI 返回的结果无法识别，请重试一次 |
| 覆盖率 < 95% | 200 | （`warning`）AI 可能改动了部分原文，请核对 |

所有 429 / 503 都带 `Retry-After` 响应头与 `retryAfter` 字段，前端据此提示「请 X 秒后再试」。

日志只记录错误类型、块数、字数、耗时，**不记录正文内容与任何密钥**。

---

## 7. 测试策略

vitest（node 环境），覆盖纯逻辑；UI 与 Canvas 靠人工验收（需求第 9 节）。

| 测试文件 | 覆盖点 |
|---|---|
| `clean.test.ts` | 硬换行合并；半角转全角不误伤 URL / 小数 / 英文句子；零宽字符；>150 字拆段；已有 `# ` 保留；结尾话题标签独立成段 |
| `parse.test.ts` | `# `/`## `/`**`/空行；`wordCount`；`toEditorText` 往返；**话题标签 `#养生赛道` 不被当成标题** |
| `linebreak.test.ts` | 避头尾（标点不在行首、引号不在行尾）；英文单词与小数不拆；两端对齐 >0.6 字号放弃 |
| `paginate.test.ts` | 小标题与后两行正文同页；段落首行不孤立；3:4 / 3:5 页数 |
| `validate.test.ts` | `normalize`；覆盖率 100% / 94% 边界；结构非法返回 null |
| `chunk.test.ts` | 只在段落边界切；≤3000 字不切；合并只保留首块 title；density 按总字数重算 |
| `ratelimit.test.ts` | `identify()`：IPv6 归并到 /64、`x-forwarded-for` 取首段、缺失回退 `unknown`；进程内降级限流器的窗口与 cost 扣减 |

---

## 8. 部署

- `vercel.json`：`installCommand: "pnpm install"`、`framework: "nextjs"`、`regions: ["hkg1"]`。
- Vercel 环境变量：`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`AI_BASE_URL`、`AI_MODEL`；**不配 `AI_API_KEY`**，让 Redis 里的值生效（改 Key 无需重新部署）。
- `AI_MODEL` 默认 `deepseek-flash`（DeepSeek 官方文档当前列出 `deepseek-flash` 与 `deepseek-v4-pro`，`deepseek-chat` 已不在文档中），base URL `https://api.deepseek.com`。
- API Key 写入：本地 `pnpm tsx scripts/set-ai-config.ts`，交互式输入后写 `yilin:config:ai`；Key 不落盘、不进仓库、线上无写入接口。
- push `main` 自动触发生产部署。

---

## 9. 架构决策记录（ADR）

| # | 决策 | 理由 / 代价 |
|---|---|---|
| 1 | 单仓 + 注册表驱动的多工具结构 | 加工具 = 加一条注册项 + 一个目录；代价是首页与工具耦合在一个部署单元（本期无妨） |
| 2 | 排版引擎与 React 解耦，测量函数注入 | 让避头尾/分页规则能在 node 下单测；代价是多一层接口 |
| 3 | 分页只产出绘制指令，绘制独立 | 分页可断言、绘制可替换（以后要导 SVG/PDF 不用重写分页） |
| 4 | 浏览器端 Canvas 生成图片 | 零服务端成本、无字体环境问题；代价是旧机型大图稍慢 |
| 5 | 配置：env 优先、Redis 兜底、60s 缓存 | 本地 `.env.local` 就能跑；线上不配 env，于是 Redis 生效、改 Key 不重新部署 |
| 6 | Redis 用 `yilin:` 前缀而非第 2 个库 | Upstash 只支持 0 号库；前缀达到同样的隔离效果，复用同一实例与凭据 |
| 7 | Redis 走 REST（`@upstash/redis`）而非 TCP 6379 | Serverless 下短连接友好、与 activation-service 一致；TCP 长连接会积累连接数 |
| 8 | 限流分四层（并发锁 + 10 秒突发 + 小时 + 单日），小时层按分块数扣额度，外加全站日预算 | 站点对外开放：单一小时窗口挡不住连点，也挡不住超长文本放大上游调用；层层前置让被拦请求几乎不耗 Redis。代价是正常请求每次多几条 Redis 命令 |
| 8b | 限流器开 `ephemeralCache`、关 `analytics` | 洪水请求命中内存缓存后 0 条 Redis 命令，这才是抗刷的关键；关分析是为了省免费额度 |
| 8c | IPv6 按 /64 归并；缺凭据时降级进程内计数 | 防止在自己网段内换地址绕过；降级只在单实例内有效，属尽力而为 |
| 9 | 长文按段落边界分块并行，仅首块出大标题 | 压缩等待时间、避免多个大标题；代价是节与节之间的小标题可能略不均衡 |
| 10 | 覆盖率：短文 LCS、长文字符频次近似 | 10000×10000 的 LCS 不可接受；近似在「是否被改写」这个判断上足够 |
| 11 | 颜色与排版参数拆成 `COLORS` / `METRICS` | 修掉原型 `C` 对象重复键导致标题颜色失效的缺陷（见需求文档 D-1） |
| 12 | PDF 用 jspdf 直接贴图，不在 PDF 里重排文字 | 卡片已经是像素级排好的图，贴图保证 PDF 与 PNG 完全一致，也不必往 PDF 里嵌中文字体（嵌字体会让文件大好几 MB） |
| 13 | 覆盖率比对包含大标题与 h2 | 只比对 `p` 会把「AI 正确提取小标题」误判成改写，实测 0.861 vs 1.000 |
| 14 | 标题语法要求井号后跟空格 | 否则社交平台的话题标签（`#养生赛道`）会被当成大标题；标准 Markdown 本来就要求空格 |
| 15 | 草稿写入放在改文字的入口函数里，不用 effect | 跟随 `text` 的 effect 在挂载那一轮会用初始示例覆盖已存草稿，StrictMode 下必现 |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Node 24 + Next 14.2 构建兼容性 | 脚手架阶段先跑 `pnpm build` 验证；失败则换 Node 20 或升 Next 15 并告知 |
| 本机构建期访问 Google Fonts 失败 | 改 `next/font/local` 自带 woff2（视觉不变） |
| DeepSeek 不支持 `json_object` | `client.ts` 已设计降级：去掉参数 + 从文本提取 JSON |
| AI 偷改原文 | 服务端覆盖率校验 + 前端提示条 + 撤销快照 |
| Upstash 免费额度 10000 命令/天 | 配置读取 60s 进程内缓存；一次正常排版约 6 条命令（锁 2 + 窗口 3 + 预算 1），被限流的请求 1~2 条，命中内存缓存的 0 条 |
| 有人用代理池换 IP 刷接口 | 全站日预算是最后一道闸：超了全站当天停发，保证 AI 余额不被刷空；必要时再开 Vercel 防火墙按路径限流 |
| `navigator.share` 部分安卓浏览器不支持 files | `canShare({files})` 探测 + 「长按图片保存」兜底 |
