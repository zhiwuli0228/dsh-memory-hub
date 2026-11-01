# Tasks Rule

任务拆分应小到可执行、可验证。

## 拆分原则

- 每个任务聚焦一个产出。
- 每个任务有明确验收标准。
- 优先端到端可运行的小切片。

## 任务模板字段

- 编号
- 标题
- 目标
- 依赖
- 验收标准
- 相关文件

## 示例

```markdown
## T-001 新增 core_id 字段

- 目标：workspace 配置支持 core_id 指向 core_workspaces。
- 依赖：config schema 已支持 core_workspaces。
- 验收：
  - `config.yaml` 可解析 `workspaces[].core_id`
  - zod 校验通过
  - 面板配置标签页显示层级
  - 测试覆盖
```

## 更新

每完成一个任务，更新任务列表和 `docs/00-project/current-state.md`。
