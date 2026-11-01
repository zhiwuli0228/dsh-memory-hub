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
