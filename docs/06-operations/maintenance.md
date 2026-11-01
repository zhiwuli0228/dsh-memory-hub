# 夜间维护操作手册

维护的架构与顺序见 [01-architecture/maintenance.md](../01-architecture/maintenance.md)，决策见 [ADR-0005](../01-architecture/decisions/ADR-0005-nightly-maintenance.md)。

## 1. 开启与关闭

配置在全局 Hub 的 `config.yaml`：

```yaml
policy:
  maintenance:
    enabled: true
    time: '03:00'
    apply: propose
    all_cores: true
    max_proposals: 10
    stale_pending_days: 30
    stale_citation_days: 90
```

- 修改后由配置 watcher 热加载；定时器始终存在，每次 tick 读取 `enabled`，通常不需要重载插件。
- 关闭：把 `enabled` 改为 `false`。
- 暂停一天：当天把 `enabled` 设为 `false`，次日再打开；或在 03:00 前关闭 Host。
- 只生成报告、不生成候选：`apply: report`。

## 2. 每天上班后的检查顺序

1. 看每个 core 的最新报告：
   ```text
   <core-root>/reports/latest.md
   ```
   例如当前机器：
   ```text
   E:\009workspace\dsh\dsh-plugin-dev\reports\latest.md
   E:\009workspace\dsh\dsh-memory-hub\dsh-memory-hub\reports\latest.md
   C:\Users\18811\.dsh\memory-hub\reports\latest.md
   ```
2. 看 `Summary`：`knowledge`、`pending`、`issues`、`candidates`、`proposals created`。
3. 看 `Issues`：
   - `duplicate-exact`：已有 deprecate pending，优先处理；
   - `duplicate-near` / `uncited` / `stale-pending`：只报告，人工判断；
   - `load-diagnostic`：先修 YAML / frontmatter；
   - `scope-mismatch`：检查 `project:<id>` 是否已注册。
4. 打开记忆中枢面板「待审批」，逐条查看候选；需要时 `memory_get` 读全文。
5. 认可后再 `memory_commit`；维护任务本身不会提交。
6. 不需要的候选可以保留或按流程拒绝；不要直接删 `knowledge/`。

## 3. 手动触发

在 **admin 工作区**（当前机器是 `dsh-memory-hub` 子工作区）调用：

```json
memory_maintenance({ "apply": "report", "all_cores": true })
```

或：

```json
memory_maintenance({ "apply": "propose", "all_cores": true, "max_proposals": 10 })
```

- `all_cores: true`：全部 core + fallback；
- `all_cores: false`：只跑当前工作区对应的 pack；
- 非 admin 会返回 `SCOPE_FORBIDDEN`；
- 工具输出包含每个 hub 的 `reportPath`、`created`、`issues`、`errors`。

## 4. 状态与幂等

- 定时器状态：`<configHub-root>/records/maintenance-state.json`
  ```json
  { "lastRunDate": "2026-11-01", "completedAt": "..." }
  ```
- 同一天只跑一次；错过后下一次 Host 启动补跑。
- 同一指纹已有 pending 时跳过；指纹标签形如 `maint-<sha256-12>`。
- 手动触发不会修改定时器状态；两者互不冲突。

## 5. 常见问题

### 没有生成报告

按顺序检查：

1. `policy.maintenance.enabled` 是否为 `true`；
2. 当前时间是否已过 `time`（本地时区）；
3. `maintenance-state.json` 是否已经是今天；
4. Host 是否在 03:00 时运行；关闭则下次启动补跑；
5. Host 日志是否有 `dsh-memory-hub: scheduled maintenance`；
6. 对应 core 的 root 是否可写、是否只读；
7. 该 core 是否配置了 `root`（没有 root 不参与独立 Hub 巡检）。

### 只有一个 core 没有报告

- 单 core 失败只记 warning，不阻塞其他 core；
- 失败 core 当天不会自动重试；第二天再跑，或手动 `memory_maintenance`；
- 检查 Host 日志中的 `scheduled maintenance failed for <core>`。

### 候选太多

- 降低 `max_proposals`（例如 3～5）；
- 检查是否给大量子工作区知识加了 `reusable` 标签；
- 精确重复是保守规则，通常不会爆量；
- 近似重复只报告，不会自动创建候选。

### 为什么官方「自动化任务」栏没有它

这是插件内部定时器，不是 DSH `schedule` 任务；不会出现在官方栏，也没有官方的暂停/编辑/立即运行。控制入口是 `config.yaml`。

### 报告越来越多

`reports/` 不是权威数据，可定期归档或删除旧报告；保留 `latest.md` 即可。当前没有自动清理。

### 审批模式是 auto

`policy.approval.mode: auto` 只影响 `memory_commit`，不影响维护本身的“只生成 pending”。如果希望第二天必须人工确认，建议把 approval 改回 `manual`；维护任务本身永远不会自动 commit。

## 6. 回滚

1. 设 `policy.maintenance.enabled: false`；
2. 不需要的 pending 保留或按流程拒绝；
3. 报告可删除；
4. 若怀疑候选质量，先不要 commit，保留报告和 pending 作为证据；
5. 不要删除 `knowledge/` 或 `records/` 来“重置”维护状态。
