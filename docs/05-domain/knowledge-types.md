# Knowledge Types

DSH Memory Hub 支持九类知识。

## 类型表

| 类型 | 前缀 | 用途 | 示例 |
| --- | --- | --- | --- |
| `decision` | `DEC` | 已做出的选择与理由 | 缓存广播使用版本号而不是时间戳 |
| `constraint` | `CON` | 不可违反的边界 | 渲染进程不得直接访问磁盘 |
| `knowledge` | `KNO` | 已确认的事实/机制 | 构建产物落在 `.dsh/build` |
| `api-catalog` | `API` | 接口、命令、协议清单 | `memory_hub.search()` 参数表 |
| `process` | `PRC` | 可复现的流程/步骤 | 发布前必须跑 `pnpm check` |
| `open-questions` | `OQ` | 未决问题与待验证假设 | 是否需要支持多实例？ |
| `runtime-base` | `RUN` | 环境、版本、部署前提 | Windows 11 + Node 24 |
| `playbooks` | `PLAY` | 排障/操作手册 | DSH 起不来时的三步排查 |
| `assets` | `AST` | 外部资产的索引 | 设计稿与截图位置 |

## 证据要求

以下类型提交时必须至少一条 `source_refs`：

- `decision`
- `constraint`
- `process`
- `api-catalog`
- `runtime-base`
- `playbooks`

## 特殊规则

- `open-questions` 永远不能自动变成 `accepted`；它只能被新的证据替换或关闭。
- `assets` 主要记录外部资源位置，正文可短。
- `knowledge` 用于一般性事实，证据要求视内容而定。

## 状态机

```text
candidate ──批准──► accepted ──被新决策取代──► superseded
    │                   │
    └──拒绝──► rejected  └──显式废弃──► deprecated
```

只有 `accepted` 参与默认检索；其余状态保留可查。
