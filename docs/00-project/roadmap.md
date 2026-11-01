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

## V0.1.4（未发布）

- 预检相关性门控：`policy.preflight.min_score`
- 本地优先排序：`policy.preflight.local_boost`
- 指令式包尾：先 `memory_get`，使用后 `memory_cite`，结束前 `memory_close_task`
- 面板任务行显示命中数与引用数
- 系统级 `memory-management` skill：全局注册、按需加载，覆盖检索/作用域/审批/回写/核心回填
- 44 个测试

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

## Backlog

- MCP server 形态评估
- 移动端/窄屏适配
- 国际化面板
- 与 DSH skills 集成
