# n8n 实操：RSS → AI 摘要 → Notion

- 版本：v1.0（2026-10-25）
- 环境：n8n 跑在 docker（compose 项目 `n8n`，网络 `n8n_default`），访问 http://localhost:5678
- 配套：[01-实现方案.md](01-实现方案.md)

---

## 0. 已经做好的事

RSSHub 自建完成，作为一个服务写进了 `~/developer/docker/n8n/docker-compose.yml`：

```yaml
  rsshub:
    image: diygod/rsshub:latest
    restart: unless-stopped
    ports:
      - "${RSSHUB_PORT:-1200}:1200"
    environment:
      NODE_ENV: production
      CACHE_TYPE: memory
      CACHE_EXPIRE: 600
      TZ: Asia/Shanghai
```

实测结果：

| 从哪里访问 | 地址 | 结果 |
|---|---|---|
| 你的浏览器 / 终端 | `http://localhost:1200/aibase/news` | 200，30 条 |
| **n8n 节点里填这个** | **`http://rsshub:1200/aibase/news`** | 200，30 条 |

> **为什么节点里不能填 localhost**：n8n 跑在容器里，容器里的 `localhost` 指的是它自己，不是你的 Mac。同一个 compose 网络里，容器之间用**服务名**互相访问，所以是 `rsshub:1200`。这是 docker 里最常见的一个坑，几乎每个人都会踩一次。

常用命令：

```bash
cd ~/developer/docker/n8n
docker compose up -d rsshub      # 启动
docker compose logs -f rsshub    # 看日志（路由报错时第一时间看这里）
docker compose restart rsshub    # 重启
```

RSSHub 支持几千个路由，不止 aibase。想加源就改路径，例如 `/aibase/news`、`/36kr/newsflashes`、`/zhihu/people/activities/<id>`。路由清单见 RSSHub 官方文档。

---

## 1. 这条工作流的六个节点

```
Manual Trigger → RSS Read → Limit → Markdown → AI Agent → Notion
   (调试用)        取数      限量    HTML转MD    出摘要    写表格
```

逐个说要点和坑。

### ① Manual Trigger（When clicking 'Execute workflow'）

调试阶段用它。**跑通之后换成 Schedule Trigger**（定时），不要用 RSS Feed Trigger —— 它自带的"只取新条目"逻辑在源不稳时容易漏，自己做去重更可控。

### ② RSS Read

- URL 填 `http://rsshub:1200/aibase/news`
- Settings 里打开 **Continue On Fail**：源挂了别让整条流水线崩
- 这个节点**不能加请求头**，所以当初 rsshub.app 的 Cloudflare 校验它绕不过去——这就是自建的真正理由

### ③ Limit

调试时设 3，省 token。正式跑再放开。**调试阶段永远先 Limit 再调 AI**，否则一次 30 条下去，钱和时间都浪费在重复试错上。

### ④ Markdown（HTML to Markdown）

RSS 的 `content` 字段是 HTML，塞给模型会浪费大量 token 在标签上。转成 Markdown 之后同样内容 token 能少三到五成。

### ⑤ AI Agent

- **Chat Model**：你现在挂的是 OpenRouter。国内直连不稳的话，换 DeepSeek（OpenAI 兼容）更省也更快
- **Structured Output Parser**：必须用。它强制模型输出固定 JSON，下游 Notion 节点才能稳定取字段。Schema 建议：

```json
{
  "title": "字符串，中文标题，不超过 30 字",
  "summary": "字符串，一句话摘要，不超过 80 字",
  "tags": ["字符串数组，1-3 个"],
  "url": "字符串，原文链接"
}
```

- System Prompt 里写死三条：只能依据给定内容、不得编造数字和人名、拿不准的字段留空字符串
- **Memory 不要挂**。这是批处理不是聊天，挂了记忆反而会让第 2 条受第 1 条影响

### ⑥ Notion（create: databasePage）

- 先在 Notion 里把 integration 建好，并在目标数据库右上角 **`···` → 连接 → 选中你的 integration**。90% 的"Notion 节点报 404 / object_not_found"都是忘了这一步，不是 token 错
- 字段映射对着你那张表：`title` → title、`summary` → summary、`date` → 当天、`status` → 固定填 `Draft`（**不要直接 Published**，人工过一眼再改）
- `type` / `category` 这类固定值直接写死

---

## 2. 必须补的一步：去重

定时跑起来之后，每次都会把 RSS 里的 30 条重新写一遍。两种做法：

**做法 A（简单）**：Notion 节点前加一个 Notion「Get Many databasePage」+ Filter 节点，按 `url` 或 `title` 判断是否已存在。

**做法 B（更稳）**：RSS Read 之后加 Code 节点，用条目的 `link` 做 key，存到 n8n 的 Static Data 里：

```javascript
const seen = $getWorkflowStaticData('global');
seen.ids = seen.ids || [];
const fresh = items.filter(i => !seen.ids.includes(i.json.link));
seen.ids = [...seen.ids, ...fresh.map(i => i.json.link)].slice(-500);
return fresh;
```

> 去重不做，表里一周就全是重复条目，然后你会放弃这条流水线。这不是可选项。

---

## 3. 调试手法（比节点配置更重要）

| 手法 | 做法 | 解决什么 |
|---|---|---|
| **单节点执行** | 点节点上的 Execute step | 不用每次从头跑 |
| **Pin Data** | 节点输出右上角图钉 | 把一次真实输出钉住，改下游时不再反复请求 RSS 和烧 AI token |
| **看 INPUT/OUTPUT 面板** | 左 INPUT 右 OUTPUT | 字段名不确定时，直接在 OUTPUT 里点字段拖进下游参数 |
| **表达式** | `{{ $json.title }}`、`{{ $('RSS Read').item.json.link }}` | 跨节点取值 |
| **看 Executions 标签页** | 顶部 Editor / Executions | 定时跑失败后查历史，错在哪个节点一目了然 |

**最该先学会的是 Pin Data。** 没有它，调 Notion 字段映射要反复触发 AI，既慢又烧钱。

---

## 4. 跑通之后

1. Manual Trigger 换成 **Schedule Trigger**，设每天 8:00
2. 右上角开关从 Inactive 切到 **Active**（不切定时不会跑，这是新手最常见的"为什么没执行"）
3. 观察三天，确认没有重复、没有空摘要
4. 再往后接：Notion 里 `status=待发` 的记录 → 生成小红书图文 → 本机 Playwright 脚本填进发布页 → 人工点发布

---

## 5. 排错速查

| 现象 | 原因 | 解法 |
|---|---|---|
| RSS 403 | 源站有 Cloudflare 人机校验 | 用自建 RSSHub（已做）或换镜像 |
| RSS 连不上 `localhost:1200` | 容器里的 localhost 不是宿主机 | 改成 `rsshub:1200` |
| Notion object_not_found | 数据库没连接到 integration | Notion 数据库 `···` → 连接 → 选 integration |
| AI 输出字段时有时无 | 没挂 Structured Output Parser | 挂上，并在 Schema 里把字段设为必填 |
| 表里全是重复 | 没做去重 | 见第 2 节 |
| 定时不触发 | 工作流没 Active | 右上角开关 |
| RSSHub 某个路由报错 | 路由失效或需要浏览器渲染 | `docker compose logs -f rsshub` 看具体报错 |
