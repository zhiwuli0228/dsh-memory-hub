# 夜间维护执行模型

本文描述 `memory_maintenance` 与 Host 夜间定时器的实际执行逻辑，重点覆盖多个 core workspace 时的顺序、隔离、失败和状态。决策背景见 [ADR-0005](decisions/ADR-0005-nightly-maintenance.md)，运维操作见 [06-operations/maintenance.md](../06-operations/maintenance.md)。

## 1. 组件

| 组件 | 职责 |
| --- | --- |
| `src/runtime.ts` | 打开每个 core hub；启动一个全局定时器；按顺序把每个 pack 交给 service；写全局状态 |
| `src/service.ts` | 单个 Hub 的维护编排：分析、创建 pending、写报告、去重 |
| `src/maintenance.ts` | 确定性分析：重复、晋升候选、过期/未引用/诊断/作用域检查；报告渲染 |
| `src/maintenance-schedule.ts` | 本地日期与 `HH:mm` 判断 |
| `src/tools.ts` | `memory_maintenance` 模型工具定义 |
| `src/config.ts` | `policy.maintenance` schema 与默认值 |

维护是 Host 内部能力，不经过 DSH `schedule` 服务，也不依赖任何会话。

## 2. 启动与多 core 路由

`MemoryRuntime.start()` 读取全局 `config.yaml`：

- 每个带 `root` 的 `core_workspaces[]` 打开一个独立 Hub，形成 `cores: Map<coreId, ServicePack>`；
- `fallback` 是全局配置 Hub（默认 `~/.dsh/memory-hub` 或 `$DSH_HOME/memory-hub`）；
- 子工作区通过 `core_id` 挂在所属 core 下，不是独立 pack；
- 会话路由按工作目录最长前缀匹配，但**维护不使用会话路由**：定时器直接遍历所有 pack。

没有 `root` 的 core 不打开独立 Hub，也不参与定时巡检。

## 3. 一次定时执行的顺序

```text
每 60 秒 tick
  → enabled?
  → local HH:mm >= time?
  → 今天已跑?（内存 + maintenance-state.json）
  → packs = 所有 core（配置顺序） + fallback
  → 去重相同 root
  → for pack of packs:
        await pack.service.maintenance({ admin: true, coreId: pack.coreId, ... })
        try/catch：单 core 失败只记 warning，继续下一个
  → 写 maintenance-state.json（lastRunDate = 今天）
```

### 3.1 串行，不是并行

核心循环是 `for...of` + `await`，没有 `Promise.all`。

| 特性 | 当前行为 |
| --- | --- |
| core 之间 | 串行；一个完成才下一个 |
| core 顺序 | `core_workspaces[]` 配置顺序，fallback 最后 |
| 子工作区 | 不单独跑；在所属 core 的这一轮中分析 |
| 并发保护 | `maintenanceRunning` 阻止重叠巡检 |
| 单 core 失败 | 捕获后继续下一个 core |
| 总耗时 | 各 core 之和；慢 core 会拖慢后面 |

### 3.2 每个 core 的独立产出

每个 `pack.service.maintenance()` 只操作自己的 Hub：

- 报告：`<core-root>/reports/<timestamp>.md` 和 `latest.md`；
- pending：`<core-root>/pending/PRO-*.md`；
- 晋升目标：该 core 的 `project:<core-id>`；
- 去重：该 Hub 内 pending 的 `maint-<hash>` 标签或 `promoted_from`；
- `max_proposals`：每个 core 各自的上限，总候选数可能为 `core 数 × max_proposals`。

子工作区之间不互相晋升；A core 下的子工作区不会晋升到 B core。

## 4. 状态与失败

状态文件只有一个：

```text
<configHub-root>/records/maintenance-state.json
{
  "lastRunDate": "2026-11-01",
  "completedAt": "2026-11-01T15:29:48.556Z"
}
```

行为：

