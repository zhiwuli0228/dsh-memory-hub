# 腾讯 Agent Memory 桥（tencent-bridge）操作指南

> 版本：随 dsh-memory-hub v0.7.2 · 关联提案：[proposal-tencent-bridge.md](../03-openspec/proposal-tencent-bridge.md)
> 一句话：**本地文件永远是事实源；腾讯只做增强通道与候选来源。默认关闭，零网络请求。**

---

## 1. 是什么

对比实验（2026-11-13）确认腾讯 Agent Memory 与本地 hub 互补。腾讯桥让两边互通：

- **pull（拉）**：把腾讯自动抽取的 L1/L2 拉成本地 `pending/` 候选 —— 人审通过后才进 `knowledge/`（**模型不能自批**，走 `memory_commit` 或面板）；
- **push（推）**：把本地已批准的 accepted 知识分发到腾讯 conversation 通道 —— 腾讯侧自己再抽取，团队其他成员经腾讯通道能看到；
- **单向权威**：本地文件是真相；腾讯是分发层。pull 产物永远是候选，push 只追加消息、绝不删改腾讯数据。

## 2. 启用

`config.yaml` 增加（示例值来自实际部署）：

```yaml
tencent:
  enabled: true
  url: 'http://127.0.0.1:8420'    # memory-core 数据面地址
  api_key_env: PROXY_USER_KEY     # 从环境变量读 token（不落盘）
  service_id: default
  team_id: team-oorlv5kamx        # 腾讯侧隔离字段
  agent_id: agt-oorq6rzprf
  user_id: usr-oon04odpor
  task_id: ''
  sync_interval_min: 30           # 心跳间隔（只 ping，不自动 pull/push）
  pull_scope: global              # pull 生成候选的作用域
  pull_type: knowledge            # pull 生成候选的类型
  pull_limit: 50                  # 每次 pull 最多拉多少条
  timeout_ms: 10000
```

启用条件（任一不满足会在工具调用时报 `NOT_CONFIGURED`）：
1. `tencent.enabled: true`；
2. `api_key_env` 指向的环境变量**非空**。

## 3. 工具

| 工具 | 作用 | 写操作 |
| --- | --- | --- |
| `memory_tencent_status` | 只读：enabled、url、ping 连通性、lastPullAt/lastPushAt、outbox 长度、lastError | 无（只 ping） |
| `memory_tencent_pull` | 拉腾讯 L1/L2 → 本地 pending 候选 | 写 `pending/` + `records/tencent-state.json` |
| `memory_tencent_push` | 本地 accepted → 腾讯 conversation | 写腾讯（经 conversation/add）+ `records/outbox.jsonl` |
| `memory_scenario_rebuild` | 重建场景索引（阶段三派生视图） | 只写 `scenario/` 目录 |
| `memory_scenario_list` | 列出场景文件 | 无 |

## 4. 数据文件

| 路径 | 作用 | 可删 |
| --- | --- | --- |
| `records/tencent-state.json` | 游标：lastPullAt、lastPushAt、outboxPending、lastError、pushedIds | ✅ 可删（下次 pull/push 重建） |
| `records/outbox.jsonl` | push 离线队列（失败条目） | ✅ 可删（未发送条目丢弃） |
| `scenario/<topic>.md` | 场景索引（派生视图） | ✅ 可删，`memory_scenario_rebuild` 重建 |
| `records/ledger.jsonl` | 追加 `tencent.pull` / `tencent.push` 审计事件 | ❌ 不要手改 |

## 5. 工作流（推荐）

1. **日常**：每 30 分钟心跳 ping（仅诊断）；需要新候选时手动 `memory_tencent_pull`；
2. **pull 后**：到面板「待审批」审核候选 → `memory_commit` 或点击批准；
3. **分享本地结论**：`memory_tencent_push`（只推 accepted）；失败条目进 outbox，下次 push 自动重放（幂等，`pushedIds` 去重）；
4. **离线**：本地全功能（pull 失败降级、push 进 outbox、检索用缓存）。

## 6. 故障排查

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| `NOT_CONFIGURED: tencent bridge is disabled` | `enabled: false` 或 api_key_env 为空 | 检查 config.yaml + 环境变量 |
| `tencentStatus` 的 `ping.ok: false` | 数据面不可达/超时 | `docker ps` 看 tdai-memory-core；检查 url 与端口 |
| pull 返回 `pulled:0` | 腾讯侧无该隔离下的记忆 | 用腾讯面板确认 team/agent/user 隔离字段 |
| push 全部进 outbox | 数据面离线 | 恢复后手动再 push 一次（自动重放） |
| 候选洪水 | pull_limit 过大 | 调小 `pull_limit`；`max_pending_per_task` 也限流 |

## 7. 安全注意

- **端口暴露**：只有 `8096`（proxy）应公网可达；`8420/8125/8424` 仅内网/回环。腾讯 v3 元数据接口带 `x-tdai-service-id` + `x-tdai-user-key`，数据面带 Bearer；
- **token 不落盘**：`api_key_env` 只存变量名；密钥放 `.credentials.yaml` 或进程环境；
- **pull 候选含敏感内容**：腾讯自动抽取的内容进 pending 后仍由人审，与本地知识同一审批路径。

## 8. 关闭

```yaml
tencent:
  enabled: false
```

关闭后：不初始化 client、不发任何请求、不启心跳；行为与未安装本模块一致（回归测试覆盖）。`records/tencent-state.json` 等残留可手动删除。

## 9. 真实端到端验证（2026-11-13）

用一次性脚本（`scripts/verify-tencent-bridge.ts`，不进 CI）跑通完整服务路径：真实 MemoryService + 临时 Hub（config 启用 tencent，经 `ssh -L 18420:127.0.0.1:8420` 端口转发到腾讯数据面）。

结果：
- `tencentStatus` → `ping.ok: true, total: 6`（真实连通）；
- `tencentPull` → `pulled: 4, proposed: 4, skipped: 0`（腾讯 L1 3 条 + L2 场景 1 条 → 本地 `pending/` 候选）；
- `pending/PRO-*.md` 生成 4 个候选（含 `type: process` 的场景条目，tag `tencent`/`t:episodic`/`team:<id>`，`source_refs: note:tencent:<atomic_id>`）；
- `records/tencent-state.json` 游标写入 `lastPullAt`；账本追加 `proposal.created × 4` 与 `tencent.pull`。

运行方式见脚本头部注释；push 方向在上文 §3 验证（`conversation/add` 写入 session `dsh-memory-hub-verify` 并可读回，腾讯自动抽成新 L1，total 5→6）。
