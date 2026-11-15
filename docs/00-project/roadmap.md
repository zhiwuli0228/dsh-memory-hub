# Roadmap

## V0.1（已实现）

- 单 Hub + 多工作区 + 作用域隔离
- 九类知识类型
- 自动预检 + 紧凑上下文注入
- 引用 + 候选 + 提交审批
- 任务关闭评估
- 手动汇总
- 状态与诊断工具
- 33 个测试

## V0.1.1（已实现）

- 只读 Web 面板
- 总览 / 知识 / 待审批 / 活动与策略 / 能力 标签页
- Host 回环路由提供数据

## V0.1.2（已实现）

- 核心/子工作区模型（`core_workspaces` + `workspaces[].core_id`）
- 面板「配置」标签页
- `config.yaml` 热加载
- 宿主冒烟验证更新

## V0.1.3（已发布）

- GitHub Actions Trusted Publisher/OIDC 自动发布（无需 `NPM_TOKEN`）
- `PLUGIN_VERSION` 与 `package.json` 使用单一版本源
- 39 个测试

## V0.1.6（已发布）

- 写锁按根独立：配置根/单个工作区锁被占用不波及其他根；跨机残留锁自动回收；配置写入不受写锁限制
- `memory_status` / `/api/overview` / `/api/config` 暴露 `configWritable` 与 `readOnlySource`
- 59 个测试

## V0.1.5（已发布）

- 预检相关性门控：`policy.preflight.min_score`
- 本地优先排序：`policy.preflight.local_boost`
- 指令式包尾：先 `memory_get`，使用后 `memory_cite`，结束前 `memory_close_task`
- 面板任务行显示命中数与引用数
- 系统级 `memory-hub` skill：全局注册、按需加载，覆盖检索/作用域/审批/回写/核心回填
- 夜间确定性维护：03:00 单定时器按 core 配置顺序串行巡检，写报告并生成 pending 提案；不自动提交
- 维护入口为插件内部定时器，不显示在官方「自动化任务」栏
- 维护状态、多 core 失败语义、操作手册与 ADR 已记录
- npm `0.1.5` + GitHub Release `v0.1.5` 已发布

## V0.7（规划中，依据 [memory-landscape-2026](../05-domain/memory-landscape-2026.md)）

三项 P0 已有提案，尚未实现：

- 回顾式萃取：从会话记录提取「已验证的决策/踩过的坑」，仍只产出候选 — [proposal-retrospective-extraction](../03-openspec/proposal-retrospective-extraction.md)（**已实现，V0.7 WIP**）
- 去重与合并：近重复检测 + `merge` 提案 + 面板旧→新 diff，人工确认后 supersede — [proposal-dedupe-merge](../03-openspec/proposal-dedupe-merge.md)（**已实现，V0.7 WIP**）
- 时效字段：`valid_from` / `last_verified` / `expires_at`，过期降权不删除 — [proposal-temporal-fields](../03-openspec/proposal-temporal-fields.md)（**已实现，V0.7 WIP**）
- 内部 golden set 与「有记忆/无记忆」对照指标，作为发版回归项（尚未写提案）

建议顺序：**时效字段 → 去重合并 → 回顾式萃取**。前两项都改 frontmatter 与提交路径，放在一起做只需一次格式评审；回顾式萃取独立，可并行。

2026-11-08 评审结论（三份提案状态改为 Accepted，已实现 V0.7 WIP）：

- 时效：`aging_days` 取 **90 天**（不是 180）。
- 去重合并：采用独立 `operation: 'merge'`，不复用 `update` + 多条 `supersedes`。
- 回顾式萃取：参考金字塔蒸馏，走**定时任务**；每个核心工作区与每个子工作区各一条，按 cwd 最长前缀归属会话，回顾只写本工作区 L1，上行仍由蒸馏负责。

## V0.2（候选）

