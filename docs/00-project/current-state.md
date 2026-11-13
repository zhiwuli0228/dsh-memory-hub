# Current State

本文件是项目连续性快照。**每次完成改动后都要更新**。

## 当前阶段

V0.7.1 已发布：**写锁租约 + fencing，只读状态可自愈**——修复两个会被用户感知为“插件坏了”的问题：(1) 挂死/冻结的写者（进程还在、线程已死）会让某个 hub 根**永久只读**；(2) 只读状态是 Hub 打开时的**一次性缓存**，pid 已消失、锁文件已删除后 `memory_status` 与面板仍显示只读，只能重启。现在写锁是租约（心跳 15s、租约 `lock_stale_ms`）：pid 确定不存在（`ESRCH`）立即回收、探不到死活（Windows 常见 `EPERM`）约 60 秒回收、心跳超租约自动回收，旧写者按 `token` 降级为只读；`Hub.revalidateLock()` 在 `memory_status`、面板 `/api/overview`/`/api/config` 与 60 秒巡检中重新推导只读状态，面板自身每 30 秒轮询只读切片。**不再需要手动删除 `.writer.lock`。** 详见 [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)。

V0.7.0 已发布：**时效、去重合并、回顾萃取与可读目录**——`valid_from` / `expires_at` / `last_verified` 与确定性降权、`memory_duplicates` + `merge`、`memory_reflect`（`digest` 与原文 `search`）、引用驱动的 aging、写入风险标记、派生 SQLite 索引，以及每个 Hub 根目录自动生成的 `README.md`（逐条说明文件夹职责、`assets` 含义与写入路径）。npm 包 `dsh-memory-hub@0.7.0` 与 GitHub Release `v0.7.0` 已发布（run `42492469612`，publishTimestamp `1794150080`，SLSA provenance 已验证）。

V0.6.0 已发布：**每个工作区的定时蒸馏**——面板「配置」页可为核心/子工作区启用每日蒸馏，指定时间、投递目标（新建会话或指定会话）与候选上限；插件把配置对齐为 Host `schedule` 任务，到点在对应工作区开始蒸馏。投递到已有会话时，面板从 Host `sessionController` 读取本机会话列表做候选（可下拉选择，也可手填），不再要求用户自己去找会话 ID。蒸馏只创建上级（或 global）候选，仍需人工在「待审批」批准。V0.4.0 的面板批量审核、`panel:human` 账本与回环安全校验保持不变。

在真实 Host（0.2.2-rc.1，隔离 profile）上验证时修掉两个只有实机才暴露的问题：Host 的 `daily.time` 必须是 `HH:mm:ss`（v0.5.1 内部把 `HH:mm` 规范化后注册）；`session-controller` 可能晚于 `schedule` 就绪，首次注册会被拒（v0.5.2 对可自愈错误做 5 次退避重试，并在 `config()` 中返回 `distill`，面板保存后不会显示成未配置）。v0.5.3 把蒸馏设置从“每个工作区一张卡 + 换行内联表单”改成整宽对齐表（工作区/启用/时间/目标/会话/上限/状态），带逐行状态与底部汇总、错误列表，窄屏自动堆叠。v0.6.0 新增只读的 `/dsh-memory-hub/api/sessions`：只返回 id、cwd、标题、更新时间与空会话标记，排除委派会话，服务缺失或超时则返回 `unavailable` 让面板退回手填。

当前工作树为 **V0.7.1（已发布）**：在 V0.7.0 之上把写锁改为租约 + fencing，并让只读状态可重新推导。升级免卸载方案见 [docs/06-operations/upgrade-guide.md](../06-operations/upgrade-guide.md)。

