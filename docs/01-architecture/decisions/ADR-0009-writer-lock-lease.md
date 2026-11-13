# ADR-0009: Writer Lock as a Fenced Lease

## Status

Accepted (2026-11-13)。取代 [ADR-0006](./ADR-0006-per-root-write-lock.md) 决策 3 中“本机活进程（即使挂起）永不抢占”的部分；ADR-0006 的“按根独立降级”“`config.yaml` 与写锁解耦”“同根去重”三条继续有效。

## Context

ADR-0006 的失效判定是：`host` 不同 → 回收；本机进程不存在**且**心跳超过 `storage.lock_stale_ms` → 回收；本机进程存在（哪怕已挂起/卡死）→ 永不抢占。

`isProcessAlive(pid)` 只能回答“这个 pid 还在不在”，不能回答“写者还在不在写”。于是任何“进程还在、但线程/事件循环已经不动”的写者都会永久占住 `<root>/records/.writer.lock`：

- 插件被 suspend、DSH 窗口假死、进程卡在同步 I/O 或死锁上；
- 上一次崩溃留下的锁，pid 被本机**另一个仍然存活**的进程复用（ADR-0006 自己就点名了这个场景，只是当时选择了不处理）。

结果与该根相关的所有写操作都返回 `READ_ONLY`，唯一出路是手动删除 `.writer.lock`（`troubleshooting.md` 当时就是这么写的）。这既违背“自动释放”的直觉，也让普通用户无从下手。

还有第二个、更隐蔽的问题：`readOnly` 是 **Hub 打开那一刻对锁文件的一次判断**，之后一直缓存到进程退出。锁文件后来被释放、被删除、pid 消失、心跳过期，内存里的标志都不会变。用户看到的正是这种组合：**pid 已消失、锁文件已不在，但 `memory_status` 与面板仍然显示只读**。只做租约回收而不处理这个缓存，问题依旧——因为写路径被内存标志挡住了。

真正的约束不是“pid 活着”，而是**同一时刻只有一个写者**。只要能在抢占发生时让旧写者立刻停止写入，用租约（lease）判定“写者是否还活着”就是安全的。

## Decision

1. **锁是租约，不是永久所有权标记。** 锁文件记录 `heartbeatAt`，持有者每 15s（`LOCK_HEARTBEAT_MS`）刷新一次；租约 = `heartbeatAt + storage.lock_stale_ms`（默认 600s，即 40 次心跳）。若有人把 `lock_stale_ms` 调到小于 15s，心跳自动缩到租约的 1/4（下限 250ms），避免“租约比自己的心跳还短”。
2. **回收判定只取决于“原写者确定不在写”**，按优先级：
   - `foreign-host`：`host` 不是本机，本机不可能是它的写者 → 立即回收；
   - `dead-process`：记录的 pid 在本机**确定不存在**（`kill(pid, 0)` 返回 `ESRCH`）→ 立即回收（不再等心跳超龄）；
   - `stale-heartbeat`：pid 还在（或无法判断），但心跳已经超过各自的期限 → 回收。这就是挂死写者的自动释放路径；
   - `corrupt`：锁文件读不出合法 JSON，且文件 mtime 也超过租约 → 回收（刚写坏的锁先不动，给它一个租约的宽限）。
   文件 mtime **不**用于判断存活：拷贝、同步、git checkout 都会刷新 mtime，却没有人真正在写。
   - **pid 存活判定必须区分三种答案**：`alive`（`kill(pid,0)` 成功）、`dead`（`ESRCH`）、`unknown`（`EPERM`）。`unknown` 不是理论情况：Windows 上 `process.kill(pid, 0)` 对**已经不存在**的 pid 也可能返回 `EPERM`（本机实测：死写者的 pid 36156 给 `EPERM`，而 `tasklist` 明确说没有该进程），POSIX 上 `EPERM` 则可能是一个**活着的**、属于其他用户的进程。两种情况都不能当作“活着”，也不能当作“死了”→ 交给心跳仲裁。
   - `unknown` 的宽限期取 `min(lock_stale_ms, 60s)`：健康写者（任何用户）每 15s 都会刷新心跳，因此不会被抢；而“已死但探不到”的写者约 1 分钟就恢复，而不是等满 10 分钟的租约。
