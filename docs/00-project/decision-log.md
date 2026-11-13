# Decision Log

按日期记录会影响后续实现的决策、改动和已知限制。详细论证在对应 ADR / 设计 / 提案中，本文件负责“查得到、追得回”。

## 2026-11-13

### 决策

| ID | 决策 | 状态 | 追踪 |
| --- | --- | --- | --- |
| D17 | 写锁从“永久所有权标记”改为**租约**：心跳 15s，租约 = `heartbeatAt + storage.lock_stale_ms` | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D18 | 放弃 ADR-0006 的“本机活进程即使挂起也不抢占”：pid 不存在立即回收，心跳超租约也可回收（挂死/假死/PID 复用） | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)，修订 [ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md) 决策 3 |
| D19 | 用 fencing token 保证租约安全：锁文件带随机 `token`，每次写操作前复核；被抢的旧写者降级为只读而不是双写 | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D20 | 回收用 CAS（rename + 复核 `{token, heartbeatAt}`），两个回收者不会同时赢；文件 mtime 不参与存活判定 | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D21 | 写入口惰性自愈：`KnowledgeStore.assertWritable()` 改异步并调用 `Hub.ensureWritable()`，被降级的根在对方退出后自动重抢，不需重启或手动删锁 | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D22 | `readOnly` 是缓存判断而非事实：新增 `Hub.revalidateLock()`，在 `status()` / `overview()` / `config()` 与 60s 运行时巡检里同步重读锁文件并修正内存标志（解决“pid 没了、锁文件也没了、`memory_status` 还只读”） | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D23 | 区分“锁文件消失”与“被他人接管”：消失只丢句柄并保持可写（根空闲），`token` 变了才降级只读；避免用户手动删锁把活 Hub 锁死 | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D24 | pid 存活判定改为三态 `alive`/`dead`/`unknown`：只有 `ESRCH` 才算 `dead-process` 立即回收；`EPERM`（Windows 对已退出 pid 也可能返回）交给心跳仲裁，宽限 `min(lock_stale_ms, 60s)`——健康写者每 15s 心跳不会被抢，死写者约 1 分钟恢复 | Accepted | [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) |
| D25 | 面板每 30s 只轮询 overview 的只读切片（`readOnly`/`readOnlyReason`/`lock`），签名不变不重渲染，失败保留旧数据；面板不再停在打开那一刻的只读横幅 | Accepted | `client.js`、`tests/client.test.ts` |

### 代码与行为改动

| 改动 | 结果 |
| --- | --- |
| `src/lock.ts` | 重写为租约实现：`LOCK_HEARTBEAT_MS`、`ReclaimCause`、`readSnapshot`/`decideReclaim`/`reclaim`（CAS）、`token` 生成与 `verifyOwnership`、心跳自校验、`onLost`、`releaseSync` + 进程 `exit` 钩子；新增同步 `observeLock()` 与 `LostReason`（`foreign` / `missing`） |
| `src/hub.ts` | 新增 `ensureWritable()` / `lockInfo()` / `markWritable()` / `revalidateLock()`；不再“只要没锁就只读”，而是每次写前复核或重抢；`lost the lease` 原因保留；锁文件被删时保持可写 |
| `src/runtime.ts` | 新增 `revalidateHubs()`，挂在既有 60s 定时器上；`status()` 报告前先刷新配置根 |
| `src/store.ts` | `assertWritable()` 改为异步（`await hub.ensureWritable()`）；`propose` / `commit` / `reject` / `consolidate` 四入口改为 `await` |
| `src/service.ts` | `status()` / `overview()` / `config()` 报告前调用 `revalidateLock()`；增加 `lock: { held, owner, expiresAt, reclaimed, onDisk }`；夜间维护改用 `ensureWritable()` 判定 |
| `client.js` | 面板每 30s 轮询只读切片（`STATUS_POLL_MS`），签名不变不重渲染，失败保留旧数据 |
| `tests/lock.test.ts` | 新增 12 个租约/fencing 测试（心跳刷新、CAS 回收、v1 兼容、并发抢锁、被抢后不写、短租约缩频） |
| `tests/hub.test.ts` | 旧断言“活进程心跳过旧也不抢占”改写为“心跳超租约即回收”；新增惰性自愈、被接管后拒写、**锁文件被删后清除缓存只读**、**pid 消失后清除缓存只读**、持锁文件被删后重建 |
| `tests/service.test.ts` | `memory_status` 不再报告过期只读（文件消失 / 心跳超租约两种） |
| `tests/store.test.ts` | 新增“持有者退出后同一次会话内自动恢复写入” |
- 文档 | 新增 ADR-0009；改写 ADR-0006 状态/决策 3/备选；更新 DESIGN §4.4/§7.1/§16、storage-contract、troubleshooting（新增“pid 没了、锁文件也没了、`memory_status` 还只读”一节）、testing-guide、current-state |