**V0.7.1 写锁改动（2026-11-13）**：写锁从“永久所有权标记”改为**租约 + fencing token**（[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)）。挂死/冻结的 DSH 进程不再让该根永久只读：pid 确定不存在（`ESRCH`）立即回收、探不到死活（Windows 常见 `EPERM`）约 60 秒回收、心跳超 `storage.lock_stale_ms` 自动回收，旧写者按 `token` 降级为只读；被降级的根在对方退出后由下一次读取/写入自动恢复，不必重启插件或手删 `.writer.lock`。同时修掉**内存缓存**问题：`readOnly` 之前是打开时的一次性判断，锁文件消失/被回收后进程内仍报只读；现在 `Hub.revalidateLock()` 在 `memory_status`、面板（`/api/overview`、`/api/config`）与 60s 巡检里重新观测锁文件并修正标志，面板自身每 30s 轮询只读切片。锁文件升到 `v: 2`（新增 `token`），v1 锁仍可读；Hub 根 `README.md` 模板升到 `hub-readme 3`（新增 `.writer.lock` 说明）。**从 0.7.0 升级时先停旧进程**（0.7.0 的写入口没有 fencing 复核）。

V0.7 的三项 P0 提案（时效字段 → 去重合并 → 回顾式萃取）**均已完成实现、测试并随 `v0.7.0` 发布**：时效字段（`valid_from` / `expires_at` / `last_verified`、派生 `fresh/aging/stale/scheduled`、确定性降权、预检时效门、面板标签）；去重合并（只读 `memory_duplicates`、`operation: "merge"` + `merged_ids`、`superseded_by` 反向指针、`knowledge.merged` 账本、面板 diff）；回顾式萃取（`memory_reflect` digest、按工作区定时回顾、`records/reflect-state.json` 去重水位）。`format` 仍为 1，老文件零迁移。

## 已实现

