# Proposal: dual-role workspace（一个工作区同时作为核心工作区和子工作区）

## 1. Problem

当前模型把「核心工作区」和「子工作区」当成互斥角色：

- 核心工作区 = 一个独立 Hub（有自己的 `knowledge/`、`pending/`、`records/`、写锁），会话按工作目录最长前缀路由到它。
- 子工作区 = 挂在某个核心 Hub 里的 `project:<id>` 作用域，不拥有独立 Hub。

一个会话只路由到一个 Hub，`memory_search` / `memory_get` / 预检只读该 Hub。因此同一个目录无法既沉淀自己的知识（作为核心），又继续读取父核心的蒸馏知识（作为子工作区）。本机已经把 `dsh-memory-hub` 同时登记为 `product` 的 root 和 `dsh-plugin-dev` 的子工作区，但结果由 `core_workspaces[]` 配置顺序决定，检索只能看到一个 Hub。

## 2. Goal

支持「双角色工作区」：同一个 `id` 同时出现在 `core_workspaces`（自己的 Hub）和 `workspaces`（`core_id` 指向父核心）中，并实现分级蒸馏：

- **L1（自己的核心仓）**：会话路由到自己的核心 Hub；`scope:"core"` / `project:<self>` 的知识写进自己的 Hub。
- **L2（作为子工作区）**：会话同时可见父核心 Hub 里 `project:<parent>` 的既有蒸馏知识，并能把继续蒸馏的候选写回父核心 Hub。
- 检索（`memory_search` / 预检 / `memory_get` / `memory_cite`）跨两个 Hub 合并，父核心命中带 `core` 标注；写入仍由提案 + 人工审批把关。

## 3. Scope

包含：

- 配置：允许同一 `id` 同时出现在 `core_workspaces` 与 `workspaces`；校验 `core_id` 不得指向自身、必须指向已存在的核心。
- 路由：等长前缀平局时**自己的核心优先**（不再依赖配置顺序）。
- 可见性：`project:<self>` + `project:<parent>` + `global`（global 取自自己的 Hub，避免重复）。
- 跨 Hub 只读检索：`memory_search`、`memory_preflight`、`memory_get`、`memory_cite`。
- 跨 Hub 写（分级蒸馏）：`memory_propose` 的 `project:<parent>` 落到父核心 Hub 的 `pending/`；`memory_commit` / `memory_close_task` 按 proposal 归属 Hub 解析。
- `memory_status` / 面板知识列表标注父核心来源。

## 4. Out of Scope

- **无限深度**的核心链：支持多层祖先链（父、祖父、…），但最多 8 层，超过上限的更深层不参与检索与蒸馏。
- 父核心 Hub 的自动夜间晋升（父核心 side 从子 Hub 拉取 L1 知识）——后续可扩展现有 maintenance/consolidate。
- 跨 Hub 的 ID 全局唯一化：两个 Hub 仍各自维护 `DEC-000001` 等序号；同 ID 冲突时 `memory_get` 默认取自己的 Hub，可用 `core` 参数显式取另一侧。

## 5. Affected Modules

- config（`src/config.ts`、`src/service.ts#updateConfig`）
- runtime（`src/runtime.ts`）
- service（`src/service.ts`）
- search（`src/search.ts`）
- types（`src/types.ts`）
- tools（`src/tools.ts`）
- client.js（面板标签）
- docs

## 5.1 实现要点（已完成）

- **金字塔祖先链**：`ancestorIds(config, coreId)` 沿 `workspaces[].core_id` 逐层上推到父、祖父、…（近→远），最多 8 层，带 visited 环检测；每层 `project:<祖先核心>` 只读可见。**检索以当前工作区为主**：本层有 ≥1 个合格命中即返回、不再上溯，本层无命中才按 近→远 回退到上一层。
- **分级蒸馏 L1/L2/L3+**：`scope:"core"` → 自己的 Hub；`scope:"parent"`（或 `project:<父核心>`）→ 父核心 Hub；显式 `project:<任意祖先核心>` → 对应层 Hub 的 `pending/`；commit 落到该层账本。
- **跨 Hub 显式参数**：`memory_get`、`memory_cite`、`memory_commit`、`knowledgeDetail`（面板详情）均支持可选 `core`（自己的 Hub 或任一祖先 Hub）；propose 结果回报 `core` 与 `scope`。
- **配置热更新**：watcher 触发 `reloadConfig` 后执行 `reconfigureCores()`——按最新配置增删 core、刷新各 pack 工作区清单、重算并重新接线祖先链、同步最新 `config` 对象到核心 Hub；新增核心 / 开启双角色无需重启（`storage.watch: true` 时）。
- **面板标注**：知识列表并入各上级核心 `project:<祖先>` 蒸馏条目并显示「父核心蒸馏」标签；详情打开携带 `core` 查询参数。
- **安全约束**：`updateConfig` 拒绝 `core_id === id`（自引用）。

## 6. Storage Impact

- `config.yaml`：同一 `id` 可同时出现在两个列表；`workspaces[].core_id` 指向父核心。
- `knowledge/<type>/<id>.md`：L1 写自己的 Hub，L2 写父核心 Hub；文件格式不变。
- `pending/PRO-*.md`：跨 Hub 蒸馏的候选落在父核心 Hub 的 `pending/`。
- `records/ledger.jsonl`：跨 Hub 写入的 `proposal.created` / `proposal.committed` 记在**归属 Hub** 的账本；citation 增加可选 `coreId` 字段（向后兼容）。
- `records/sequences.json`：各 Hub 独立，不合并。
- `history/<type>/<ID>@v<N>.md`：各 Hub 独立。

## 7. Constraints

- [x] 不引入强制性数据库。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批。
- [x] 文件是真相。

## 8. Risks

- 同 ID 跨 Hub 冲突：默认取自己的 Hub，可能让模型误读上级核心的同 ID 条目；用 `core` 参数与命中上的 `core` 标注缓解。
- 跨 Hub 账本的 `taskId` 属于发起会话的 Hub：上级核心账本会出现「外来任务」的 proposal 记录，审计上可接受但需在文档注明。
- 配置顺序不再决定路由，旧配置中「依赖顺序」的行为会改变；以「自己的核心优先」为准，更可预测。
- 祖先链成环（A→B→A）：运行时在重复点截断并告警，不中断会话；深度上限 8 层，更深层不参与检索与蒸馏。

## 9. Verification

- 单测：双角色配置下 `serviceFor` 选自己的核心（含配置顺序相反时）；`search` 同时返回 `project:<self>` 与 `project:<parent>`；`get` 能读父核心条目且默认回退；`scope:"core"` 写自己的 Hub；`project:<parent>` / `scope:"parent"` 写父核心 Hub 且 commit 落到父核心账本；自引用配置被拒绝；配置热更新后新增双角色核心无需重启；**两级祖先链**（self → parent → grandparent）检索/回退/逐层上推/`parentCoreIds` 与 `ancestors` 报告；祖先链成环时截断不挂起。
- 宿主冒烟：本机配置把 `dsh-memory-hub` 同时登记为核心与子工作区后，会话预检能看到 `dsh-plugin-dev` 的共享条目，且 `memory_status` 显示两个 Hub。
- `npm run check` 全绿。
