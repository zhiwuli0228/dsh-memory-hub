# 插件开发双层记忆工作流

## 目标

- **核心工作区** `dsh-plugin-dev` 统一存放官方插件开发规范、通用流程、跨插件踩坑。
- **每个插件一个子工作区**，存放该插件专属的决策、约束、领域知识和上下文。
- 子工作区自动可见核心知识；插件踩坑验证为通用后，回填核心，供其他插件复用。

## 拓扑

```text
core_workspaces:
  dsh-plugin-dev            root: E:\009workspace\dsh\dsh-plugin-dev
    ├── project:dsh-plugin-dev        # 核心共享知识
    └── workspaces[].core_id = dsh-plugin-dev
          ├── dsh-memory-hub          # 插件子工作区
          ├── dhs-env-manger          # 插件子工作区
          └── token-usage-statistic   # 插件子工作区
```

所有子工作区与核心工作区共用同一个数据 Hub（`E:\009workspace\dsh\dsh-plugin-dev`），所以“回填核心”不是复制文件，而是把候选的 `scope` 设为 `project:dsh-plugin-dev`。

## 双角色变体（V0.1.7）

插件本身也可以同时是自己的核心工作区：同一个 `id` 同时出现在 `core_workspaces`（自己的 Hub）与 `workspaces`（`core_id: dsh-plugin-dev`，同一目录）。例如 `dsh-memory-hub`：

```text
core_workspaces:
  dsh-memory-hub            root: E:\009workspace\dsh\dsh-memory-hub   # 自己的 Hub
  dsh-plugin-dev            root: E:\009workspace\dsh\dsh-plugin-dev
workspaces:
  dsh-memory-hub            core_id: dsh-plugin-dev, root: 同一目录
```

效果：

- 会话路由到 `dsh-memory-hub` 自己的 Hub；检索同时可见 `project:dsh-memory-hub`（L1）与 `project:dsh-plugin-dev`（L2，父核心既有蒸馏）。
- `scope: "core"` 回填的是**自己的**核心仓（L1）；要回填 `dsh-plugin-dev` 用 `scope: "parent"`（L2）。
- 面板知识列表对上级核心条目显示「父核心蒸馏」标签。

`core_id` 不允许指向自身；同 ID 跨 Hub 冲突时默认取自己的 Hub，可用 `core` 参数显式取上级核心。

### 金字塔扩展（多层上级）

`dsh-plugin-dev` 自己也可以是更上层核心（如 `product`）的子工作区，形成 近→远 祖先链 `[dsh-plugin-dev, product]`：

```text
workspaces:
  dsh-plugin-dev            core_id: product, root: E:\009workspace\dsh\dsh-plugin-dev
  dsh-memory-hub            core_id: dsh-plugin-dev, root: E:\009workspace\dsh\dsh-memory-hub
```

- `dsh-memory-hub` 会话可见三层：`project:dsh-memory-hub`（L1 完整记忆）→ `project:dsh-plugin-dev`（L2）→ `project:product`（L3）。
- 逐层上推用显式 `scope: "project:<上层核心>"`；`memory_status` 的 `parentCoreIds` / `ancestors` 展示完整链。
- 链最多 8 层；运行时带环检测，配置成环时自动截断并告警，不中断会话。

## 可见性

在插件子工作区中，检索和预检可见：

- `global`
- 当前子工作区 `project:<plugin-id>`
- 其核心工作区 `project:<core-id>`
- 当前子工作区 `domains` 对应的 `domain:<id>`

因此核心知识会自动进入每个插件会话的预检候选。

## 什么放核心

- DSH 官方插件 API、生命周期、配置 schema、工具注册、客户端 bundle 加载规则。
- 构建、测试、调试、发布、权限、兼容性矩阵。
- 被两个以上插件验证过的坑与规避方案。
- 可复用的模板、脚本、检查清单。

不要放：

- 单个插件的业务决策。
- 只在当前插件成立的临时 workaround。
- 尚未验证的猜测或“可能”。

## 什么放插件

- 该插件的需求、领域模型、专有约束。
- 只在当前插件成立的实现细节和决策。
- 尚未验证是否通用的踩坑记录；验证后再晋升核心。

## 回填流程

1. 在插件工作区确认原知识已 `accepted`。
2. 先 `memory_search` 核心范围，确认是否已有同类条目。
3. 调用 `memory_propose`：
   - `scope: "core"`（别名，等价于 `project:dsh-plugin-dev`）
   - `type`：硬坑用 `constraint`，操作步骤用 `process`，事实/结论用 `knowledge`
   - `tags`: `["pitfall", "plugin-dev", "<plugin-id>"]`
   - `source_refs`: 至少包含 `memory:<原id>@v<version>`，可再加 `file:` / `url:` / `session:`
   - `related`: 原知识 id
4. `memory_commit`。生产环境走 DSH 审批；本地测试模式 `policy.approval.mode=auto` 自动提交并记账 `test:auto`。
5. 其他插件下次预检即可命中核心条目。

## 去重与更新

- 核心已有同类条目时，用 `operation: "update"` + `target` + `expected_version`，不要重复 `create`。
- 旧条目会被标记 `superseded`，历史仍可追溯。
- 同一主题不要同时保留多个核心条目。

## 质量门槛

- 至少一个 `source_ref`。
- 标题能独立看懂，不依赖上下文。
- 摘要一句话说清“什么时候用 / 避免什么”。
- 核心条目只写已验证结论；未验证内容留在插件工作区。

## 面板

- 知识列表对 `project:<core-id>` 显示“核心共享”标签。
- 面板仍然只读；回填必须通过 `memory_propose` + `memory_commit`。