### 验证结果

- `npm run check`：typecheck + build + 165 个测试通过（20 个文件）。
- 真实残留锁排查（本机 `~/.dsh/memory-hub`）：config 根与 product 根的 `.writer.lock` 仍是 v0.7 旧格式（无 `token`），`pid: 36156` 早已退出、心跳停在 2026-11-10（约 4013 分钟前）；另一个根 `dsh-plugin-dev` 的锁 `pid: 297104` **进程仍存活**但心跳已停 480 分钟（休眠/冻结形态）。这正是“pid 已消失、锁文件已不在、内存仍报只读”与“活进程但心跳停”两类场景，新版按 `dead-process` 与 `stale-heartbeat` 分别处理。
- 运行中实例复现（`http://127.0.0.1:58912/dsh-memory-hub/api/overview`）：改动前返回 `readOnly: true`、`readOnlyReason: another writer holds ...pid 36156...`，而该 pid 已不存在——即用户的原始症状；该实例加载的是改动前的内存状态，重载插件后由新逻辑纠正。
- **关键发现（Windows）**：对已退出的 pid 36156 执行 `process.kill(36156, 0)` 返回 `EPERM` 而非 `ESRCH`（`tasklist` 明确无此进程）。旧实现把 `EPERM` 当作“活着”，导致“崩溃写者立即回收”在 Windows 上不成立。已改为三态判定 + `min(lock_stale_ms, 60s)` 宽限。
- 真实双进程验证（临时脚本，验证后已删除）：进程 A 拿到锁 → 进程 B 启动即 `readOnly: true`、`onDisk: foreign`、原因含 pid 与 `lease expires at` → A 删除锁文件并被 `SIGKILL`（pid 消失）→ B 在下一次状态读取（`revalidateLock`）恢复 `readOnly: false`、`onDisk: missing`，`ensureWritable()` 为 true 且 `held: true`，全程未重启。
- 用本机真实残留锁（pid 36156、心跳 4013 分钟前、v1 无 `token`）复放到临时根：`Hub.open` 直接回收（`reclaimed: 'stale-heartbeat'`），`readOnly: false`、`held: true`。
- 单测覆盖：崩溃写者（`ESRCH`）立即回收；挂死写者（pid 存活、心跳 2020）超租约回收；探不到死活（`EPERM`）的 pid 90s 心跳后回收、新鲜心跳不回收；新鲜活锁仍阻塞并报 `lease expires at`；被接管后 `ensureWritable()` 为 false 且不删对方的锁；并发 `acquire` 只有一个赢家；v1 无 `token` 锁仍被识别；租约 1s 时心跳自动缩频、健康写者不被抢；锁文件被删 / 阻挡者 pid 消失后 `revalidateLock()` 清除缓存只读；持锁文件被删后重建而非误判被抢；`status()`/`overview()`/`config()` 即时恢复。

### 已知限制 / 后续

- 残余窗口：旧写者被冻结在“已复核 token、还没写完”之间时，租约被抢后恢复运行可能再写一次；彻底消除需要每写一条带 fencing 序号的账本校验（未做）。
- `storage.lock_stale_ms` 仍是全局配置；若要按根配置需扩展 schema（未做）。
- 真实多进程（桌面端 + `dsh web`）交替写的端到端压测未做，仍由单测覆盖。

## 2026-11-02

### 决策

| ID | 决策 | 状态 | 追踪 |
| --- | --- | --- | --- |
| D13 | 写锁按 hub 根独立降级，不再把配置根的 `readOnly` 级联给 core 工作区 | Accepted | [ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md)、[proposal-per-root-lock](../03-openspec/proposal-per-root-lock.md) |
| D14 | 只读来源分为 `forced` / `config` / `lock`，只有显式 `readOnly: true` 传播到所有根 | Accepted | [ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md) |
| D15 | 读锁失效判定加入 `host` 比较：跨机残留锁直接回收；本机活进程的锁仍不抢占 | Accepted | [ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md) |
| D16 | `config.yaml` 写入与写锁解耦（`configWritable = !forcedReadOnly`），锁占用/配置损坏时面板仍可保存并自助修复 | Accepted | [ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md) |

### 代码与行为改动

