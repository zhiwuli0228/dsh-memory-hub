# Scope Rules

## 三种作用域

- `global`：跨项目通用知识。
- `domain:<id>`：领域知识，可被多个 workspace 共享。
- `project:<workspace-id>`：单个工作区专属知识。

## 工作区映射

1. 取当前会话目录。
2. 规范化：realpath → 统一分隔符 → Windows 大小写折叠 → 去尾分隔符。
3. 在已启用 workspace 中取最长前缀匹配。
4. 命中 → `project:<id>` + 其 `domains`；未命中 → 仅 `global`。

## 可见性规则

- `global`：任何会话可见。
- `domain:<id>`：当前 workspace 的 `domains` 包含该 id 时可见。
- `project:<id>`：当前 workspace.id 等于该 id，或当前 workspace 的 `core_id` 等于该 id 时可见。因此子工作区能看到核心工作区的共享知识。

## 模型权限

- `memory_search` 只返回当前会话可见集合内的条目。
- `memory_get` 拒绝读取不可见作用域的条目。
- `memory_propose` 只能在可见作用域内创建候选（晋升到 global 需通过 `memory_consolidate`）。
- 子工作区可以用 `scope: "core"` 作为 `project:<core-id>` 的别名，把可复用知识直接回填到核心工作区；核心工作区本身也可使用该别名。

## 晋升路径

### 插件工作区 → 核心工作区（共享）

```text
project:<plugin-id> accepted
  → memory_propose(scope: "core", source_refs: ["memory:<id>@v<version>"])
  → pending/PRO-*.md (project:<core-id>)
  → memory_commit
  → 核心工作区 accepted，所有子工作区可见
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