3. **回收是 CAS（rename + 复核）**：把锁文件 rename 到临时名，重新读取并与判定时的 `{token, heartbeatAt}` 比对，一致才删除；不一致就还原。rename 原子，两个回收者不会同时赢。
4. **所有权是 fencing token**：每次获取生成随机 `token`。`WriterLock.verifyOwnership()` 要求锁文件里的 `token` 与 `pid` 仍是自己；心跳、`release()`、以及**每次写操作的入口**都要先过这一关。租约被抢走的旧写者会降级为只读，而不是与被抢后的新写者在同一根上双写。
5. **心跳自校验**：心跳先 `verifyOwnership` 再写；发现锁已被别人接管就停止刷新并触发 `onLost` 回调，`Hub` 立即把自己标记为 `lock` 型只读（reason 以 `lost the lease` 开头，便于区分“别人在跑”和“我被抢了”）。
6. **写入口惰性自愈**：`Hub.ensureWritable()` 在每次写操作前调用（`KnowledgeStore.assertWritable()` 改为异步）。它做三件事：显式 `forced`/`config` 只读照旧拒绝；持锁则复核 fencing；未持锁则重试抢锁。于是“启动时锁被占 → 对方退出后本进程自动恢复可写”，不需要重启插件，也不需要删锁。
7. **正常退出主动释放**：进程 `exit` 钩子同步删除仍属于自己的锁（仍校验 `token`/`pid`），减少对租约兜底的依赖。硬崩溃才需要租约。
8. **诊断可观测**：`Hub.lockInfo()` 暴露 `{held, owner, expiresAt, reclaimed, onDisk}`，`memory_status` / `/api/overview` / 面板可直接看到“谁在挡、租约何时到期、本次回收了什么残留锁、磁盘上的锁文件到底是什么状态”。
9. **缓存状态必须可失效**：`readOnly` 是打开时对锁文件的**一次判断**，不是一个持久事实。`Hub.revalidateLock()` 用同步 `stat` + `readFile` 重新观测锁文件，并据此修正内存标志：
   - 锁文件不存在且本进程没持锁 → 该根已空闲，清除只读（下一次写入自行抢锁）；
   - 锁文件的 pid 已消失 / 心跳超租约 / 跨机 → 视为可回收，清除只读；
   - 锁文件属于另一个活写者 → 保持只读并刷新 `owner` / `expiresAt`；
   - 本进程持锁但文件已被删除 → 丢句柄、**不**报“被别人抢走”（根是空闲的），下一次写入重建；
   - 本进程持锁但文件里的 `token` 变了 → 真正的接管，降级只读。
   调用点：`service.status()` / `overview()` / `config()`（面板与 `memory_status` 的读路径）、`MemoryRuntime.status()`，以及运行时已有的 60s 定时器（`MemoryRuntime.revalidateHubs()`）。
10. **“文件消失”与“被别人接管”是两种事**：心跳与写入口都区分这两种状态。文件消失只丢句柄、不降级（根空闲），被别人接管才降级只读；否则用户按文档删掉 `.writer.lock` 反而会把活着的 Hub 锁死成只读。
11. **面板也要能自愈**：`client.js` 每 30s 只轮询 overview 的“只读切片”（`readOnly` / `readOnlyReason` / `lock`），签名不变就不重渲染；请求失败保留旧数据。否则面板会一直停在打开那一刻的只读横幅。

## Consequences