| 改动 | 结果 |
| --- | --- |
| `src/lock.ts` | `acquire` 返回 `{ lock, owner }`；`host` 不同视为残留锁；诊断信息带 pid/host |
| `src/hub.ts` | 新增 `forcedReadOnly` / `readOnlySource` / `canWriteConfig()`；`reloadConfig` 成功后恢复写权限并补抢锁 |
| `src/runtime.ts` | core Hub 用 `forcedReadOnly` 而不是 `configHub.readOnly`；core root 与配置根相同时共享锁并记 warning |
| `src/service.ts` | `updateConfig` 只拦 `forcedReadOnly`；`config()` / `status()` / `overview()` 增加 `configWritable`、`readOnlySource` |
| `client.js` | 配置页按 `configWritable` 禁用按钮；旧宿主回退到 `readOnly` |
| 测试 | 53 → 59 个测试；新增跨机锁回收、活进程锁不抢占、坏配置恢复、锁降级下配置可写、配置根锁不级联 |
| 文档 | 新增 ADR-0006、proposal-per-root-lock；更新 DESIGN §4.4/§7.1/§9.7/§15.3/§16.2、README、COMPATIBILITY（V25/V26）、troubleshooting、security-policy、deployment-guide、testing-guide、storage-contract、module-boundaries、current-state |

### 验证结果

- `npm run check`：typecheck + build + 59 个测试通过（10 个文件）。
- 单测覆盖：配置根锁被占用时 `core` 工作区 `readOnly: false`；跨机 `.writer.lock` 被回收；同机活进程锁仍降级只读；`config.yaml` 修复后 `reloadConfig` 恢复可写并重新持锁；锁降级下 `updateConfig` 成功落盘。
- 面板：`/api/config` 返回 `configWritable`；旧客户端字段缺省时仍按 `readOnly` 处理。
- 已发布 `v0.1.6`：tag `785576f`；GitHub Actions [run 41436746941](https://github.com/zhiwuli0228/dsh-memory-hub/actions/runs/41436746941) 全绿（Verify tag → check → pack → publish → release）；npm 于 `2026-11-02T11:30:30Z` 收录，`gitHead` 与 tag commit 一致，provenance 为 SLSA v1（`https://slsa.dev/provenance/v1`）；Release 附件 `dsh-memory-hub-0.1.6.tgz` 已生成。

### 已知限制 / 后续

- 显式 `readOnly: true` 仍是全局只读，配置页也不可保存（预期）。
- 同机 PID 复用且该 PID 仍属于活进程时，锁不会自动回收，需要手动删除 `.writer.lock`。（2026-11-13 已解决：改为租约 + fencing token，见 D18 / [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)。）
- 多进程真实并发写同一根仍未做端到端验证（仅有单测）。
- 配置热加载不会重建 core Hub 列表；增删 `core_workspaces` 后仍需重载插件（既有行为，未在本次修改）。

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
- tag `v0.1.4`：npm `dsh-memory-hub@0.1.4` + GitHub Release `v0.1.4`（首包 README 仍写“未发布”，随后由 `v0.1.5` 修正）

### 验证结果

- `npm run check`：typecheck + build + 53 个测试通过。
- 宿主重载后 `memory_status.policy.maintenance` 显示 `enabled: true`、`time: "03:00"`、`apply: "propose"`。
- `memory_maintenance({ apply: "report" })` 扫描 `product`、`dsh-plugin-dev`、fallback，分别写报告；13 条 accepted、0 候选。
- 夜间定时器在 23:29 因“当天未跑且已过 03:00”补跑一次，写 `maintenance-state.json`（`lastRunDate: 2026-11-01`）；没有提交或删除任何知识。
- 当前 Hub：13 条 accepted、1 条 pending `PRO-000016`（本次设计决策候选）。
- `v0.1.4` 已在 GitHub Actions 上发布；发现发布包 README 仍写“未发布”后，以 `v0.1.5` 修正并重新发布。`v0.1.5` 在 npm 可查，provenance predicate 为 SLSA v1；Release 附件 `dsh-memory-hub-0.1.5.tgz` 已生成。

### 已知限制 / 后续

- Host 必须在 03:00 运行；整晚关闭则不会执行。
- 一个 core 失败当天不重试。
- 没有全局合并报告。
- 报告不自动清理。
- 不做语义合并、不自动废弃未引用知识。
- 官方「自动化任务」栏不可见；如需可见、可暂停/编辑，需要改用 DSH `schedule`，代价是会话和模型回合。
- 当前 `approval.mode: auto` 是测试遗留；维护本身不 commit，但若要求严格人工审批，应改回 `manual`。
