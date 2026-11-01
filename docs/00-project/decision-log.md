# Decision Log

按日期记录会影响后续实现的决策、改动和已知限制。详细论证在对应 ADR / 设计 / 提案中，本文件负责“查得到、追得回”。

## 2026-11-01

### 决策

| ID | 决策 | 状态 | 追踪 |
| --- | --- | --- | --- |
| D1 | 系统级记忆规范通过 Host `skills` 服务注册，正文按需加载，不占每轮上下文 | Accepted | [ADR-0004](../01-architecture/decisions/ADR-0004-system-level-memory-skill.md) |
| D2 | skill 使用产品自有名 `memory-hub`，不使用通用名 `memory-management`；用测试锁定官方名称快照，避免 runtime 静默遮蔽 bundled | Accepted | [ADR-0004](../01-architecture/decisions/ADR-0004-system-level-memory-skill.md)、[context-policy](../02-harness/context-policy.md) |
| D3 | 夜间维护采用“只读巡检 + pending 提案”（方案 2），不自动整理 | Accepted | [ADR-0005](../01-architecture/decisions/ADR-0005-nightly-maintenance.md) |
| D4 | 夜间调度使用插件内部 Host 定时器，不创建 DSH `schedule` 任务；因此不出现在官方「自动化任务」栏 | Accepted | [ADR-0005](../01-architecture/decisions/ADR-0005-nightly-maintenance.md)、[maintenance](../01-architecture/maintenance.md) |
| D5 | 多个 core 使用一个全局定时器，按 `core_workspaces[]` 顺序串行执行，fallback 最后 | Accepted | [maintenance](../01-architecture/maintenance.md) |
| D6 | 每个 core 独立写 `reports/` 和 `pending/`；只有一个全局 `maintenance-state.json`；单 core 失败不阻塞其他 core，但当天不单独重试 | Accepted | [maintenance](../01-architecture/maintenance.md) |
| D7 | 只有精确重复（类型 + 标题 + 摘要 + 正文哈希一致）生成 deprecate pending；只有显式 `core` / `shared` / `reusable` / `promote` 标签生成 core 晋升 pending；其余只报告 | Accepted | [proposal-maintenance](../03-openspec/proposal-maintenance.md) |
| D8 | `memory_maintenance` 手动调用要求 admin 工作区；定时器由 Host 内部以 `admin: true` 运行，但永不 commit | Accepted | [maintenance](../01-architecture/maintenance.md) |
| D9 | `all_cores: false` 的定时器当前只跑 fallback；手动工具则是“只跑当前 pack”。这是已知语义差异，暂不修改 | Accepted as limitation | [maintenance](../01-architecture/maintenance.md#6-配置语义) |
| D10 | 本机启用夜间维护：`enabled: true`、`time: '03:00'`、`apply: propose`、`all_cores: true`；`approval.mode` 暂时保持 `auto`（测试遗留） | Active | [current-state](current-state.md)、[COMPATIBILITY](../COMPATIBILITY.md) |
| D11 | 保持当前方案：继续使用插件内部定时器，不改为官方 `schedule`；若未来需要官方栏可见/可暂停，再单独评估并记录取舍 | Accepted | 本文件、[ADR-0005](../01-architecture/decisions/ADR-0005-nightly-maintenance.md) |
| D12 | 公共目录提交走 `awesome-dsh-plugin` 的 PR（每插件一个 `data/plugins/*.yml`），不使用不存在的“官方上传接口”；`dsh.so` 是独立社区目录，另行选择 | Active | [catalog-submission](../06-operations/catalog-submission.md)、[PR #11187](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11187) |

### 代码与行为改动

| 改动 | 结果 |
| --- | --- |
| 新增 `memory_maintenance` 工具 | 工具总数 9 → 10；支持 report / propose、all_cores、max_proposals、stale 阈值 |
| 新增 `src/maintenance.ts` | 精确重复、近似重复、晋升候选、过期 pending、未引用、加载诊断、超长正文、作用域异常 |
| 新增 `src/maintenance-schedule.ts` | 本地日期 / `HH:mm` / 到点判断 |
| 新增夜间定时器 | 单全局定时器；03:00；当天一次；错过后下次启动补跑；`maintenanceRunning` 防重入 |
| 新增报告 | 每个 core `reports/<timestamp>.md` + `latest.md` |
| 新增状态 | `records/maintenance-state.json` |
| 新增配置 | `policy.maintenance.*`，默认关闭；本机已开启 |
| 面板能力 | 「能力」页 9 → 10 个工具，加入维护说明 |
| 测试 | 45 → 53 个测试，10 个文件；新增维护分析、去重、晋升、report-only、非 admin、时间判断 |
| 文档 | 新增 ADR-0004/0005、维护架构与操作手册、本决策日志；更新 current-state、COMPATIBILITY、README、DESIGN、storage contract 等 |

相关提交：

- `119901f feat: add deterministic nightly memory maintenance`
- `79fadf5 docs: record maintenance smoke-test pending state`
- `0e5d765 docs: record nightly maintenance decisions and operations`
- tag `v0.1.4`：npm `dsh-memory-hub@0.1.4` + GitHub Release `v0.1.4`

### 验证结果

- `npm run check`：typecheck + build + 53 个测试通过。
- 宿主重载后 `memory_status.policy.maintenance` 显示 `enabled: true`、`time: "03:00"`、`apply: "propose"`。
- `memory_maintenance({ apply: "report" })` 扫描 `product`、`dsh-plugin-dev`、fallback，分别写报告；13 条 accepted、0 候选。
- 夜间定时器在 23:29 因“当天未跑且已过 03:00”补跑一次，写 `maintenance-state.json`（`lastRunDate: 2026-11-01`）；没有提交或删除任何知识。
- 当前 Hub：13 条 accepted、1 条 pending `PRO-000016`（本次设计决策候选）。
- `v0.1.4` 已在 GitHub Actions 上发布：npm `0.1.4` 可查，provenance predicate 为 SLSA v1；Release 附件 `dsh-memory-hub-0.1.4.tgz` 已生成。

### 已知限制 / 后续

- Host 必须在 03:00 运行；整晚关闭则不会执行。
- 一个 core 失败当天不重试。
- 没有全局合并报告。
- 报告不自动清理。
- 不做语义合并、不自动废弃未引用知识。
- 官方「自动化任务」栏不可见；如需可见、可暂停/编辑，需要改用 DSH `schedule`，代价是会话和模型回合。
- 当前 `approval.mode: auto` 是测试遗留；维护本身不 commit，但若要求严格人工审批，应改回 `manual`。
