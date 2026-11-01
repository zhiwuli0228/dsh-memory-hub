# Current State

本文件是项目连续性快照。**每次完成改动后都要更新**。

## 当前阶段

V0.1.2 已发布：Host 插件 + Web 面板（含核心/子工作区配置），并支持多核心仓（multi-hub）：每个 `core_workspace.root` 都是一个独立的记忆仓库，会话按当前工作目录最长前缀匹配到对应的核心仓；DSH Desktop Runtime `0.2.1-rc.5` 宿主冒烟通过。npm 包 `dsh-memory-hub@0.1.2` 已上架，仓库同时提供自托管插件市场索引。

## 已实现

- [x] Cordis 插件入口 `src/index.ts`（`apply` / `inject`）
- [x] 9 个模型工具注册与 schema（`memory_search`, `memory_get`, `memory_status`, `memory_preflight`, `memory_cite`, `memory_propose`, `memory_commit`, `memory_close_task`, `memory_consolidate`）
- [x] 本地优先存储：Markdown + YAML + JSONL，无强制数据库
- [x] CJK unigram/bigram 分词 + 内存倒排索引 + BM25-lite 检索
- [x] 每个用户回合第一步自动预检；幂等键 `(sessionId, turn)`
- [x] 紧凑上下文注入（`memory:pack`），只含 ID、标题、摘要、作用域
- [x] 引用记录（`memory_cite`）区分检索命中与实际使用
- [x] 候选创建（`memory_propose`）与提交审批（`memory_commit`）
- [x] 任务关闭评估（`memory_close_task`）：`proposed` / `no_new_knowledge` / `needs_evidence` / `deferred`
- [x] 手动汇总（`memory_consolidate`）：项目知识晋升为 global 候选
- [x] 作用域系统：`global` / `domain:<id>` / `project:<workspace-id>`
- [x] 核心/子工作区模型：`core_workspaces` 与 `workspaces[].core_id`
- [x] 多核心仓（multi-hub）：每个 `core_workspace.root` 作为独立数据仓库，按工作目录最长前缀路由
- [x] 子工作区可感知主工作区：同一核心仓下的子工作区可见 `project:<core-id>` 作用域知识
- [x] 子工作区根目录参与路由：子工作区即使不在核心仓根目录下，也能路由到所属核心仓
- [x] 测试模式 `policy.approval.mode: auto`：跳过 DSH 审批，账本 `approvalRef` 记为 `test:auto`（默认仍为 `manual`）
- [x] 核心共享：`memory_propose` 支持 `scope: "core"` 别名，子工作区可把可复用知识回填到 `project:<core-id>`
- [x] `dsh-plugin-dev` 核心工作区已写入首批 6 条插件开发基线（入口、工具、客户端、开发循环、常见坑、回填检查清单）
- [x] 面板知识列表对 `project:<core-id>` 显示「核心共享」标签
- [x] Web 面板六个标签页：总览 / 配置 / 知识 / 待审批 / 活动与策略 / 能力
- [x] 面板只读，配置回环 HTTP 路由（`/dsh-memory-hub/api/*`）
- [x] 39 个 vitest 测试（7 个文件）
- [x] npm 发布：`dsh-memory-hub@0.1.2`（2026-11-01，`latest`）
- [x] GitHub release `v0.1.2`，仓库 homepage 指向 npm 包页
- [x] GitHub Actions 自动发布：`.github/workflows/release.yml`（tag 触发，Windows 构建/测试，可选 npm 发布，自动创建 Release 并上传 tarball）
- [x] Release workflow 已实测通过（`workflow_dispatch` + `v0.1.2`）；未配置 `NPM_TOKEN` 时跳过 npm 发布，其余步骤成功
- [x] 发布说明：`docs/06-operations/release.md`
- [x] 插件市场索引：`site/index.json`，可通过 jsDelivr 作为 DSH 自定义市场源
- [x] `PLUGIN_VERSION` 直接读取 `package.json`，构建 banner 同步版本，避免发布时版本漂移
- [x] TypeScript + esbuild 构建，产出 `dist/index.js`
- [x] 宿主兼容性验证记录（`docs/COMPATIBILITY.md`）
- [x] 新增项目文档体系（`docs/` 目录层级 + `AGENTS.md`）

## 当前约束

- Markdown / YAML / JSONL 是唯一权威数据格式。
- 默认不使用向量数据库。
- `memory_commit` 必须经过 DSH 原生人工审批；模型不可自批。
- Web 面板只读；面板路由只允许回环请求。
- 单写者模型：第二个进程降级为只读。
- Windows 原生路径语义。

## 已知限制

- DSH 原生审批提示的**真实点击通过**路径未验证；本机审批提示关闭。测试模式 `auto` 已验证自动提交与 `test:auto` 账本记录。
- 门禁的宿主级拒绝未在真实会话中强制触发，由单元测试覆盖。
- PTC `run_code` 嵌套调用未验证。
- 外部 CLI / 多进程共享 Hub 未验证。
- 长会话上下文累积效果未做规模测量。
- 5k 条索引性能未压测。
- Web 面板完整视觉效果尚未人工确认。
- 核心仓若位于 `~/.dsh/memory-hub` 之外，需要 DSH 跨目录操作授权。
- GitHub Actions 的 npm 自动发布依赖仓库 secret `NPM_TOKEN`；当前未配置，workflow 会跳过 npm 发布，仅创建 GitHub Release。

## 当前目录

```text
dsh-memory-hub/
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── esbuild.config.mjs
├── cordis.patch.yml
├── client.js
├── src/
│   ├── index.ts
│   ├── runtime.ts
│   ├── service.ts
│   ├── store.ts
│   ├── search.ts
│   ├── frontmatter.ts
│   ├── host.ts
│   ├── hub.ts
│   ├── config.ts
│   ├── scope.ts
│   ├── ledger.ts
│   ├── lock.ts
│   ├── atomic.ts
│   ├── ids.ts
│   ├── time.ts
│   ├── errors.ts
│   ├── types.ts
│   └── tools.ts
├── tests/
├── docs/
│   ├── DESIGN.md
│   ├── KNOWLEDGE-FORMAT.md
│   ├── COMPATIBILITY.md
│   └── ...（本目录体系）
├── site/
│   ├── index.json
│   └── icons/
└── dist/
```

## 下一步推荐工作

1. 在真实会话中验证审批**通过**路径。
2. 增加面板交互与视觉验收测试。
3. 压测 5k+ 条知识索引与检索性能。
4. 验证 PTC `run_code` 嵌套调用与门禁边界。
5. 补充外部 CLI / 多进程共享 Hub 测试。
6. 评估索引落盘与增量重建（V0.2 方向）。