- 当天已跑过：后续 tick 直接返回；
- Host 在 03:00 前启动：等到 03:00；
- Host 在 03:00 后启动：当天未跑则补跑一次；
- 某个 core 失败：记录 warning，继续其他 core；整轮结束后仍写当天日期，失败 core 当天不会自动重试，下一次重试要等下一个本地日期；
- 进程在循环中崩溃：状态未写入，下一次启动会重新跑整轮；已有 pending 由指纹去重，不会重复创建；
- 状态写入失败：记录 warning；内存里的 `maintenanceLastDate` 仍阻止当天重复。

## 5. 报告内容

每份报告包含：

- Summary：knowledge / accepted / pending / issues / candidates / created / skipped / max；
- Workspaces：该 core 下每个工作区的 accepted / pending 数；
- Created proposals：本轮创建的候选 ID、operation、scope、标题；
- Issues：按 code 分组，最多每组展示 20 条；
- Guardrails：报告不是权威知识、没有 commit/delete/rewrite。

Issue code：

| code | 含义 | 是否生成提案 |
| --- | --- | --- |
| `duplicate-exact` | 类型 + 标题 + 摘要 + 正文哈希完全一致 | 是，deprecate |
| `duplicate-near` | 标题高度相似（bigram Jaccard ≥ 0.82） | 否，只报告 |
| `promotion-candidate` | 子工作区知识带复用标签 | 是，晋升到所属 core |
| `stale-pending` | pending 超过 `stale_pending_days` | 否 |
| `uncited` | accepted 超过 `stale_citation_days` 未被引用 | 否 |
| `load-diagnostic` | 索引加载诊断 | 否 |
| `oversized-body` | 正文超过 `max_body_bytes` | 否 |
| `scope-mismatch` | `project:<id>` 不在已注册工作区 | 否 |

## 6. 配置语义

```yaml
policy:
  maintenance:
    enabled: false
    time: '03:00'
    apply: propose
    all_cores: true
    max_proposals: 10
    stale_pending_days: 30
    stale_citation_days: 90
```

| 配置 | 语义 |
| --- | --- |
| `enabled` | 定时器是否执行；`false` 时 tick 直接返回 |
| `time` | 本地时间 `HH:mm`；不做时区转换，使用 Host 本地时区 |
| `apply` | `report` 只写报告；`propose` 额外创建 pending |
| `all_cores` | `true`：所有 core + fallback；`false`：**定时器只跑 fallback**（当前限制） |
| `max_proposals` | 每个 core 最多创建的候选数，1..20 |
| `stale_pending_days` | pending 过期报告阈值 |
| `stale_citation_days` | 未引用报告阈值 |

手动工具的 `all_cores` 语义不同：`false` 表示只跑当前工作区对应的 pack；`true` 表示全部 core + fallback。手动调用还要求当前工作区 `admin: true`。

## 7. 与官方「自动化任务」的区别

| | 官方自动化任务 | 夜间维护 |
| --- | --- | --- |
| 来源 | DSH `schedule` 服务 | 插件内部定时器 |
| 绑定会话 | 是 | 否 |
| 官方栏可见 | 是 | 否 |
| 可暂停/编辑/立即运行 | 是（官方 UI） | 改 `config.yaml` |
| 每次触发模型回合 | 是 | 否 |
| 运行记录 | 官方 schedule 记录 | `reports/` + state + Host 日志 |

因此维护任务不会出现在官方「自动化任务」栏；这是有意选择，不是遗漏。

## 8. 安全边界

- 不调用 `memory_commit`；
- 不删除、不改写 `knowledge/` 正文；
- 不自动提升到 `global`；晋升上限是所属 core；
- 报告和 pending 都不是权威知识；
- 手动工具要求 admin；定时器内部运行不绕过人工 commit，因为根本不 commit。

## 9. 当前已知限制

- 一个 core 失败不会当天重试；
- 没有全局合并报告；
- `all_cores: false` 的定时器语义不直观；
- 报告不自动清理；
- 依赖 Host 运行；
- 精确重复判断保守，长期可能没有候选；
- 语义合并、自动废弃未引用知识尚未实现。
