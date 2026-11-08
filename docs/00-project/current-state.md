# Current State

本文件是项目连续性快照。**每次完成改动后都要更新**。

## 当前阶段

V0.5.0 已实现（待发布）：**每个工作区的定时蒸馏**——面板「配置」页可为核心/子工作区启用每日蒸馏，指定时间、投递目标（新建会话或指定会话）与候选上限；插件把配置对齐为 Host `schedule` 任务，到点在对应工作区开始蒸馏。蒸馏只创建上级（或 global）候选，仍需人工在「待审批」批准。V0.4.0 的面板批量审核、`panel:human` 账本与回环安全校验保持不变。

当前工作树为 **V0.5.0（待发布）**：在 V0.4.0 之上加入定时蒸馏。升级免卸载方案见 [docs/06-operations/upgrade-guide.md](../06-operations/upgrade-guide.md)。

## 已实现

- [x] Cordis 插件入口 `src/index.ts`（`apply` / `inject`）
- [x] 10 个模型工具注册与 schema（`memory_search`, `memory_get`, `memory_status`, `memory_preflight`, `memory_cite`, `memory_propose`, `memory_commit`, `memory_close_task`, `memory_consolidate`, `memory_maintenance`）
- [x] 本地优先存储：Markdown + YAML + JSONL，无强制数据库
- [x] CJK unigram/bigram 分词 + 内存倒排索引 + BM25-lite 检索
- [x] 每个用户回合第一步自动预检；幂等键 `(sessionId, turn)`
- [x] 预检相关性门控：`policy.preflight.min_score` 过滤弱命中，全部低于阈值时记 `no_match`
- [x] 本地优先排序：`policy.preflight.local_boost` 提升当前工作区 `project:<id>` 知识
- [x] 紧凑上下文注入（`memory:pack`），只含 ID、标题、摘要、作用域
- [x] 按需读取：`memory_get` 默认摘要（结论 + 小节目录，700 字符封顶），`section` 读单节（2000 字符封顶），`full: true` 读全文；`memory_search` 支持 `detail: "ids"` 紧凑扫描
- [x] 指令式包尾：先 `memory_get`、使用后 `memory_cite`、结束前 `memory_close_task`，并提示加载 `memory-hub` skill
- [x] 系统级 `memory-hub` skill：由插件注册到 Host 全局 skills 层，模型/用户可按需加载；覆盖检索、作用域、写入审批、回写评估、核心回填与反模式
- [x] 官方 skill 命名审计：当前 catalog 无 `memory-hub` / 旧名 `memory-management`；采用产品自有名避免 runtime 静默遮蔽 bundled；测试锁定官方名称快照
- [x] Skill 注册降级：宿主没有 `skills` 服务时只记录 warning，不影响 10 个记忆工具
- [x] 引用记录（`memory_cite`）区分检索命中与实际使用
- [x] 面板任务行显示预检命中数与引用数，暴露“命中但未引用”的断点
- [x] 候选创建（`memory_propose`）与提交审批（`memory_commit`）
- [x] 面板人工审核（V0.3.0）：「待审批」可直接批准/拒绝；批准走 `service.approveProposal`（账本 `approvalRef: panel:human`），拒绝归档为 rejected 并记 `proposal.rejected`；`policy.panel.review: false` 可关闭并恢复只读
- [x] 面板批量审核（V0.4.0）：勾选/全选后批量批准或拒绝；端点 `POST /api/pending` 接受 `ids[]`（最多 50 条），返回逐条 `results` 与 `approved/failed`，部分失败不阻塞其他条目
- [x] 审核端点防护：只接受回环地址、`x-dmh-review: 1` 头、同源 Origin；只作用于已有 `pending/` 候选，不提供改正文/删除知识端点
- [x] 工作区定时蒸馏（V0.5.0）：`core_workspaces[]` / `workspaces[]` 可选 `distill { enabled, time, target, session_id, agent_preset, max_proposals }`；面板「配置」页逐工作区配置
- [x] 定时蒸馏由 Host `schedule` 服务执行：`target: new` 每次新建会话（`cwd` = 工作区 root），`target: session` 投递到指定会话；任务标题 `memory-hub:distill:<hub-id>:<kind>:<id>`
- [x] 幂等对齐：插件启动、配置热更新、`schedule` 延迟挂载时创建/更新/删除任务；单条失败回填诊断，不影响其他工作区
- [x] 蒸馏提示词只读 L1、`memory_propose` 到 `project:<父核心>`（顶端用 `memory_consolidate` 到 global）、`memory_close_task`；禁止 `memory_commit`
- [x] 定时蒸馏配置校验：启用必须有 root；`target: session` 必须有 `session_id`；`max_proposals` 1..20
- [x] 设计决策：[ADR-0007](../01-architecture/decisions/ADR-0007-scheduled-distillation.md)；操作与排障：[distillation-schedule](../06-operations/distillation-schedule.md)
- [x] 宿主兼容冒烟（V0.4.0）：Web 模式 DSH `0.2.2-rc.1` 安装 0.4.0 后启动通过，`/api/overview` 200、`clientModules` 广告 true、批量审核端点返回 403/409 预期；`engines.dsh` 门禁因宿主用 `includePrerelease` 校验而放行（见 [COMPATIBILITY](../COMPATIBILITY.md)）
- [x] 任务关闭评估（`memory_close_task`）：`proposed` / `no_new_knowledge` / `needs_evidence` / `deferred`
- [x] 手动汇总（`memory_consolidate`）：项目知识晋升为 global 候选
- [x] 夜间维护（`memory_maintenance`）：确定性巡检，报告写 `<hub>/reports/<timestamp>.md` + `latest.md`
- [x] 维护候选：精确重复（标题 + 摘要 + 正文哈希）生成 deprecate pending；带 `core` / `shared` / `reusable` / `promote` 标签的子工作区知识生成核心晋升 pending
- [x] 维护只读保护：不 commit、不删除、不改写正文；同一指纹已有 pending 时跳过；每个 core 单次最多 10 条候选（可配 1..20）
- [x] 维护扫描所有 core，单个 core 失败不阻塞其他 core；报告包含近似重复、过期 pending、长期未引用、加载诊断、超长正文、作用域异常
- [x] 多 core 维护为**串行**：一个全局定时器，按 `core_workspaces[]` 顺序执行，fallback 最后；每个 core 独立报告与 pending
- [x] Host 夜间定时器：`policy.maintenance.enabled` + `time`（默认 03:00）；每 60 秒检查，当天只跑一次；错过时间在下一次 Host 启动后补跑
- [x] 维护状态记录：`<configHub-root>/records/maintenance-state.json`，避免同一天重复执行；工具输出包含逐个 core 的统计与错误
- [x] 维护不使用 DSH `schedule`，不出现在官方「自动化任务」栏；控制入口为 `config.yaml`
- [x] 已记录本轮决策与取舍：[decision-log](decision-log.md)；架构细节：[maintenance](../01-architecture/maintenance.md)；操作手册：[06-operations/maintenance.md](../06-operations/maintenance.md)
- [x] ADR：`ADR-0004` 系统级 memory skill、`ADR-0005` 夜间维护只生成 pending
- [x] 作用域系统：`global` / `domain:<id>` / `project:<workspace-id>`
- [x] 核心/子工作区模型：`core_workspaces` 与 `workspaces[].core_id`
- [x] 多核心仓（multi-hub）：每个 `core_workspace.root` 作为独立数据仓库，按工作目录最长前缀路由
- [x] 子工作区可感知主工作区：同一核心仓下的子工作区可见 `project:<core-id>` 作用域知识
- [x] 子工作区根目录参与路由：子工作区即使不在核心仓根目录下，也能路由到所属核心仓
- [x] 双角色工作区（V0.1.7）：同一个 `id` 可同时出现在 `core_workspaces` 与 `workspaces`；会话路由到自己的核心 Hub，父核心 Hub 挂为二级检索来源；等长前缀平局时自己的核心优先，不再依赖配置顺序
- [x] 金字塔记忆（多层上级链）：沿 `workspaces[].core_id` 逐层推导父、祖父、…（近→远，最多 8 层，带环检测，成环截断告警）；`memory_status` 报告 `parentCoreIds` / `ancestors` 完整链
- [x] 分级蒸馏（L1/L2/L3+）：L1 `scope:"core"` / `project:<self>` 写自己的 Hub；L2 `scope:"parent"` 写父核心 Hub 的 `pending/`；L3+ 显式 `project:<任意祖先核心>` 逐层上推；commit 落到对应层 Hub 的账本
- [x] 跨 Hub 检索（金字塔回退）：`memory_search` / 预检以当前工作区为主，本层有 ≥1 个合格命中即返回、不再上溯；本层无命中才按 近→远 回退到上一层 `project:<祖先>`，命中带 `core` 标注；`memory_get` / `memory_cite` 默认同样按 近→远 回退读取，`memory_get` / `memory_cite` / `memory_commit` 支持可选 `core` 参数
- [x] 双角色安全约束：`core_id` 不得指向自身（配置保存时拒绝）；同 ID 跨 Hub 冲突默认取自己的 Hub
- [x] L2 别名：`memory_propose` 支持 `scope: "parent"`（等价于 `project:<父核心>`），结果回报 `core` 与 `scope` 便于 commit 显式指定
- [x] 配置热更新重接线：watcher 触发 `reloadConfig` 后执行 `reconfigureCores()`，按最新配置增删 core、刷新工作区清单、重新接线金字塔祖先链并同步最新 config 对象；新增核心 / 开启双角色无需重启
- [x] 配置页增删：面板「配置」页可添加核心/子工作区，并可删除子工作区（整表替换保存）与核心工作区（引用它的子工作区先解绑为未分配）；后端校验拒绝“引用未知核心 / 自引用”，删除有确认提示
- [x] 面板知识列表对上级核心条目显示「父核心蒸馏」标签；详情打开携带 `core` 查询参数
- [x] 测试模式 `policy.approval.mode: auto`：跳过 DSH 审批，账本 `approvalRef` 记为 `test:auto`（默认仍为 `manual`）
- [x] 核心共享：`memory_propose` 支持 `scope: "core"` 别名，子工作区可把可复用知识回填到 `project:<core-id>`
- [x] `dsh-plugin-dev` 核心工作区已写入 9 条插件开发基线（入口、工具、客户端、开发循环、常见坑、回填检查清单、npm 发布踩坑、发布 checklist、预检采用率诊断）
- [x] 发布经验已回填核心：`KNO-000002`（npm 发布/Trusted Publisher/市场索引踩坑）、`PRC-000003`（发布 checklist）
- [x] 预检采用率经验已回填核心：`KNO-000003`（预检运行≠被使用，先修相关性/指令/可见性，再考虑行为门禁）
- [x] 本仓本地决策：`DEC-000002`（min_score=1.0、local_boost=1.2）
- [x] 系统级 skill 经验已回填核心：`API-000004`（`ctx.skills.register` 与按需加载）；本仓决定：`DEC-000003`（采用 `memory-hub` skill）
- [x] 面板知识列表对 `project:<core-id>` 显示「核心共享」标签
- [x] Web 面板六个标签页：总览 / 配置 / 知识 / 待审批 / 活动与策略 / 能力
- [x] 面板除「待审批」人工审核外只读；配置与审核走回环 HTTP 路由（`/dsh-memory-hub/api/*`）
- [x] 77 个 vitest 测试（11 个文件）
- [x] npm 发布：`dsh-memory-hub@0.1.5`（2026-11-01，`latest`）
- [x] GitHub release `v0.1.5`，仓库 homepage 指向 npm 包页
- [x] npm `0.1.5` 发布后已校验 `gitHead` 与 provenance
- [x] GitHub Actions 自动发布：`.github/workflows/release.yml`（tag 触发，Windows 构建/测试，Trusted Publisher/OIDC 发布 npm，自动创建 Release 并上传 tarball）
- [x] Trusted Publisher 端到端验证：`v0.1.3` / `v0.1.5` 由 GitHub Actions 无 token 发布，npm 记录 SLSA provenance
- [x] Release workflow 已实测通过（tag push + `v0.1.5`）；无需 `NPM_TOKEN`
- [x] 发布说明：`docs/06-operations/release.md`
- [x] 插件市场索引：`site/index.json`，可通过 jsDelivr 作为 DSH 自定义市场源
- [x] `PLUGIN_VERSION` 直接读取 `package.json`，构建 banner 同步版本，避免发布时版本漂移
- [x] TypeScript + esbuild 构建，产出 `dist/index.js`
- [x] 宿主兼容性验证记录（`docs/COMPATIBILITY.md`）
- [x] 写锁按 hub 根独立：只有配置根/该 core 根自己的锁占用才让它只读，不跨根级联；显式 `readOnly: true` 仍是全局只读（[ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md)）
- [x] 残留锁回收：`host` 不同（跨机拷贝/漫游目录）即视为失效；本机进程不存在且心跳超过 `lock_stale_ms` 才回收，活进程的锁不抢占
- [x] 配置可写性与写锁解耦：`configWritable` 只受显式 `readOnly: true` 影响；锁被占用或 `config.yaml` 损坏时，面板「配置」页仍可保存并触发 `reloadConfig` 恢复写权限
- [x] 新增项目文档体系（`docs/` 目录层级 + `AGENTS.md`）

