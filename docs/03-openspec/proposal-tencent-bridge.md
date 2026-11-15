# Proposal: tencent-bridge 与三阶段定制增强

> 状态：草案（2026-11-13）· 关联：[proposal-team-memory.md](proposal-team-memory.md)（自建服务器草案）、[tencent-vs-local-comparison.md](../../06-operations/tencent-vs-local-comparison.md)（对比实验）
> 一句话：**借腾讯 Agent Memory 的船（已部署、已验证），但不弃本地锚——本地文件永远权威，腾讯只做增强通道与候选来源；同时把腾讯验证过有效的 5 项能力（注入提示、场景归纳、分层、多租户、实时）按"默认关、可选开"的方式做进插件。**

---

## 1. Problem

对比实验（2026-11-13 实测）确认：腾讯 Agent Memory 与本地 memory-hub 互补——

- 腾讯 5/6 查询精准命中（0.88–0.92），但**自动抽取有取舍**（credentials 正则被 `empty_scenes` 丢弃），且不可人工修正；
- 本地命中即精准、可溯源，但**覆盖滞后**（新知识要人工写库）、无自动分层、无实时。

两边各有价值，但当前无法互通：
1. 腾讯抽取出的 L1/L2 无法进入本地 —— 团队在腾讯通道积累的知识，本模型看不到；
2. 本地已批准知识无法分发到腾讯 —— 其他成员用腾讯通道时读不到我们审核过的结论；
3. 对比实验验证有效的 5 项增强（注入提示块、场景归纳、分层、多租户、实时同步）在本地未实现。

## 2. Goal

三阶段工程（阶段一"桥接验证"已完成）：

**阶段二：双向同步（腾讯桥）**
- `pull`：拉腾讯 L1/L2 → 生成本地 `pending/` 候选（**不自动 commit**，人审后入 knowledge/）；
- `push`：本地 accepted 知识 → 腾讯通道（经 `/v3/conversation/add` 或 skill-bridge）；
- 单向权威：本地文件是事实源，腾讯是缓存/分发层；本地删 → 腾讯标删；腾讯新增 → 本地候选。

**阶段三：5 项定制增强（全部默认关闭，opt-in）**
1. 注入结构优化：preflight 包增加"可主动查记忆"提示块（提升采用率）；
2. 自动场景归纳：按主题把知识聚合生成场景索引文件（辅助组织，不替代条目）；
3. 可选分层记忆：`layers.enabled` 开关（默认 flat），`>20k` 条目才建议启用；
4. 多租户隔离：workspace 为团队边界 + 可选 `agent` 维度；
5. 远程实时通道：定期同步 + outbox 队列（离线只读、重连重放）。

## 3. Scope

- `src/tencent-client.ts`：腾讯 v3 API 封装（atomic/query、atomic/search、scenario/ls、conversation/query、conversation/add）；
- `src/tencent-sync.ts`：pull（L1/L2 → pending 提案）、push（accepted → 腾讯）、状态与游标（`records/tencent-state.json`）、outbox 队列（`records/outbox.jsonl`）；
- `config.yaml` 新增 `tencent: { enabled, url, api_key_env, team_id, agent_id, user_id, task_id, sync_interval_min, pull_scope, push_scope }`，默认 `enabled: false`（关闭时行为与 0.7.1 完全一致）；
- 工具：`memory_tencent_status`（只读）、`memory_tencent_pull`（生成候选）、`memory_tencent_push`（分发已批准知识；需人工触发）；
- 阶段三：`buildPack` 注入提示块；`src/scenario.ts` 场景归纳；`config.layers`；`agent` 维度；定时同步任务。

## 4. Out of Scope

- 不做腾讯侧的写权限/审批（腾讯审批模型不同，写回一律走 conversation 通道，由腾讯自己抽）；
- 不自动 commit 任何 pull 候选（仍走 DSH 审批）；
- 不改腾讯 server 侧部署（已完成的桥接验证部分）；
- 不做 CRDT/协同编辑；
- 不把腾讯设为必需依赖（不启用时零网络请求）。

## 5. Affected Modules

config / runtime / service / store / tools / docs · 新增 tencent-client.ts、tencent-sync.ts、scenario.ts

## 6. Storage Impact

- `config.yaml`：新增 `tencent` 与 `layers` 段（默认关闭，旧配置零迁移）；
- `records/tencent-state.json`：新增（游标、上次同步时间、outbox 长度），可删；
- `records/outbox.jsonl`：新增（离线队列），可删；
- `pending/PRO-*.md`：pull 复用现有候选格式，新增 `source_refs: note:tencent:<atomic_id>` 标记来源；
- `knowledge/<type>/<ID>.md`：不变；
- `scenario/`：阶段三新增派生目录（`scenario/<topic>.md`），可删可重建；
- `records/ledger.jsonl`：新增 `tencent.pull` / `tencent.push` 审计事件。

## 7. Constraints

- [x] 不引入强制性数据库（HTTP 客户端 + 文件）。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批；pull 候选必须人批。
- [x] 文件是真相（本地 always authoritative）。
- [x] `tencent.enabled: false` 时行为与 0.7.1 完全一致（回归测试保证）。
- [x] 不启用时零网络请求（不初始化 client、不启定时器）。

## 8. Risks

1. **腾讯 API 不稳定/不可达**：全部调用包超时与错误降级，pull/push 失败只记诊断不阻塞主流程；状态可查。
2. **pull 产生噪声候选**：L1 抽取质量参差（实验已见漏抽与合并）；候选进 pending 后仍需人审，且 `max_pending_per_task` 限流；新增 `pull_scope` 只拉指定 scope。
3. **push 覆盖腾讯数据**：push 只追加 conversation 消息（不删改），腾讯自行抽取；本地删除通过 `deprecate` 语义表达为一条"已废弃"消息。
4. **实时通道复杂度**：定时同步（默认 30 分钟）+ 手动触发，不做 SSE 长连接（腾讯无推送，每轮现拉是其固有限制）；outbox 重放幂等。
5. **配置误填泄露**：`api_key_env` 只读环境变量，不落盘密钥；文档强调只把 8420/8096 限制在内网 IP。

## 9. Verification

- 回归：`tencent.enabled: false` 时全部现有测试绿、零网络请求（mock fetch 断言未调用）。
- pull：mock 腾讯响应 → 生成 pending 候选、不 commit、ledger 有 `tencent.pull` 事件。
- push：accepted 知识 → mock 腾讯 → 断言 conversation/add 请求体正确；失败降级不抛。
- 注入提示：`buildPack` 输出包含"可主动查记忆"提示行（config 开关控制）。
- 场景归纳：给定 N 条同主题知识 → 生成 `scenario/<topic>.md`；不改变 knowledge/ 文件。
- 分层开关：`layers.enabled: true` 时 status 显示分层建议，默认 flat 行为不变。
- `npm run check`（typecheck + build + test）全绿。

## 10. 分阶段落地

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| S2-1 | tencent-client + config.tencent + memory_tencent_status | 只读连通性测试绿 |
| S2-2 | pull（L1/L2 → pending）+ 测试 | mock 生成候选，人审不入库 |
| S2-3 | push（accepted → 腾讯）+ outbox + 测试 | mock 请求体正确，失败降级 |
| S3-1 | 注入提示块 + 测试 | buildPack 含提示行，可关 |
| S3-2 | 场景归纳 + 测试 | 生成 scenario 文件，不碰 knowledge |
| S3-3 | 分层开关 + 多租户 agent 维度 + 测试 | 默认行为不变 |
| S3-4 | 定时同步 + 文档 | 定时器只在 enabled 时注册 |
