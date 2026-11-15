# Tool Surface

> 工具面契约。回答：**20 个原生工具里，哪些要跨宿主暴露、怎么命名、在哪一层实现、写操作怎么被拦住。**
>
> 2026-11-14 新建。配套：[harness-standard.md](harness-standard.md) §6、[host-capability-matrix.md](host-capability-matrix.md)。

---

## 1. 现有原生工具（DSH，20 个）

| 工具 | 类别 | 是否暴露到 MCP | 说明 |
| --- | --- | --- | --- |
| `memory_search` | 读 | ✅ | 关键词/语义检索，返回 ID/标题/摘要/作用域 |
| `memory_get` | 读 | ✅ | 按 ID 取摘要 + 小节目录；`section` 取单节；`full` 取全文 |
| `memory_status` | 读 | ✅ | 诊断：初始化、只读、锁、索引；挂载点字段（`mounts.*`）待实现，当前仅 `clientModules` 有 `advertised` |
| `memory_preflight` | 读 | ⚠️ 可选 | 手动刷新预检；T1 宿主没有自动预检时，这是"我想要注入"的替代 |
| `memory_duplicates` | 读 | ❌ | 维护用途，MCP 暴露会诱导模型乱合并 |
| `memory_reflect` | 读 | ⚠️ 可选 | 回顾历史会话；依赖宿主能提供会话源，T1 多数不可用 |
| `memory_scenario_list` | 读 | ❌ | 派生索引，属维护视图 |
| `memory_cite` | 写（轻） | ✅ | 记录"用了哪条"，不自批、不改知识 |
| `memory_propose` | 写（候选） | ✅ | 产出 `pending/` 候选 |
| `memory_commit` | **写（需人批）** | ⚠️ 视宿主审批 | 见 §4 |
| `memory_close_task` | 写（轻） | ✅ | 任务收尾评估 |
| `memory_maintenance` | 写（报告） | ❌ | 只写报告与候选；管理用途 |
| `memory_consolidate` | 写（候选） | ❌ | 需要 admin 身份，不适合模型随手调 |
| `memory_remote_status` | 读 | ⚠️ 可选 | 多厂商远端诊断：角色、能力、逐 provider 的不可用原因、outbox/孤儿计数；`probe:true` 才联网体检 |
| `memory_remote_sync` | 写（候选/分发） | ⚠️ 可选 | 手动同步：pull 只生成 pending 候选（绝不 commit）、push 镜像 accepted（失败进 outbox）；**forget 不在 sync 里** |
| `memory_remote_forget` | 写（传播） | ⚠️ 视宿主审批 | 作废传播（受 forget 开关 + max_per_run 控制）/ 人工显式遗忘（`knowledge_id`）；`dry_run` 零副作用预演；无删除能力的 provider 记孤儿而非假装成功 |
| `memory_tencent_status` | 读 | ❌ | 单厂商兼容入口，已被 `memory_remote_status` 覆盖 |
| `memory_tencent_pull` | 写（候选） | ❌ | 旧的单厂商拉取；多厂商用 `memory_remote_*`（待实现） |
| `memory_tencent_push` | 写（分发） | ❌ | 旧的单厂商分发；多厂商用 `memory_remote_*`（待实现） |
| `memory_scenario_rebuild` | 写（派生） | ❌ | 可删可重建，管理用途 |

**暴露原则**：MCP 面只放**模型在正常任务中会需要**的工具。维护类工具留在 DSH 原生 / CLI——它们是给人跑的，不是给模型在对话里随手跑的。

## 2. 命名

- 跨宿主保持 `memory_*` 前缀与**同一语义**。不做 `memoryhub.search` / `memory_search` 双份。
- MCP 工具名按各宿主规范映射（多数用 `memory_search` 原名；若宿主有冲突再加服务前缀，**不加语义前缀**）。
- **禁止**同一语义两个名字。若某宿主必须改名，在 `tool-surface` 表里记一行映射，并在 glue 里写注释说明原因。