- [x] Cordis 插件入口 `src/index.ts`（`apply` / `inject`）
- [x] 10 个模型工具注册与 schema（`memory_search`, `memory_get`, `memory_status`, `memory_preflight`, `memory_cite`, `memory_propose`, `memory_commit`, `memory_close_task`, `memory_consolidate`, `memory_maintenance`）
- [x] 12 个模型工具注册与 schema（在 10 个基础工具上新增 `memory_duplicates`、`memory_reflect`）
- [x] 本地优先存储：Markdown + YAML + JSONL，无强制数据库
- [x] CJK unigram/bigram 分词 + 内存倒排索引 + BM25-lite 检索
- [x] 每个用户回合第一步自动预检；幂等键 `(sessionId, turn)`
- [x] 预检相关性门控：`policy.preflight.min_score` 过滤弱命中，全部低于阈值时记 `no_match`
- [x] 本地优先排序：`policy.preflight.local_boost` 提升当前工作区 `project:<id>` 知识
- [x] 紧凑上下文注入（`memory:pack`），只含 ID、标题、摘要、作用域
- [x] 按需读取：`memory_get` 默认摘要（结论 + 小节目录，700 字符封顶），`section` 读单节（2000 字符封顶），`full: true` 读全文；`memory_search` 支持 `detail: "ids"` 紧凑扫描
- [x] 指令式包尾：先 `memory_get`、使用后 `memory_cite`、结束前 `memory_close_task`，并提示加载 `memory-hub` skill
- [x] 系统级 `memory-hub` skill：由插件注册到 Host 全局 skills 层，模型/用户可按需加载；覆盖检索、作用域、写入审批、回写评估、核心回填与反模式
- [x] 批量萃取工作流（skill 内）：批次清单 `batch.yaml`、10–20 文件/2 万字一个 chunk、一条知识一个判断、`tags: batch:<id>`、状态机 `draft → extracted → reviewed → distilled → archived`；模板见 `docs/07-templates/batch-extraction.md`
- [x] 官方 skill 命名审计：当前 catalog 无 `memory-hub` / 旧名 `memory-management`；采用产品自有名避免 runtime 静默遮蔽 bundled；测试锁定官方名称快照
- [x] Skill 注册降级：宿主没有 `skills` 服务时只记录 warning，不影响 10 个记忆工具
- [x] 引用记录（`memory_cite`）区分检索命中与实际使用
- [x] 面板任务行显示预检命中数与引用数，暴露“命中但未引用”的断点
- [x] 候选创建（`memory_propose`）与提交审批（`memory_commit`）
- [x] 面板人工审核（V0.3.0）：「待审批」可直接批准/拒绝；批准走 `service.approveProposal`（账本 `approvalRef: panel:human`），拒绝归档为 rejected 并记 `proposal.rejected`；`policy.panel.review: false` 可关闭并恢复只读
- [x] 面板批量审核（V0.4.0）：勾选/全选后批量批准或拒绝；端点 `POST /api/pending` 接受 `ids[]`（最多 50 条），返回逐条 `results` 与 `approved/failed`，部分失败不阻塞其他条目
- [x] 面板批量萃取视图（V0.7.0）：待审批按 `tags:batch:<id>` 聚合筛选（只读，不新增写端点）；列表只返回最近 200 条（`PANEL_PENDING_LIMIT`），`pendingTotal` / `pendingBatches` 仍为全量计数，顶部提示“只显示最近 N 条，共 M 条”
- [x] 候选积压启动保护（V0.7.0）：`pending/` 只预解析最新 `PENDING_EAGER_LIMIT=200` 条，其余按 id 惰性解析；3k 候选启动 3.56s → 0.33s、10k 0.35s（`scripts/bench-pending.ts`）；`counts().pending` 与序号仍完整
- [x] 审核端点防护：只接受回环地址、`x-dmh-review: 1` 头、同源 Origin；只作用于已有 `pending/` 候选，不提供改正文/删除知识端点
- [x] 工作区定时蒸馏（V0.5.0）：`core_workspaces[]` / `workspaces[]` 可选 `distill { enabled, time, target, session_id, agent_preset, max_proposals }`；面板「配置」页逐工作区配置
- [x] 定时蒸馏由 Host `schedule` 服务执行：`target: new` 每次新建会话（`cwd` = 工作区 root），`target: session` 投递到指定会话；任务标题 `memory-hub:distill:<hub-id>:<kind>:<id>`
- [x] 幂等对齐：插件启动、配置热更新、`schedule` 延迟挂载时创建/更新/删除任务；单条失败回填诊断，不影响其他工作区
- [x] 真实 Host 兼容修复（V0.5.1/V0.5.2）：Host `daily.time` 要求 `HH:mm:ss`（内部把配置的 `HH:mm` 规范化）；`session-controller` 晚于 `schedule` 就绪时首次注册失败，改为 5 次退避重试；`/api/config` 返回 `distill`，面板保存后不回退成“未配置”
- [x] 实机验证：隔离 profile 安装 0.5.2 冷启动，首次注册被拒后自动重试成功（`action: created`），重启后 `kept` 且 `taskId` 不变，失败条目不误删旧任务；移除配置后任务被删除
- [x] 蒸馏提示词只读 L1、`memory_propose` 到 `project:<父核心>`（顶端用 `memory_consolidate` 到 global）、`memory_close_task`；禁止 `memory_commit`
- [x] 定时蒸馏配置校验：启用必须有 root；`target: session` 必须有 `session_id`；`max_proposals` 1..20
- [x] 定时蒸馏面板（V0.5.3）：整宽对齐表（工作区/启用/时间/投递目标/会话/上限/状态），逐行状态标签（已注册/待注册/失败/未启用），底部汇总“已启用数 + 未保存 + 失败数”与主按钮，注册错误单独成块；≤760px 自动堆叠为带标签的两列
- [x] 会话候选（V0.6.0）：`/api/sessions` 只读回环端点 + 会话列 datalist；Host 缺失 `sessionController` 或 4s 超时则显示不可用并允许手填
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
- [x] 时效字段（V0.7.0，按 [proposal-temporal-fields](../03-openspec/proposal-temporal-fields.md)）：`valid_from` / `expires_at` / `last_verified` 可选、带时区校验、`valid_from ≤ expires_at` 与「`last_verified` 不得在 5 分钟后」两道校验；派生状态 `fresh/aging/stale/scheduled` 只读不落盘
- [x] 时效降权：`policy.temporal.aging_days`（默认 90）、`aging_decay` 0.85、`stale_decay` 0.6、`scheduled_decay` 0.3；老文件用 `updated_at` 回退，`aging_decay: 1.0` 可完全关闭
- [x] 预检时效门：`scheduled` 不注入上下文（`memory_search` 仍可查到并带 `temporal`），`stale` / `aging` 注入并标「已过期，需复核」/「长期未确认」；`memory_get` 元数据带 `temporal` 与 `temporalNote`
- [x] 时效维护视图：报告 Summary 增加 `temporal` 计数，Issues 增加 `expired`（warn）与 `aging`（info，只报告不写候选）；面板知识行/详情/待审批卡显示时效标签与三个时间
- [x] 去重与合并（V0.7.0，按 [proposal-dedupe-merge](../03-openspec/proposal-dedupe-merge.md)）：`src/duplicates.ts` 组合相似度（0.6 × 标题/摘要词元 Jaccard + 0.4 × 正文 3-gram，正文只取 4KB），只在同类型同作用域内比较；keeper 顺序 `version` → `updatedAt` → `sourceRefs` → `id`
- [x] 只读工具 `memory_duplicates`（`scope?` / `threshold?` / `limit?`，阈值默认 `policy.dedupe.threshold` 0.72，返回 keeper/similarity/高置信标记）；维护报告的 `duplicate-near` 复用同一实现并展示 keeper
- [x] `operation: "merge"` 提案：`merged_ids`（1..10，同类型同作用域、不含 target、不重复、未合并过）；提交 target +1 并合并正文与 `related`/`source_refs`，被合并项 `superseded` + `superseded_by`，各自写 `history/`，账本 `knowledge.merged`
- [x] 面板 merge 卡片：显示被合并条目与 target 旧正文 → 合并稿的行级 diff（上限 200 行，超出提示截断），仍只读、批准走既有审核端点
- [x] 设计决策：[ADR-0008](../01-architecture/decisions/ADR-0008-merge-operation.md)（独立 merge 操作）、[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)（写锁租约 + fencing token）
- [x] 回顾式萃取（V0.7.0，按 [proposal-retrospective-extraction](../03-openspec/proposal-retrospective-extraction.md)）：`src/reflect.ts` 的 `SessionDigestSource` / `HostSessionDigestSource` / `NullSessionDigestSource`、最长前缀会话归属 `ownerWorkspaceOf`、digest 只保留用户消息 + 每轮助手最终文本 + 失败工具（`policy.reflect.max_chars` 默认 8000，头 60% + 尾 40% 截断）
- [x] `memory_reflect`（`session_id?` / `limit?` / `dry_run?`）：只读本工作区名下已结束的主会话（排除委派会话与 root 外会话），返回 digest 与 `seqRange`；`min_messages` 不足 `too-short`，digest 未变 `already-reflected`；`dry_run` 不写水位与账本
- [x] 回顾水位：`records/reflect-state.json`（`sessionId` / `workspaceId` / `reflectedAt` / `digestHash`，上限 200 条），账本追加 `reflect.read`；无宿主 `sessionQuery` 时返回 `available: false` 并跳过定时任务
- [x] 按工作区定时回顾：`reflect:`（`enabled` 默认 false / `time` 04:30 / `target` / `max_candidates` / `lookback_days`）与 `policy.reflect.*`（`max_chars` / `max_sessions` / `min_messages`）；标题 `memory-hub:reflect:<hub>:core|workspace:<id>`，与蒸馏共用 `reconcileScheduleEntries`，启动/热更新/保存后对齐并沿用瞬时错误重试
- [x] 面板「能力」页补充 `memory_duplicates` 与 `memory_reflect` 说明（中英双语）；操作文档 [reflection.md](../06-operations/reflection.md)
- [x] 派生 SQLite 索引（V0.7.0，按 [proposal-derived-index](../03-openspec/proposal-derived-index.md)）：`storage.index: auto|memory|sqlite`（默认 `auto`，阈值 `sqlite_min_entries` 30k）、`index_candidate_limit`（默认 2000）、`records/index.sqlite`（contentless FTS5 倒排 + `terms` df + 文档元数据）、`entry_count + 知识目录 mtime` 指纹校验、损坏或缺少 `node:sqlite` 时回退内存并记诊断
- [x] 检索打分抽成 `SearchIndex` 与 `rankScored` / `bm25Term` / `passesFilters` / `searchSetup`：内存索引与 SQLite 索引共用同一份公式；命中数 ≤ 候选上限时两者逐位一致
- [x] `/api/overview` 与 `memory_status` 暴露 `index.backend` / `index.rebuilt`；`store.closeIndex()` 释放句柄（Windows 文件锁）
- [x] P0 原文取证（V0.7.0，按 [proposal-evidence-lifecycle-risk](../03-openspec/proposal-evidence-lifecycle-risk.md)）：`memory_reflect` 增加 `mode: "search"`，经宿主 `sessionQuery.searchEvents` 返回 `seq/type/time/snippet`；只读、不写水位与账本；缺省扫最近 3 个本工作区会话，`limit` 1..50
- [x] P0 引用生命周期：维护报告与 aging 参考最近一次 `memory_cite`（`knowledgeId → lastCitedAt`），`uncited` 区分「从未引用 / 最近引用 N 天前」，totals 增加 `cited`；`/api/overview` 知识行带 `lastCitedAt`；归档仍需人批准的 deprecate 候选
- [x] P0 写入风险标记：`src/risk.ts` 扫描注入短语、凭据形态、零宽/方向控制符、角色伪造；`memory_propose` 返回 `risk`、账本记 `riskLevel/riskSignals`、面板候选卡片显示「需确认」；**只标记，不阻断、不改写**
- [x] Hub 目录说明书（V0.7.0）：`Hub.open` 在可写 Hub 根目录自动生成 `README.md`（`src/hub-readme.ts`，标记 `hub-readme <version>`）；内含目录地图（每个文件夹/文件谁写、能否手改、删了会怎样）、九类知识表与 **`assets` = 外部资源索引（不是代码资产/构建产物）** 的澄清、作用域金字塔、唯一写入路径、工具速查、派生数据与常见误用；同版本不覆盖用户编辑，无标记的手写 README 不会被改写，只读 Hub 不写
- [x] 初始化不再新建遗留 `index/` 空目录（老 Hub 里已有的仍可手动删除）
- [x] 根 `README.md` 增加「5 分钟初始化工作区」：配置 Hub / 数据 Hub 的区别、最小 `core_workspaces[].root` + `workspaces[]` 配置、验证三件事、初始化后目录速览；修正示例里核心工作区缺 `root` 的问题
- [x] `memory-hub` skill 增加「Hub 目录与初始化（先读目录说明书）」：目录表、`assets` 含义、最小配置、初始化后用 `memory_status` 验证；回顾式萃取补充 `mode: "search"` 原文取证
- [x] 165 个 vitest 测试（20 个文件）
- [x] 升级/收编文档对齐 0.6.0：[upgrade-guide.md](../06-operations/upgrade-guide.md) 覆盖 link/CLI/市场迁移三条免卸载路径，并新增「老版本收编兼容矩阵」（format 闸门、账本容错、时效默认、序列回填、索引自动）与收编清单
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
- [x] 写锁改为**租约 + fencing token**（[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)）：心跳 15s、租约 `lock_stale_ms`；pid 确定不存在（`ESRCH`）立即回收，探不到死活（Windows 常见 `EPERM`）约 60s 回收，心跳超租约（挂死/假死/PID 复用）回收，跨机锁立即回收；回收走 `rename` 复核的 CAS
- [x] 写锁自愈：`Hub.ensureWritable()` 在每次写入口复核 token 并在对方退出后自动重抢；被抢的旧写者降级为只读（`lost the lease`），不再永久卡死、不必手动删 `.writer.lock`；正常退出主动释放锁
- [x] 写锁缓存可失效：`Hub.revalidateLock()` 同步重读锁文件，在 `memory_status` / 面板（`/api/overview`、`/api/config`）与每 60s 运行时巡检里修正内存中的 `readOnly`——锁文件被释放/删除、pid 消失、心跳过期后不再继续报只读；锁文件“消失”只丢句柄（根空闲），只有 `token` 变成别人的才降级；面板每 30s 轮询只读切片
- [x] `memory_status` / `/api/overview` 增加 `lock: { held, owner, expiresAt, reclaimed, onDisk }` 诊断
- [x] 配置可写性与写锁解耦：`configWritable` 只受显式 `readOnly: true` 影响；锁被占用或 `config.yaml` 损坏时，面板「配置」页仍可保存并触发 `reloadConfig` 恢复写权限
- [x] 新增项目文档体系（`docs/` 目录层级 + `AGENTS.md`）

