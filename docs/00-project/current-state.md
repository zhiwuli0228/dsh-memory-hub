# Current State

本文件是项目连续性快照。**每次完成改动后都要更新**。

## 当前阶段

V0.1.3 已发布：Host 插件 + Web 面板（含核心/子工作区配置），并支持多核心仓（multi-hub）：每个 `core_workspace.root` 都是一个独立的记忆仓库，会话按当前工作目录最长前缀匹配到对应的核心仓；DSH Desktop Runtime `0.2.1-rc.5` 宿主冒烟通过。npm 包 `dsh-memory-hub@0.1.3` 已上架，仓库同时提供自托管插件市场索引。

当前工作树为 **V0.1.4（未发布）**：预检增加 `min_score` / `local_boost` 相关性门控，包尾改为指令式回写提示，面板任务行显示命中数与引用数；注册系统级 `memory-hub` skill，把“检索 → 读正文 → 引用 → 回写 → 关闭”的流程从插件提示提升为可加载的操作规范；并新增夜间确定性维护：每天 03:00 巡检所有 core / 子工作区，写报告并按需生成 pending 提案，永不自动提交。

## 已实现

- [x] Cordis 插件入口 `src/index.ts`（`apply` / `inject`）
- [x] 10 个模型工具注册与 schema（`memory_search`, `memory_get`, `memory_status`, `memory_preflight`, `memory_cite`, `memory_propose`, `memory_commit`, `memory_close_task`, `memory_consolidate`, `memory_maintenance`）
- [x] 本地优先存储：Markdown + YAML + JSONL，无强制数据库
- [x] CJK unigram/bigram 分词 + 内存倒排索引 + BM25-lite 检索
- [x] 每个用户回合第一步自动预检；幂等键 `(sessionId, turn)`
- [x] 预检相关性门控：`policy.preflight.min_score` 过滤弱命中，全部低于阈值时记 `no_match`
- [x] 本地优先排序：`policy.preflight.local_boost` 提升当前工作区 `project:<id>` 知识
- [x] 紧凑上下文注入（`memory:pack`），只含 ID、标题、摘要、作用域
- [x] 指令式包尾：先 `memory_get`、使用后 `memory_cite`、结束前 `memory_close_task`，并提示加载 `memory-hub` skill
- [x] 系统级 `memory-hub` skill：由插件注册到 Host 全局 skills 层，模型/用户可按需加载；覆盖检索、作用域、写入审批、回写评估、核心回填与反模式
- [x] 官方 skill 命名审计：当前 catalog 无 `memory-hub` / 旧名 `memory-management`；采用产品自有名避免 runtime 静默遮蔽 bundled；测试锁定官方名称快照
- [x] Skill 注册降级：宿主没有 `skills` 服务时只记录 warning，不影响 10 个记忆工具
- [x] 引用记录（`memory_cite`）区分检索命中与实际使用
- [x] 面板任务行显示预检命中数与引用数，暴露“命中但未引用”的断点
- [x] 候选创建（`memory_propose`）与提交审批（`memory_commit`）
- [x] 任务关闭评估（`memory_close_task`）：`proposed` / `no_new_knowledge` / `needs_evidence` / `deferred`
- [x] 手动汇总（`memory_consolidate`）：项目知识晋升为 global 候选
- [x] 夜间维护（`memory_maintenance`）：确定性巡检，报告写 `<hub>/reports/<timestamp>.md` + `latest.md`
- [x] 维护候选：精确重复（标题 + 摘要 + 正文哈希）生成 deprecate pending；带 `core` / `shared` / `reusable` / `promote` 标签的子工作区知识生成核心晋升 pending
- [x] 维护只读保护：不 commit、不删除、不改写正文；同一指纹已有 pending 时跳过；单次最多 10 条候选（可配 1..20）
- [x] 维护扫描所有 core，单个 core 失败不阻塞其他 core；报告包含近似重复、过期 pending、长期未引用、加载诊断、超长正文、作用域异常
- [x] Host 夜间定时器：`policy.maintenance.enabled` + `time`（默认 03:00）；每 60 秒检查，当天只跑一次；错过时间在下一次 Host 启动后补跑
- [x] 维护状态记录：`<root>/records/maintenance-state.json`，避免同一天重复执行；工具输出包含逐个 core 的统计与错误
- [x] 作用域系统：`global` / `domain:<id>` / `project:<workspace-id>`
- [x] 核心/子工作区模型：`core_workspaces` 与 `workspaces[].core_id`
- [x] 多核心仓（multi-hub）：每个 `core_workspace.root` 作为独立数据仓库，按工作目录最长前缀路由
- [x] 子工作区可感知主工作区：同一核心仓下的子工作区可见 `project:<core-id>` 作用域知识
- [x] 子工作区根目录参与路由：子工作区即使不在核心仓根目录下，也能路由到所属核心仓
- [x] 测试模式 `policy.approval.mode: auto`：跳过 DSH 审批，账本 `approvalRef` 记为 `test:auto`（默认仍为 `manual`）
- [x] 核心共享：`memory_propose` 支持 `scope: "core"` 别名，子工作区可把可复用知识回填到 `project:<core-id>`
- [x] `dsh-plugin-dev` 核心工作区已写入 9 条插件开发基线（入口、工具、客户端、开发循环、常见坑、回填检查清单、npm 发布踩坑、发布 checklist、预检采用率诊断）
- [x] 发布经验已回填核心：`KNO-000002`（npm 发布/Trusted Publisher/市场索引踩坑）、`PRC-000003`（发布 checklist）
- [x] 预检采用率经验已回填核心：`KNO-000003`（预检运行≠被使用，先修相关性/指令/可见性，再考虑行为门禁）
- [x] 本仓本地决策：`DEC-000002`（min_score=1.0、local_boost=1.2）
- [x] 系统级 skill 经验已回填核心：`API-000004`（`ctx.skills.register` 与按需加载）；本仓决定：`DEC-000003`（采用 `memory-hub` skill）
- [x] 面板知识列表对 `project:<core-id>` 显示「核心共享」标签
- [x] Web 面板六个标签页：总览 / 配置 / 知识 / 待审批 / 活动与策略 / 能力
- [x] 面板只读，配置回环 HTTP 路由（`/dsh-memory-hub/api/*`）
- [x] 53 个 vitest 测试（10 个文件）
- [x] npm 发布：`dsh-memory-hub@0.1.3`（2026-11-01，`latest`）
- [x] GitHub release `v0.1.3`，仓库 homepage 指向 npm 包页
- [x] GitHub Actions 自动发布：`.github/workflows/release.yml`（tag 触发，Windows 构建/测试，Trusted Publisher/OIDC 发布 npm，自动创建 Release 并上传 tarball）
- [x] Trusted Publisher 端到端验证：`v0.1.3` 由 GitHub Actions 无 token 发布，npm 记录 SLSA provenance
- [x] Release workflow 已实测通过（tag push + `v0.1.3`）；无需 `NPM_TOKEN`
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
- 预检已覆盖所有子工作区，但模型实际调用 `memory_get` / `memory_cite` / `memory_close_task` 的比例仍低；账本中大量任务以 `deferred`（`turn ended without an assessment`）关闭。`memory-hub` skill 只是可加载的操作规范，不强制模型加载或执行。
- `memory-hub` skill 已出现在 skill catalog 并可加载，但是否被主动加载尚未量化；skill 加载不写记忆账本，短期只能通过会话行为观察。
- 子工作区本地 `project` 知识仍很少；没有本地条目时，预检只能返回核心共享知识。
- 夜间维护依赖 Host 运行；Host 关闭时不会执行，下一次启动且当天未跑过会补跑一次。当前本机已在 `23:29` 因“当天未跑且已过 03:00”触发过一次，说明补跑逻辑生效。
- 夜间维护只做确定性判断：精确重复才生成 deprecate，近似重复/语义合并只报告；晋升只认显式复用标签，避免误判。
- `reports/` 目前不自动清理；报告会随天数增长。
- 维护提案不会自动提交；第二天仍需人工 `memory_commit`（或保留 pending 继续观察）。

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
│   ├── skill.ts
│   ├── maintenance.ts
│   ├── maintenance-schedule.ts
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
4. 观察 `min_score` / `local_boost` 上线后的预检命中与引用比例；若模型仍不读，再评估“高分命中未 `memory_get` 时拦截首次变更工具”的行为门禁。
5. 观察 `memory-hub` skill 是否被模型主动加载；若 catalog 可见但加载率低，再考虑在预检包尾加入一行 skill 提示，而不是自动注入全文。
6. 给每个子工作区补一条本地 `project:<id>` 基线知识，验证 local-first 排序。
7. 观察夜间维护：第二天检查 `reports/latest.md` 与 `pending/`，确认候选质量；若长期没有候选，再评估是否放宽“精确重复”或增加显式复用标签。
8. 验证 PTC `run_code` 嵌套调用与门禁边界。
9. 补充外部 CLI / 多进程共享 Hub 测试。
10. 评估索引落盘与增量重建（V0.2 方向）。
