# AGENTS.md — dsh-memory-hub

本文件是给在 `dsh-memory-hub` 仓库上工作的 AI agent 的操作手册。

> **2026-11-14 改版**：原版本假设"只有 DSH 一个宿主、面板只读、单一进程"。这三个前提已经不成立（见 [ADR-0010](docs/01-architecture/decisions/ADR-0010-panel-transport-portability.md) 与 [proposal-remote-providers](docs/03-openspec/proposal-remote-providers.md)）。改版后本文件只写**不变量**与**当前方向**，不再写"面板只能做 X"这类会被实现推翻的操作性规则。被撤下的条目归档在文末。

## 角色

你是 Memory Hub 的协作者。Memory Hub 是一个**本地优先、文件原生的长期记忆系统**：最初是 DSH 插件，方向是**跨宿主通用**（DSH / Claude Code / opencode / Cline / 任何能调 MCP 或 CLI 的 agent）。

## 开始工作前必读

1. `docs/README.md` — 阅读策略、目录地图。
2. `docs/00-project/current-state.md` — 当前状态与待办（**改动后必须更新**）。
3. `docs/00-project/project-brief.md` — 项目定位。
4. 改架构 → `docs/01-architecture/`；改工具/审批 → `docs/02-harness/`、`docs/05-domain/`；改构建/测试 → `docs/04-development/`。

## 不变量（这些不能动，动之前必须先讨论）

这四条是产品身份，不是操作习惯。历史上每一条都对应过一次真实的取舍：

1. **文件是权威，不是缓存**。`knowledge/` 下的 Markdown 是事实源；任何数据库、索引、远端服务都只能是派生或通道。删掉索引要能重建，删掉远端要能照常工作。
2. **人批准才能进 `knowledge/`**。模型可以创建 `pending/` 候选，**永远不能自批**。这是与"自动抽取型"记忆系统（Mem0 / 腾讯 L1）的核心区别——它们会漏抽且不可人工修正，我们的价值是可溯源、可审核。
3. **纯文本可读可迁移**。Markdown / YAML / JSONL；用户能打开、能 diff、能 git 管理。不引入必须靠专有工具才能读的格式。
4. **默认零网络**。所有远端连接默认关闭；关闭时进程不发请求、不初始化 client、不注册定时器。

## 当前方向（2026-11 起）

- **多宿主**：`core` 不得依赖 DSH。三层单向依赖 —— `core` → `transport`（MCP stdio / HTTP router / CLI）→ `host-glue`（DSH 插件）。只有 `host-glue` 可以 import `@deepseek-ai/*`。
- **多远端**：远端按**角色**接入（`feed` / `mirror` / `authority` / `index`），不按厂商接入。新接一家 = 新增 adapter 或写 `http-json` 配置，不改核心。
- **多入口**：DSH 内嵌面板、`memory-hub serve` 的 standalone 面板、CLI，共用同一份 HTTP router 与同一份 config 写入路径。**渲染可以有两套，API 契约只能有一套。**

## 工作流

1. 读 `current-state.md`。
2. 新功能 / 大改动 → 先按 `docs/03-openspec/` 写提案或 `docs/07-templates/` 写 ADR。
3. 核心逻辑改动必须补/改测试；改完跑 `npm run check`（typecheck + build + test）。
4. 更新 `current-state.md`。
5. 中文为主；技术名词、API 名、工具名、文件路径保留原样。

## 仍不建议做（与不变量直接相关）

- **不要给模型伪造审批的路径**。任何新入口（MCP、CLI、端口面板）都必须保持"人做最终决定"。
- **不要让模型自批候选**，也不要把"自动 commit"做成可配置项。
- **不要删除用户 Hub 目录下的记忆文件**，除非用户明确授权。
- **不要一次性把大量历史会话或整份文件塞进上下文**；用摘要索引 + 按需 `get`。

## 归档：已撤下的操作性约束

以下条目在 2026-11-14 版本中撤下，原因是它们与新发展冲突，或已被实现推翻。**不是否定其初衷**——如果将来回到单宿主 + 单进程形态，可以逐条恢复。

| 原约束 | 撤下原因 |
| --- | --- |
| 面板默认只读，唯一写操作是审批 | 实现早已能写 `core_workspaces` / `workspaces`（V0.5.0 起），现在又要写 `remote`。诚实的内核是"面板不碰知识正文"，已并入不变量 2。 |
| 不要给面板添加其他写入权威知识的端点 | 同上。禁止的是"改写 `knowledge/` 正文"，不是"新增配置端点"或"新增读取端点"。 |
| 面板路由只允许回环请求 | 保留其安全意图，但表述过窄。新的表述见 ADR-0010：**只允许绑定 loopback + Host 头白名单 + 写操作令牌**；监听 `0.0.0.0` 直接拒绝启动。 |
| 默认不使用向量数据库 | 降级为偏好而非禁令。BM25 + CJK 仍是默认；若要加向量索引，必须是**可选派生层**（可删可重建），不能成为检索的唯一路径。 |
| 不要引入必须联网的依赖或服务 | 与"多远端"冲突。新的约束是**必须可离线运行**：无网络时全部核心功能可用，远端相关能力降级为诊断。 |

## 关于本文件的效力

这是**给 agent 的说明书**，不是产品的运行时约束。产品该拦的东西要写在代码里（工具门禁、审批拦截、路由守卫），不能只写在文档里——文档只能约束"愿意遵守的 agent"。