## 当前约束

- Markdown / YAML / JSONL 是唯一权威数据格式。
- 默认不使用向量数据库。
- `memory_commit` 在会话内必须经过 DSH 原生人工审批；面板「待审批」由人点击批准/拒绝，账本记为 `panel:human`；模型不可自批。
- Web 面板路由只允许回环请求；除人工审核（单条/批量）外不提供写入端点。
- 每根一把写锁（租约 + fencing token）：第二个写者只让该根降级为只读，不跨根级联；显式 `readOnly: true` 才是全局只读。租约到期或对方退出后，被降级的根自动恢复可写。
- Windows 原生路径语义。

## 已知限制

- DSH 原生审批提示的**真实点击通过**路径未验证；本机审批提示关闭。测试模式 `auto` 已验证自动提交与 `test:auto` 账本记录。
- 面板审核已在假 Host 的 HTTP 路由上验证（头/Origin/批准/拒绝/账本）；桌面端真实点击路径尚未人工确认。
- 近重复检测**不再跨作用域提示**（以前只按类型过滤，core 与 project 各一份同名条目也会出现在维护报告里）；现在只在同类型同作用域内比较，跨作用域应走蒸馏/晋升。这是有意的行为变化，不是检测退化。
- merge 首版不做 supersede 链传递：A 合并 B、C 后，B 以前 `supersedes` 的 D 仍需人工判断是否有效。
- 回顾式萃取的 digest 依赖宿主 `sessionQuery` 的事件形状（`user/message`、`assistant/message`、`tool/result`）：单元测试用假 source 覆盖，尚未在真实 Desktop Host 上核对真实 JSONL 的 `data` 结构；形状不符时会退化为空 digest（`skipped: empty`）而不是报错。
- 定时回顾按工作区各一条任务，工作区多时任务数量线性增长；默认 `enabled: false`，需要显式开启。
- 回环 HTTP 无法从技术上区分“人点击”和“本机脚本调用”；面板审核适合单人本机使用，不要在本机运行不可信脚本时把它当作唯一防线。
- 候选惰性加载的边界：超过 200 条积压时，`pendingForTask` 的每任务上限、维护提案的 `maint-` 去重、面板批次计数只覆盖已加载的候选；`counts().pending` 与 id 序号仍完整。审批/打开某条旧候选时会自动补加载。
- jsDelivr 的 `@main` 分支缓存可能长时间滞后：本次 `site/index.json` 更新后，`@main` 仍返回 0.2.0（多次 purge 未刷新），而 commit-pinned URL（`@8a2dabe`）已返回 0.3.0；市场索引最长约 12h 后才会自动刷新。
- 门禁的宿主级拒绝未在真实会话中强制触发，由单元测试覆盖。
- PTC `run_code` 嵌套调用未验证。
- 外部 CLI / 多进程共享 Hub：Web 0.2.2-rc.1 实测第二个进程按写锁降级为只读（`readOnlyReason: lock`），符合设计；租约回收、fencing、多进程写路径仍由单元测试覆盖，未做真实多进程端到端压测。
- 升级写锁时不要混跑两个版本：v0.7.0（v1 锁）会刷新心跳、健康时不会被抢，但它的写入口没有 fencing 复核；卡死超过租约被新版本接管后，它恢复会在不复核的情况下继续写。升级时先停旧进程。
- Windows 上“已退出但探不到”的 pid：`process.kill(pid, 0)` 对某些已不存在的 pid 返回 `EPERM`（本机实测 pid 36156），无法证明它已退出，只能用心跳仲裁（`min(lock_stale_ms, 60s)` 宽限）。这类写者约 1 分钟恢复而不是立即恢复；要更快需要平台特定探针（`tasklist` 子进程 / `NtQueryInformationProcess`），代价大于收益。同一台机器上**另一个用户**运行的 DSH 也是这种“探不到”形态：只要它健康刷新心跳就不会被抢。
- 租约式写锁的残余窗口：旧写者被冻结在“已复核 token、但还没写完”之间时，租约被抢后它恢复运行可能再写一次。触发需要“冻结超过 `lock_stale_ms` 且恰好停在写操作中间”，当前靠写入口复核 token + 心跳不复活别人的锁 + `release` 只删自己的锁来收敛；若要彻底消除需引入每写一条的 fencing 序号校验（账本可扩展）。
- `records/ledger.jsonl` 的追加（`task.created` / `preflight.recorded` / `citation.added` / `task.closed`）**没有**经过写锁或 `ensureWritable()` 闸门，这是既有行为：降级为只读的根仍会记任务与引用事件。知识写入（`knowledge/`、`pending/`、`sequences.json`）才受写锁保护。若未来要求账本也单写者，需要在 `Ledger.append` 前加同样的 fencing 复核。
- 长会话上下文累积效果未做规模测量。
- 检索规模：合成语料已验证 1k–100k。内存索引 20k p50 ≈ 39ms / 堆 ≈ 210MB，100k ≈ 352ms / 堆 ≈ 1.1GB；派生 SQLite 索引 100k p50 ≈ 399ms、磁盘 ≈ 246MB，用磁盘换内存。真实语料上的分数分布、启动全量解析耗时仍未测；分档方案见 [scale-plan.md](../01-architecture/scale-plan.md)。
- 批量萃取未实现：候选仍只能逐条 `memory_propose`，`pending/` 上千条时的启动解析与面板列表未做规模保护。
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
- [memory-landscape-2026.md](../05-domain/memory-landscape-2026.md) — 2026-11 调研：ChatGPT/Claude/Qwen/OpenClaw 的记忆与萃取机制、开源记忆层、评测基准，以及由此重排的瓶颈与 P0/P1 路线。
- [hermes-memory-2026.md](../05-domain/hermes-memory-2026.md) — 2026-11 调研：Nous Research Hermes Agent 的三层记忆（有界常驻 / FTS5 档案 / 单活 provider）、写入上限与整理、后台复盘、借鉴优先级与「不该照抄」清单。
- [search-performance.md](../04-development/search-performance.md) — 2026-11 实测：1k/5k/20k/50k/100k 规模的检索延迟与内存、热路径优化（时间戳预解析、标题缓存、前 K 选择）、`min_score` 漂移与「要不要换 SQLite」的判定条件。
- [scale-plan.md](../01-architecture/scale-plan.md) — 多年业务积累的规模化预案：检索 / 入库 / 蒸馏三条成本线，按业务域分库、批量萃取流水线、分级审批与派生索引的分档路径。
- [compatibility.md](../01-architecture/compatibility.md) — 兼容性契约：未知字段保留、`format` 版本闸门、作用域由小到大、索引可替换、批量靠 tag，以及合并撞 ID / 新类型 / 早期 global 三个迁移坑。
- [batch-extraction.md](../07-templates/batch-extraction.md) — 批量萃取模板：`batch.yaml`、chunk 提示词骨架、进度表与收尾检查。
- [proposal-derived-index.md](../03-openspec/proposal-derived-index.md) — 派生 SQLite 索引（**已实现**，v0.7.0）：contentless FTS5 取候选 + 现有 JS 精排、启动指纹校验、无 `node:sqlite` 时回退内存。
- [proposal-temporal-fields.md](../03-openspec/proposal-temporal-fields.md) — P0 提案：时效字段与过期降权（Accepted，aging 90 天；**已实现，v0.7.0**）。
- [proposal-dedupe-merge.md](../03-openspec/proposal-dedupe-merge.md) — P0 提案：近重复检测与 `merge` 提交（Accepted，独立 merge 操作；**已实现，v0.7.0**）。
- [proposal-retrospective-extraction.md](../03-openspec/proposal-retrospective-extraction.md) — P0 提案：回顾式萃取（Accepted，定时任务 + 核心/子工作区各一条；**已实现，v0.7.0**）。
- [proposal-evidence-lifecycle-risk.md](../03-openspec/proposal-evidence-lifecycle-risk.md) — P0 三件套（**已实现**）：`memory_reflect` 原文取证、引用驱动生命周期、写入风险标记。
- [dsh-memory-hub-v0.7.md](../08-publish/dsh-memory-hub-v0.7.md) — 对外发表长文（v0.7.0）：能力全景、完整设计、11 条设计亮点、工程实测、同类系统对照、潜力与 v0.8–v1.0 路线。