- 索引落盘与增量重建，减少启动扫描
- 多写者协议 / 文件锁改进
- 审批通过路径的真实宿主验证
- 长会话上下文累积策略
- 面板视觉效果验收
- 5k+ 条性能压测

## V0.3（候选）

- 可选向量检索插件（默认关闭）
- 更细粒度的门禁策略
- 自动过期 / 提醒策略
- 多 Hub 导入/导出

## V1.0（方向已定）：组内服务器 + 三级复用，本地模式保留

调研见 [server-memory-2026](../05-domain/server-memory-2026.md)，设计见 [proposal-team-memory](../03-openspec/proposal-team-memory.md)。

结论：不发明新作用域，沿用 `global / domain / project` 三级；把 **`global`（项目组）与 `domain`（小组）的权威搬到组内服务器**，`project`（个人）仍本地。本地永远是工作副本，不部署服务器时行为不变。

- M1：服务端骨架（scopes / token / 读 / SSE）+ 客户端同步 + 缓存
- M2：提案 / 审批 / 离线 outbox / 面板状态
- M3：`global` 层 + 晋升 + 审计 + 部署文档

硬规则不变：文件是真相、模型不能自批、不引入强制数据库与向量库。

## V0.8「跨宿主落地」（进行中，ADR-0010 + 路线重排 DEC-000016）

依据《对比及演进蓝图_2026.11.15》：宿主锁定是唯一"不改产品身份、纯放大既有投资"的方向。

- [x] **S2：`memory-hub mcp`（stdio）**：8 工具面（tool-surface §7）、commit 失败关闭、headless 任务语义、分层静态断言（2026-11-15，`src/transport/mcp.ts` + `src/cli.ts`）
- [x] **S1：`handleHttp` 抽 `src/http/router.ts`，DSH 双挂载保持等价**（2026-11-15；内嵌 = `hostMode:'embedded' + writeToken:null` 委托，client.js 零改动）
- [x] **S3：`memory-hub serve`**（2026-11-15；Host 白名单 + Origin + 写令牌 + `records/server.json` + `--stop`；非 loopback 拒绝启动——当前硬编码回环，无 allow_remote 逃生口）
- [x] **S4：standalone 静态面板**（2026-11-15；`src/http/panel.ts` 单文件内嵌：总览/待审批/配置；零新 API 端点；只读禁批；验收=浏览器路径批准候选且账本 `panel:human`）
- [x] **并行：golden set 评测基线**（2026-11-15；`memory-hub eval-golden`，真机 hit@1 = 19/20（95%），报告 `docs/04-development/golden-set-baseline.md`；顺带修掉 headless 工作区合成缺失的可见性 bug）
- [x] **S6：命名去 DSH 化（A 路线：叙事分层）+ 工作区对齐文档**（2026-11-15；产品名 Memory Hub、MCP serverInfo `memory-hub`、serve 路由 `/api/*` + `/panel`（router `basePath`，DSH 内嵌前缀不变）、生成文件署名；npm 包名保持——裸名被占；README 工作区对齐两种方式）
- [x] **S5：CLI 只读三件套 + 分发就绪**（2026-11-15；`search`/`get`/`inbox` 与 MCP 同源（`runCli(argv, io)` 可测），CLI 故意无写路径；README 跨宿主接入段；harness 文档随包（`docs/02-harness/*.md`）；`npm pack` 20 文件核对通过。T0–T3 注入分级文档已在 2026-11-14 harness 回写中就位（harness-standard/context-policy），本轮仅回填 `cli:human` 待实现标注）
- [ ] 分发：真实 npm 发布（tag → Trusted Publisher，等用户指令）→ MCP 官方目录 + Claude plugin 市场；发布 `http-json` provider 规范文档；可选 `memory-hub inbox --approve`（`cli:human` 落点）

## Backlog

- ~~MCP server 形态评估~~ → 已立项为 V0.8 S2 并落地
- 移动端/窄屏适配
- 国际化面板
- 与 DSH skills 集成
