# Lenny Insight Hub

本地运行的 Lenny Podcast 与 Newsletter 中文知识工作台。应用以 638 篇完整资料为历史基线，再用官方 starter pack 与 303 份带时间戳逐字稿补齐更新内容和来源信息。

## 已实现

- Next.js 16 App Router 前后端一体化，React 19 + TypeScript
- 本地 SQLite + FTS5，原始 Markdown 只读、不改写
- Podcast / Newsletter 解析、URL/视频 ID 去重、内容哈希与解读过期标记
- 概览统计、发布趋势、主题分布、跨类型主题覆盖
- 全文搜索、组合筛选、排序与按需 OpenAI 语义搜索
- 固定结构中文解读，核心观点和案例强制关联原文片段
- Podcast 证据跳转 YouTube 时间戳，Newsletter 跳转来源或页面段落
- Newsletter RSS、Sitemap、Podcast RSS 同步和运行记录
- 每周结构化洞察，模型输出自动校验、失败重试一次
- 无密钥、离线、正文缺失、付费预览和失败状态提示

## 运行

```bash
cd lenny-hub-app
npm install
npm run import:data
npm run import:interpretations -- /absolute/path/to/lenny中文解读
cp .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

不配置 `OPENAI_API_KEY` 也能使用导入、统计、全文搜索、筛选、详情与同步功能。中文解读、每周洞察和真正的向量语义排序需要密钥。

项目包含 `native:ensure` 启动自检。如果安装依赖与启动应用时使用了不同
Node.js 版本，它会在 `dev`、`build` 或 `start` 前自动为当前 Node 重新编译
`better-sqlite3`，避免 `NODE_MODULE_VERSION` 不匹配。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `AI_PROVIDER` | 服务商标识，默认 `openai`；使用 Gemini 时设为 `gemini` |
| `OPENAI_API_KEY` | 可选；开启解读、周报和向量语义搜索 |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址；可指向 Gemini 兼容端点 |
| `OPENAI_ANALYSIS_MODEL` | 默认 `gpt-5.4-mini` |
| `OPENAI_EMBEDDING_MODEL` | 默认 `text-embedding-3-small` |
| `LENNY_BASE_DATA_DIR` | 638 篇基线资料路径 |
| `LENNY_STARTER_DATA_DIR` | 官方新版 starter pack 路径 |
| `LENNY_TRANSCRIPTS_DIR` | 带时间戳逐字稿路径 |
| `LENNY_DB_PATH` | SQLite 文件路径 |
| `LENNY_AUTO_SYNC` | 默认 `true`，应用启动时检查是否超过 24 小时未同步 |

默认路径均指向当前工作区内三个相邻资料目录，通常无需填写。

## API

- `GET /api/stats`
- `GET /api/content`
- `GET /api/content/:id`
- `POST /api/content/:id/analyze`
- `POST /api/sync`
- `GET /api/sync/status`
- `GET /api/weekly`
- `POST /api/weekly/generate`

额外提供 `POST /api/maintenance`，由本地界面启动时调用，用于每日检查和关机后的补跑。

## 验证

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

数据库默认写入 `data/lenny-hub.db`，已加入 `.gitignore`。删除数据库后重新运行 `npm run import:data` 可从只读 Markdown 重建。

中文解读导入会扫描给定目录下的 `解读/newsletter/*.md` 与
`解读/podcast/*.md`，优先按标题和日期关联原文，并用 transcript 的 video ID
补足短标题条目。导入是幂等的；完整 Markdown 会保存在 `insights.raw_markdown`，
同时解析成详情页使用的结构化解读。也可以通过
`LENNY_INTERPRETATIONS_DIR` 指定目录。

配置 `SUPABASE_DATABASE_URL` 后，应用会自动使用 Supabase PostgreSQL；未配置时仍使用本地 SQLite。首次把本地完整数据迁移到 Supabase：

```bash
npm run migrate:supabase
```

迁移脚本会以本地 `data/lenny-hub.db` 为准，替换目标 Supabase 项目中的 Lenny Hub 表数据。