## 下一步推荐工作

1. 发布 V0.7.1：升版本、跑 `npm run check`、桌面端冒烟（只读自愈、`lock.onDisk` 展示）——**代码与测试已完成，待发版**。
2. 在真实会话中验证审批**通过**路径。
3. 增加面板交互与视觉验收测试。
4. 在真实 Hub 上复核检索健康度：榜首分数分布、`min_score` 是否漂移、近重复对数；若真实条目过万，评估持久化索引快照（换 SQLite 的条件见 [search-performance.md §5](../04-development/search-performance.md)）。
5. 在真实 Hub 上复核派生索引：命中集大小与 recall、`index_candidate_limit` 的实际影响、重启复用是否稳定（实现见 [proposal-derived-index.md](../03-openspec/proposal-derived-index.md)）。
5. 观察 `min_score` / `local_boost` 上线后的预检命中与引用比例；若模型仍不读，再评估“高分命中未 `memory_get` 时拦截首次变更工具”的行为门禁。
6. 观察 `memory-hub` skill 是否被模型主动加载；若 catalog 可见但加载率低，再考虑在预检包尾加入一行 skill 提示，而不是自动注入全文。
7. 给每个子工作区补一条本地 `project:<id>` 基线知识，验证 local-first 排序。
8. 观察夜间维护：第二天检查每个 core 的 `reports/latest.md` 与 `pending/`，确认候选质量；若长期没有候选，再评估是否放宽“精确重复”或增加显式复用标签。
9. 跟踪公共目录 PR [#11187](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11187)：等待构建检查与 1 天仓库年龄门槛通过；合并后确认 `dsh-plugin-catalog` 索引收录。机制见 [catalog-submission.md](../06-operations/catalog-submission.md)。
10. 若需要官方「自动化任务」栏可见/可暂停，另行评估 DSH `schedule` 方案，并记录与内部定时器的取舍。
11. 评估 `all_cores: false` 的定时器语义，必要时改为 `core_ids` 选择，而不是 fallback-only。
12. 评估 per-core 失败重试与全局合并报告；当前保持串行和单一状态。
13. 验证 PTC `run_code` 嵌套调用与门禁边界。
14. 补充外部 CLI / 多进程共享 Hub 测试。
15. 评估索引落盘与增量重建（V0.2 方向）。
16. 评审 [server-memory-2026.md](../05-domain/server-memory-2026.md)（服务端部署 + 三级管理调研）与 [proposal-team-memory.md](../03-openspec/proposal-team-memory.md)（组内服务器草案）；方向已定为"沿用 `global/domain/project` 三级 + 服务端承载上两级 + 本地保留"，待定的是 M1 的接口细节与 token 发放方式。