- 挂死/冻结的写者最多阻塞一个租约（默认 10 分钟）后自动释放；pid **确定**消失（`ESRCH`）的写者立即释放，探不到（`EPERM`）的约 1 分钟释放。用户不再需要手动删 `.writer.lock`。
- **缓存不再是死结**：锁文件释放/删除/过期后，`memory_status`、`/api/overview`、`/api/config` 与面板（30s 轮询）都会恢复正确状态；写路径不再被过期的内存标志挡住。
- 启动时被降级的根会在下一次写操作时自动恢复，多个 DSH 进程交替使用同一根成为可用场景（同一时刻仍只有一个写者）。
- 进程内每 60s 重新观测一次所有根的锁文件（一次 `stat` + 一次 `readFile`/根），代价可忽略。
- 引入唯一的残余风险：旧写者被冻结在“已复核 fencing、但还没写完”的窗口里，租约被抢后它恢复运行可能继续写一次。缓解手段是每次写操作入口都复核 fencing、心跳不复活别人的锁、`release()` 只删自己的锁；代价与收益相比可接受（冻结写者若不抢占就是永久只读）。
- 锁文件新增 `v: 2` 与 `token` 字段；读取端保持向后兼容——v1（无 `token`、无 `v`）的锁仍被识别为合法持有者，只是回收时按 `heartbeatAt` 判断，`token` 视为 `null`。
- `README` / 故障排查里“删锁”从首选动作降级为最后手段（例如手工改坏锁文件且尚未到租约）。
- 测试新增 `tests/lock.test.ts`（租约、CAS 回收、fencing、并发抢锁、v1 兼容、心跳刷新、短租约缩频、`EPERM` 宽限），改写 `tests/hub.test.ts` 中“活进程心跳过旧也不抢占”的旧断言，并新增“缓存失效”与“持锁文件被删”用例；`tests/service.test.ts` 覆盖 `status()`/`overview()`/`config()` 的即时恢复。

## Known limitations

- **Windows 上“已死但探不到”的 pid**：`kill(pid, 0)` 可能返回 `EPERM`，无法证明它已经退出，只能靠 60s 宽限。这类写者约 1 分钟恢复，而不是立即恢复。要更快只能引入平台特定探针（`tasklist` 子进程或 `NtQueryInformationProcess`），代价（每次判定一次进程创建、平台差异）大于收益。
- **跨用户写者**：同一台机器上另一个用户运行的 DSH 写同一个根时，`kill(pid,0)` 对它是 `EPERM`（`unknown`）。只要它健康刷新心跳就不会被抢；一旦它冻结且心跳超过 60s，就会被回收——这也是本 ADR 想要的语义（fencing 保证安全）。
- **滚动升级时不要混跑两个版本**：v0.7.0（v1 锁）会刷新心跳（所以健康时不会被抢），但它的写入口**没有 fencing 复核**。若 v0.7.0 卡住超过租约被新版本接管，它恢复后会在不复核的情况下继续写——比“新版本之间”的残余窗口更大。升级时先停旧进程，再起新进程。

## Alternatives Considered

- **只加租约、不加缓存失效**：租约再好，写路径仍被启动时的 `readOnly` 缓存挡住；必须同时让内存状态可重新推导（本 ADR 决策 9）。
- **维持 ADR-0006 的“活进程不抢占”**：无法解决挂死写者，正是本 ADR 要修的缺陷。
- **只加租约、不加 fencing**：租约到期即抢占会让冻结的旧写者在恢复后继续写，产生真正的双写/丢更新；fencing 是让租约安全的必要条件。
- **给面板加“强制清锁”按钮**：面板只读是硬规则，且远程清锁会把“谁在写”这个判断交给不确定的人工时机；自动租约更保守也更好用。
- **用独立守护进程/看门狗监控写者**：引入常驻进程与平台差异（systemd/launchd/Windows 服务），与“零常驻依赖、文件原生”的定位冲突。
- **用文件锁（`flock`/`LockFileEx`）代替租约**：操作系统会在进程退出时自动释放，但仍无法处理“进程活着、写者已死”的挂起；且 Windows 上的共享模式与 Node 支持不稳定。保留“租约 + fencing”作为跨平台方案。

## Related

- [ADR-0006: Per-Root Write Lock](./ADR-0006-per-root-write-lock.md)
- [DESIGN §7.1](../../DESIGN.md)
- [storage-contract](../../01-architecture/storage-contract.md)
- [troubleshooting「只读模式」](../../06-operations/troubleshooting.md)
