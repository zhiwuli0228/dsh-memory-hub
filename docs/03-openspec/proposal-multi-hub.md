# Proposal: Per-Core-Workspace Memory Hub

> Status: implemented in V0.1.2+.

## 1. Problem

当前 dsh-memory-hub 使用**单一 Hub 根目录**（默认 `~/.dsh/memory-hub`），所有项目记忆都放在同一个目录下。用户希望：

- 不存在一个全局的“根目录”概念。
- 配置一个**核心工作区（core workspace）**时，它的 `root` 就是该核心仓的记忆目录。
- 不同核心仓可以位于不同磁盘/目录，记忆跟着项目走。

## 2. Goal

支持**多 Hub**：每个配置了 `root` 的核心工作区对应一个独立的 Hub 数据目录。会话按工作目录匹配到最近的核心工作区，并使用该核心工作区的 Hub。

## 3. Scope

Included:

- `core_workspace` 配置增加 `root` 字段。
- 一个核心工作区本身就是一个可匹配的作用域/记忆目录。
- `MemoryRuntime` 同时为多个核心工作区打开 Hub。
- 会话按工作目录最长前缀匹配核心工作区。
- 子工作区（`workspaces`）仍可在核心工作区内提供更细粒度项目作用域。
- 面板支持按核心工作区切换查看不同 Hub。
- 回退策略：未匹配到任何核心工作区时，使用插件配置目录作为只读/降级 Hub（保证已有测试与默认行为）。

Out of Scope:

- 跨 Hub 知识汇总/搜索。
- 动态添加/删除核心工作区（仍通过 `config.yaml` 编辑或面板配置页）。

## 4. Affected Modules

- `src/config.ts`：核心工作区 schema。
- `src/hub.ts`：支持以外部配置实例化。
- `src/runtime.ts`：多 Hub 管理、会话路由。
- `src/service.ts`：接收外部 workspace 解析结果，减少全局单 Hub 依赖。
- `src/tools.ts` / `src/index.ts`：工具调用路由。
- `src/host.ts`（可能）：无，保持最小。
- `client.js`：Hub 选择器。
- `src/runtime.ts` HTTP 路由：新增 `/api/hubs`，`overview` / `knowledge` 支持 `core` 查询参数。

## 5. Storage Impact

- 原 `~/.dsh/memory-hub` 仍作为**插件配置目录**保留 `config.yaml`。
- 每个核心工作区的 `root` 下将生成：
  - `knowledge/`
  - `pending/`
  - `records/`
  - `history/`
  - `index/`
- 子工作区不拥有独立 Hub，仅作为核心 Hub 内的项目作用域。

## 6. Constraints

- 不引入强制性数据库。
- 核心工作区的 `root` 需要 DSH 跨目录操作授权（用户已确认）。
- 未匹配核心工作区时，行为降级为只读/无匹配。
- 单写者模型仍按 Hub 独立生效。

## 7. Risks

- 多 Hub 后，面板需要选择器，否则只能看到默认 Hub。
- 路径前缀匹配可能误匹配（通过最长前缀和真实路径降低风险）。
- 测试需要为每个核心工作区准备独立目录。

## 8. Verification

- `npm run check` 通过。
- 新增/更新测试：
  - `tests/plugin.test.ts` 新增多 Hub 路由测试。
  - 新增核心工作区、子工作区、无核心降级等场景覆盖。
- 宿主冒烟：在 DSH 中配置 `product` 核心工作区，已验证 `/api/hubs`、`/api/overview?core=...` 及面板 Hub 切换。
