# Golden set 基线（2026-11-15）

- hub: `E:\009workspace\dsh\dsh-plugin-dev` · golden 条目 20（跳过 0）· K=5 · dsh-memory-hub@0.7.1
- **hit@1 = 19/20（95.0%）** · hit@5 = 19/20（95.0%）
  - 身份 dsh-plugin-dev：9/9 @1 · 9/9 @5
  - 身份 dsh-memory-hub：10/11 @1 · 10/11 @5

| 引用 | ID | 身份 | hit | 标题 |
| ---: | --- | --- | --- | --- |
| 13 | PRC-000003 | dsh-plugin-dev | 1 | 插件发布 checklist：版本、构建、Trusted Publisher、Release、市场索引 |
| 12 | KNO-000002 | dsh-plugin-dev | 1 | npm 发布与 DSH 插件市场注册：实战踩坑 |
| 6 | PRC-000001 | dsh-plugin-dev | 1 | DSH 插件本地开发循环：构建 → 重启（Host）→ 强刷（Client）→ 验证 |
| 6 | KNO-000007 | dsh-memory-hub | 1 | Hermes Agent 记忆架构拆解与可借鉴项 |
| 5 | API-000004 | dsh-plugin-dev | 1 | DSH 系统级 Skill：ctx.skills.register 与按需加载 |
| 5 | KNO-000003 | dsh-plugin-dev | 1 | 预检运行不等于被使用：采用率诊断与修复 |
| 4 | KNO-000006 | dsh-memory-hub | 1 | 派生 SQLite 索引的依赖与运行成本（已上线） |
| 4 | KNO-000028 | dsh-memory-hub | 1 | 腾讯 Agent Memory 桥（tencent-bridge）工程结论 |
| 3 | KNO-000001 | dsh-plugin-dev | 1 | DSH 插件开发常见坑（持续更新） |
| 3 | PRC-000002 | dsh-plugin-dev | 1 | 插件踩坑回填核心：检查清单 |
| 3 | API-000003 | dsh-plugin-dev | 1 | DSH 客户端插件：client.js、__ModuleLoader__ 与 rev 缓存 |
| 3 | DEC-000002 | dsh-memory-hub | 1 | 本仓预检启用相关性门控与本地优先 |
| 3 | DEC-000005 | dsh-memory-hub | 1 | 多年积累 Hub 的兼容性契约与规模分档 |
| 2 | DEC-000003 | dsh-memory-hub | 1 | 记忆中枢注册系统级 memory-hub skill |
| 2 | KNO-000004 | dsh-plugin-dev | 1 | jsDelivr @main 分支缓存滞后：市场索引更新要用 commit-pinned URL 验证 |
| 2 | KNO-000020 | dsh-memory-hub | 1 | 派生 SQLite 检索索引的取舍：FTS5 预分词取候选 + JS 精排 |
| 2 | DEC-000010 | dsh-memory-hub | ✗ | 写锁按 hub 根独立降级，不跨根级联 |
| 2 | KNO-000021 | dsh-memory-hub | 1 | 真实环境跑腾讯桥的三个坑与修法（apiKeyEnv/会话任务/同进程锁） |
| 2 | DEC-000016 | dsh-memory-hub | 1 | 路线重排：M5 提前、M4b 收窄、V0.8 MCP 跨宿主为下一主线 |
| 1 | DEC-000001 | dsh-memory-hub | 1 | 本地测试：自动提交模式 |

> query 由标题反推（乐观上界）。改检索前后各跑一次对比；golden 集人工化后此上界会下修。