## 当前约束

- Markdown / YAML / JSONL 是唯一权威数据格式。
- 默认不使用向量数据库。
- `memory_commit` 在会话内必须经过 DSH 原生人工审批；面板「待审批」由人点击批准/拒绝，账本记为 `panel:human`；模型不可自批。
- Web 面板路由只允许回环请求；除人工审核（单条/批量）外不提供写入端点。
- 每根一把写锁：第二个写者只让该根降级为只读，不跨根级联；显式 `readOnly: true` 才是全局只读。
- Windows 原生路径语义。

## 已知限制

- DSH 原生审批提示的**真实点击通过**路径未验证；本机审批提示关闭。测试模式 `auto` 已验证自动提交与 `test:auto` 账本记录。
- 面板审核已在假 Host 的 HTTP 路由上验证（头/Origin/批准/拒绝/账本）；桌面端真实点击路径尚未人工确认。
- 回环 HTTP 无法从技术上区分“人点击”和“本机脚本调用”；面板审核适合单人本机使用，不要在本机运行不可信脚本时把它当作唯一防线。
- jsDelivr 的 `@main` 分支缓存可能长时间滞后：本次 `site/index.json` 更新后，`@main` 仍返回 0.2.0（多次 purge 未刷新），而 commit-pinned URL（`@8a2dabe`）已返回 0.3.0；市场索引最长约 12h 后才会自动刷新。
- 门禁的宿主级拒绝未在真实会话中强制触发，由单元测试覆盖。
- PTC `run_code` 嵌套调用未验证。
- 外部 CLI / 多进程共享 Hub：Web 0.2.2-rc.1 实测第二个进程按写锁降级为只读（`readOnlyReason: lock`），符合设计；跨机锁回收与多进程写路径仍由单元测试覆盖。
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
- 多 core 维护串行执行，总耗时是各 core 之和；一个慢 core 会拖慢后续 core。
- 一个 core 失败只记 warning、不阻塞其他 core，但当天不会单独重试；状态在整轮结束后统一写入。
- 维护只有全局 `maintenance-state.json`，没有 per-core 状态；没有全局合并报告。
- `all_cores: false` 的定时器当前只跑 fallback；手动工具则是“只跑当前 pack”，语义不一致，暂未修改。
- 官方「自动化任务」栏不可见；如需暂停/编辑/立即运行，需要改用 DSH `schedule`，代价是会话和模型回合。
- 当前 Hub：13 条 accepted、1 条 pending（`PRO-000016`，本次设计决策候选）。
- `approval.mode` 仍为测试遗留的 `auto`；维护本身不 commit，但若要求严格人工审批应改回 `manual`。
- 金字塔上级链最多 **8 层**（含父/祖父/…）；超过上限的更深层配置不会参与检索与蒸馏，配置环（A→B→A）在运行时截断并告警，不中断会话。
- 两个 Hub 的 ID 序列相互独立；同 ID 冲突时默认取自己的 Hub，上级副本需用 `core` 参数显式访问（面板详情同样带 `core` 查询参数）。
- 上级核心 Hub 的夜间维护不会把子会话的 L2/L3+ 候选自动晋升；逐层蒸馏仍靠 `memory_propose(scope)` + 人工 `memory_commit`。

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
│   ├── 00-project/decision-log.md
│   ├── 01-architecture/maintenance.md
│   ├── 01-architecture/decisions/ADR-0004-system-level-memory-skill.md
│   ├── 01-architecture/decisions/ADR-0005-nightly-maintenance.md
│   ├── 06-operations/maintenance.md
│   └── ...（本目录体系）
├── site/
│   ├── index.json
│   └── icons/
└── dist/
```

## 决策与追踪入口

- [decision-log.md](decision-log.md) — 2026-11-01 的全部决策、改动、验证与已知限制。
- [ADR-0004](../01-architecture/decisions/ADR-0004-system-level-memory-skill.md) — 系统级 `memory-hub` skill 的注册与命名。
- [ADR-0005](../01-architecture/decisions/ADR-0005-nightly-maintenance.md) — 夜间维护采用内部定时器、只生成 pending、多 core 串行。
- [maintenance.md](../01-architecture/maintenance.md) — 夜间维护的组件、顺序、状态、失败与配置语义。
- [maintenance.md](../06-operations/maintenance.md) — 开启/关闭、每日检查、排障与回滚。
- [proposal-maintenance.md](../03-openspec/proposal-maintenance.md) — 已实现的 OpenSpec 提案。
- [COMPATIBILITY.md](../COMPATIBILITY.md) — 宿主冒烟与未验证项。

## 下一步推荐工作

1. 在真实会话中验证审批**通过**路径。
2. 增加面板交互与视觉验收测试。
3. 压测 5k+ 条知识索引与检索性能。
4. 观察 `min_score` / `local_boost` 上线后的预检命中与引用比例；若模型仍不读，再评估“高分命中未 `memory_get` 时拦截首次变更工具”的行为门禁。
5. 观察 `memory-hub` skill 是否被模型主动加载；若 catalog 可见但加载率低，再考虑在预检包尾加入一行 skill 提示，而不是自动注入全文。
6. 给每个子工作区补一条本地 `project:<id>` 基线知识，验证 local-first 排序。
7. 观察夜间维护：第二天检查每个 core 的 `reports/latest.md` 与 `pending/`，确认候选质量；若长期没有候选，再评估是否放宽“精确重复”或增加显式复用标签。
8. 跟踪公共目录 PR [#11187](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11187)：等待构建检查与 1 天仓库年龄门槛通过；合并后确认 `dsh-plugin-catalog` 索引收录。机制见 [catalog-submission.md](../06-operations/catalog-submission.md)。
8. 若需要官方「自动化任务」栏可见/可暂停，另行评估 DSH `schedule` 方案，并记录与内部定时器的取舍。
9. 评估 `all_cores: false` 的定时器语义，必要时改为 `core_ids` 选择，而不是 fallback-only。
10. 评估 per-core 失败重试与全局合并报告；当前保持串行和单一状态。
11. 验证 PTC `run_code` 嵌套调用与门禁边界。
12. 补充外部 CLI / 多进程共享 Hub 测试。
13. 评估索引落盘与增量重建（V0.2 方向）。
