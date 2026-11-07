# Scope Rules

## 三种作用域

- `global`：跨项目通用知识。
- `domain:<id>`：领域知识，可被多个 workspace 共享。
- `project:<workspace-id>`：单个工作区专属知识。

## 工作区映射

1. 取当前会话目录。
2. 规范化：realpath → 统一分隔符 → Windows 大小写折叠 → 去尾分隔符。
3. 在已启用 workspace 中取最长前缀匹配。
4. 同一目录既是某核心的 root、又是父核心的子工作区（等长前缀平局）时，**自己的核心仓优先**；不再依赖 `core_workspaces[]` 配置顺序。
5. 命中 → `project:<id>` + 其 `domains`；未命中 → 仅 `global`。

## 可见性规则

- `global`：任何会话可见。
- `domain:<id>`：当前 workspace 的 `domains` 包含该 id 时可见。
- `project:<id>`：当前 workspace.id 等于该 id，或当前 workspace 的 `core_id` 等于该 id 时可见。因此子工作区能看到核心工作区的共享知识。
- 双角色工作区额外可见父核心的 `project:<parent-core-id>`（父核心 Hub 的既有蒸馏知识）。

## 双角色工作区（V0.1.7）

同一个 `id` 可同时出现在两个列表：

```yaml
core_workspaces:
  - id: dsh-memory-hub      # 自己的 Hub
    root: E:/009workspace/dsh/dsh-memory-hub
workspaces:
  - id: dsh-memory-hub      # 同时作为 dsh-plugin-dev 的子工作区
    core_id: dsh-plugin-dev
    root: E:/009workspace/dsh/dsh-memory-hub
```

- 会话路由到自己的核心 Hub；父核心 Hub 作为二级只读检索来源挂接。
- 检索（`memory_search` / 预检 / `memory_get` / `memory_cite`）跨两个 Hub 合并，父核心命中带 `core` 标注。
- `core_id` 不允许等于自身（配置保存时拒绝）。

## 金字塔记忆（多层上级链）

双角色可继续上推：某个核心工作区自身也可以是更上层核心的子工作区，形成 近→远 的祖先链（父、祖父、…，最多 8 层，运行时带环检测，成环即截断）：

```yaml
core_workspaces:
  - id: product           # 顶层
    root: '...'
  - id: dsh-plugin-dev    # 中层：自己的 Hub，同时是 product 的子
    root: '...'
  - id: dsh-memory-hub    # 底层：自己的 Hub，同时是 dsh-plugin-dev 的子
    root: '...'
workspaces:
  - id: dsh-plugin-dev
    core_id: product
    root: '...'
  - id: dsh-memory-hub
    core_id: dsh-plugin-dev
    root: '...'
```

- 可见性：`project:<self>` + **每一层**祖先的 `project:<祖先>` + `global`（global 只取自己的 Hub）。
- 检索与预检按 近→远 合并各层蒸馏知识，本地优先；命中带 `core` 标注所属层。
- `memory_status` 的 `workspace.parentCoreIds` 与 `ancestors` 报告完整上级链。

## 模型权限

- `memory_search` 只返回当前会话可见集合内的条目。
- `memory_get` 拒绝读取不可见作用域的条目。
- `memory_propose` 只能在可见作用域内创建候选（晋升到 global 需通过 `memory_consolidate`）。
- 子工作区可以用 `scope: "core"` 作为 `project:<core-id>` 的别名，把可复用知识直接回填到核心工作区；核心工作区本身也可使用该别名。
- 双角色工作区可用显式 `project:<parent-core-id>`（或别名 `scope: "parent"`）把 L2 蒸馏候选写进父核心 Hub；`memory_get` / `memory_cite` / `memory_commit` 支持可选 `core` 参数指向父核心，`memory_propose` 结果会回报 `core` 与 `scope` 便于后续 commit 显式指定。

## 晋升路径

### 插件工作区 → 核心工作区（共享）

```text
project:<plugin-id> accepted
  → memory_propose(scope: "core", source_refs: ["memory:<id>@v<version>"])
  → pending/PRO-*.md (project:<core-id>)
  → memory_commit
  → 核心工作区 accepted，所有子工作区可见
```

### 双角色分级蒸馏（金字塔）

```text
L1: 会话（自己的核心 Hub）
  → memory_propose(scope: "core")        → project:<self> 写自己的 Hub
L2: 会话（父核心的子工作区）
  → memory_get(core: "<parent>")         读取父核心既有蒸馏
  → memory_propose(scope: "parent")      → 候选写父核心 Hub 的 pending/
  → memory_commit(proposal_id, core: "<parent>")
L3+（更上层）
  → memory_propose(scope: "project:<祖父核心>") → 候选写祖父核心 Hub
  → memory_commit(proposal_id, core: "<祖父核心>")
```

### 项目 → 全局（跨项目）

```text
project:<id> accepted
  → memory_consolidate
  → pending/PRO-*.md (target_scope: global)
  → memory_commit 审批
  → global accepted
```

## 禁止

- 模型通过参数扩大可见范围。
- 项目知识自动泄漏到 global。
- 跨作用域读取不经验证。
