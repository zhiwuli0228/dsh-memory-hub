# Module Boundaries

`src/` 下的模块按职责分层，禁止跨层依赖。

## `src/index.ts`

插件入口。

- 导出 `name`、`inject`、`apply`。
- 初始化 Cordis 插件生命周期。
- 不应包含业务逻辑。

## `src/runtime.ts`

DSH 适配层。

- 注册事件监听：`agent/created`、`agent/pre-step`、`agent/turn-stopping`、`agent/disposed`。
- 注册工具：`ctx.tools.register(...)`。
- 注册上下文提供者：`memory:pack`。
- 实现 Web 面板回环路由。
- 协调 service 完成预检、门禁、关闭、汇总、维护。
- 管理夜间维护定时器、逐 core 串行调度、`maintenance-state.json`。
- 不应直接读写知识文件；通过 service/storage 完成；维护状态与报告是例外。

## `src/service.ts`

应用服务层。

- 实现 `preflight`、`gate`、`cite`、`propose`、`close`、`consolidate`、`maintenance`、`status` 等业务流程。
- 组合 store/search/scope/ledger 完成高层操作。
- 维护流程负责单个 Hub 的分析、候选去重、报告写入。
- 不直接依赖 DSH API。

## `src/store.ts`

存储仓库层。

- 读写知识 Markdown 文件。
- 管理 pending/archive/history 目录。
- 提供 `loadKnowledge`、`saveKnowledge`、`archivePending` 等原子操作。
- 不直接依赖 DSH API。

## `src/ledger.ts`

JSONL 账本。

- 追加记录任务、预检、引用、提案、提交、汇总等事件；维护候选复用 `proposal.created`。
- 提供回放接口。
- 保证 fsync。

## `src/search.ts`

本地检索。

- CJK unigram/bigram 分词。
- 内存倒排索引。
- BM25-lite 排序。
- 支持关键词、类型、作用域、状态过滤。

## `src/frontmatter.ts`

Markdown/YAML frontmatter 解析与序列化。

- 解析知识文件。
- 校验必填字段。
- 保留未知字段。

## `src/maintenance.ts`

确定性维护分析。

- 精确重复（类型 + 标题 + 摘要 + 正文哈希）分组。
- 近似标题检测、晋升候选、过期 pending、未引用、加载诊断、超长正文、作用域异常。
- 生成 `ProposalInput` 和 Markdown 报告。
- 不直接写 store；由 service 调用 `store.propose`。
- 不做语义合并，不调用 `memory_commit`。

## `src/maintenance-schedule.ts`

维护时间判断。

- 本地日期键 `YYYY-MM-DD`。
- 本地时间键 `HH:mm`。
- 到点判断；不做时区转换。

## `src/config.ts`

配置加载与校验。

- `config.yaml` 解析。
- zod schema 校验。
- 热加载支持。
- `policy.maintenance` 默认关闭；`time` 为本地 `HH:mm`。

## `src/hub.ts`

Hub 目录管理。

- 根目录解析（`root` → `$DSH_HOME/memory-hub` → `~/.dsh/memory-hub`）。
- 目录初始化。
- 路径安全校验。

## `src/scope.ts`

作用域与可见性。

- `global` / `domain:<id>` / `project:<workspace-id>` 解析。
- 可见集合计算。
- `memory_get` 作用域校验。

## `src/lock.ts`

单写者锁。

- 文件锁创建/释放。
- 只读降级。

## `src/atomic.ts`

原子文件写入工具。

- 临时文件 + 重命名，保证写入原子性。
- Windows 句柄友好。

## `src/tools.ts`

工具定义。

- 仅 schema 和适配，不含业务逻辑。
- 调用 service 完成实际工作。

## `src/types.ts`

共享 TypeScript 类型。

## `src/errors.ts`

错误码与可恢复错误。

## `src/ids.ts`

ID 生成：TSK、PRO、DEC、CON、KNO 等；维护任务使用 `MAINT-*` 作为合成 taskId。

## `src/time.ts`

时间格式化工具。

## 依赖方向

```text
runtime.ts  →  service.ts  →  store.ts / ledger.ts / search.ts
                ↑                    ↑
          config.ts / hub.ts / scope.ts / lock.ts
                               maintenance.ts  →  types.ts
                               maintenance-schedule.ts
```

`maintenance.ts` 只做纯分析并接收 `KnowledgeStore` 的只读视图；不写文件，不依赖 DSH API。

禁止：

- `store.ts` 调用 `runtime.ts` 中的 DSH API。
- `search.ts` 直接读取 Markdown 文件（由 store 提供内容）。
- 业务层 import DSH 类型。