## 3. 三层分工

```text
core        service.search() / service.get() / service.propose() …
              ↑ 唯一业务实现
transport   MCP tool handler ─┐
            HTTP route ───────┼─→ 只做参数校验 + 错误翻译 + 形状转换
            CLI subcommand ───┘
host-glue   DSH tool 注册（复用同一 handler）
```

**硬规则**：一个工具的业务逻辑只允许出现在 `core`。glue 与 transport 里出现"如果 scope 是 X 则……"这类判断即为违规。

## 4. 写操作与审批

| 操作 | DSH | 有原生审批的宿主 | 无原生审批（T0/T1） |
| --- | --- | --- | --- |
| `propose` | 直接执行（产出候选） | 直接执行 | 直接执行 |
| `commit` | `tools/pre-execute` 拦成 `ask` | 映射到宿主权限提示 | **失败关闭**：返回"需要人工批准"，指引用 `memory-hub inbox --approve` |
| `cite` / `close_task` | 直接执行 | 直接执行 | 直接执行 |

三条不可协商：

1. **不提供"跳过审批"参数**。没有 `force`、没有 `auto_approve`、没有环境变量开关。
2. **失败关闭**（fail-closed）：无审批能力时 `commit` 必须失败，不能降级为"先写进去"。这是不变量 2 的运行时体现。
3. **`policy.approval.mode: auto` 只允许在测试中使用**，账本记 `test:auto` 并打 warning；发布配置默认 `manual`。

## 5. 错误语义

跨宿主统一四种，不允许 transport 层自创：

| 错误 | 含义 | 模型应如何反应 |
| --- | --- | --- |
| `NOT_FOUND` | ID 不存在 / 已被 supersede | 改查 `memory_search` |
| `INVALID_INPUT` | 参数不合法（scope 越权、类型错） | 修正参数，不要重试同一次调用 |
| `READ_ONLY` | 写锁被其他进程持有 / 显式只读 | 告知用户"另一进程持有写锁"，不要重试 |
| `APPROVAL_REQUIRED` | 需要人批 | 停下来，指引审批路径 |

`READ_ONLY` 与 `APPROVAL_REQUIRED` 必须**可区分**：一个是并发问题，一个是被设计拦住，混在一起会让人误以为"插件坏了"。

## 6. CLI 面（与工具面对齐）

```text
memory-hub search <query> [--limit 5] [--scope project] [--json]
memory-hub get <ID> [--section <name>] [--full]
memory-hub status [--json]
memory-hub inbox [--approve <ID>...] [--reject <ID>...]
memory-hub serve [--port 7331|0]
memory-hub mcp
```

约束：

- **CLI 与 MCP 共用同一份 service 调用**，不各写一套。
- `--json` 输出与 MCP 返回结构**字段同名**，便于脚本与 agent 互换。
- `inbox --approve` 是人在终端敲的动作，账本记 `cli:human`。

## 7. MCP 暴露集合（建议初版 8 个）

```text
memory_search · memory_get · memory_status · memory_cite
memory_propose · memory_commit * · memory_close_task · memory_preflight
```

`*` 需宿主审批；无审批则返回 `APPROVAL_REQUIRED`。

**为什么是 8 个而不是 20 个**：工具数量的边际成本很高——每个工具都要占 schema 预算、都增加模型选错的概率。维护类、厂商类、派生类工具不该进对话面。

后续若证实模型确实需要（例如 T1 下 `memory_reflect` 是唯一的历史入口），再逐个加，并更新本表。

## 8. 兼容性

- 现有 20 个原生工具**名字与语义不变**；`memory_tencent_*` 未来作为 `memory_remote_*` 的别名保留一个版本周期。
- MCP 首次发布只暴露 §7 的 8 个，其余保持原生-only。破例需要一条记录在案的证据（真实使用中模型明确缺它）。
