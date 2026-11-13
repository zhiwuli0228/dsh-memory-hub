# Proposal: 写锁租约化（自动释放挂死写者）

- Status: Implemented（2026-11-13；决策见 [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)）
- 影响范围：`src/lock.ts`、`src/hub.ts`、`src/store.ts`、`src/service.ts`、`src/hub-readme.ts`

## 1. 问题

`<root>/records/.writer.lock` 旧判定是“本机进程存在 → 永不抢占”（[ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md) 决策 3）。`isProcessAlive(pid)` 只能判断进程是否还存在，无法判断写者是否还在写：

| 场景 | 旧行为 | 结果 |
| --- | --- | --- |
| 进程崩溃、pid 消失 | 心跳超 `lock_stale_ms` 后回收 | 最多只读 10 分钟 |
| 进程仍在但线程/事件循环卡死 | **永不回收** | 该根**永久只读**，只能手删锁 |
| 崩溃后 pid 被本机另一个活进程复用 | **永不回收** | 该根**永久只读** |

用户实际遇到的就是第二类：“线程死了，就会永久卡死”。故障排查文档当时给出的唯一办法是手动删 `.writer.lock`。

## 2. 目标

1. 挂死/冻结的写者必须能被自动释放，不需要人工干预、不需要重启插件。
2. 不引入“同一根两个写者”的常规窗口。
3. 旧 Hub（v0.7 的锁文件、已存在的目录）零迁移。

## 3. 方案

1. **租约**：锁持有者每 15s 刷新 `heartbeatAt`；租约 = `heartbeatAt + storage.lock_stale_ms`。
2. **回收判定**（按优先级）：`foreign-host` → `dead-process`（pid 不存在，立即）→ `stale-heartbeat`（超租约）→ `corrupt`（读不出 JSON 且 mtime 超租约）。
3. **CAS 回收**：`rename` 锁文件到临时名 → 重读 → 与判定时的 `{token, heartbeatAt}` 比对；一致才删除，不一致就**排他地**写回（不覆盖新写者的锁）。
4. **fencing token**：锁文件新增随机 `token`；`verifyOwnership()` 要求 `token` + `pid` 都匹配；心跳、`release()`、每次写入口都复核。
5. **惰性自愈**：`KnowledgeStore.assertWritable()` 改为异步并调用 `Hub.ensureWritable()`；被降级的根在对方退出后自动重抢。
6. **退出释放**：进程 `exit` 钩子同步删除仍属于自己的锁。
7. **可观测**：`Hub.lockInfo()` → `{ held, owner, expiresAt, reclaimed, onDisk }`，进入 `memory_status` 与 `/api/overview`。
8. **缓存状态可失效**：`Hub.revalidateLock()` 同步重读锁文件，在 `status()` / `overview()` / `config()` 与 60s 运行时巡检里修正内存中的 `readOnly`；锁文件消失只丢句柄（根空闲），`token` 变了才降级只读。

## 4. 行为对比

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 写者崩溃（pid 确定不存在，`ESRCH`） | 等心跳超龄才回收 | **立即**回收 |
| 写者崩溃但 pid 探不到（Windows `EPERM`） | 永久只读 | 约 60 秒后回收（`stale-heartbeat`） |
| 写者挂死（pid 存活、心跳停） | 永久只读，需手删锁 | 超租约自动回收；旧写者降级只读 |
| pid 被复用 | 永久只读 | 超租约自动回收 |
| 跨机残留锁 | 立即回收 | 立即回收（不变） |
| 另一进程正常持有锁 | 该根只读 | 该根只读；对方退出后自动恢复 |
| pid 没了、锁文件也没了，但内存仍报只读 | 只能重启插件 | 下一次读取（`memory_status` / 面板 / 60s 巡检）即恢复可写 |
| 持锁者自己的锁文件被手工删除 | 永久只读 | 视为根空闲，下次写入重建锁 |
| 同一根两个写者 | 不可能 | 只在“冻结超过租约且停在写操作中间”的窗口可能，靠 fencing 收敛 |

## 5. 约束

- 仍是“每个根一个写者”，不做乐观并发写。
- 面板只读规则不变：不提供“清锁”按钮；不自批。
- 锁文件向后兼容：v1（无 `v`、无 `token`）仍被识别，`token` 视为 `null`。
- `config.yaml` 写入仍与锁解耦。

## 6. 风险

- 残余双写窗口（冻结在写操作中间且租约被抢）；缓解：写入口复核 token、心跳不复活别人的锁、`release` 只删自己的锁。
- `lock_stale_ms` 过大 → 恢复慢；过小 → 健康写者可能被抢。默认 600s 且心跳自动缩频（租约 1/4，下限 250ms）。
- 手动删锁仍是文档里的最后手段，但要写明“对方活着时会短暂双写”。

## 7. 验证

- `tests/lock.test.ts`（13 个）：租约/心跳、CAS 回收、fencing、并发抢锁、v1 兼容、损坏锁、短租约缩频、`EPERM`（探不到死活）宽限。
- `tests/hub.test.ts`：心跳过期的活进程锁被回收、新鲜活锁保留、惰性自愈、被接管后拒写、**锁文件删除 / 阻挡者 pid 消失后清除缓存只读**、**持锁文件被删后重建**。
- `tests/service.test.ts`：`status()` / `overview()` / `config()` 在锁文件消失或心跳超租约后立即不再报告只读。
- `tests/store.test.ts`：锁降级下 `READ_ONLY`，持有者退出后自动恢复写入。
- `tests/client.test.ts`：面板轮询只读切片（`STATUS_POLL_MS`）。
- 真实双进程：A 持锁 → B 启动即只读（原因含 pid 与 `lease expires at`）→ A 删除锁文件并被 `SIGKILL` → B 在下一次状态读取时恢复可写并重抢（`onDisk: missing`、`held: true`），全程未重启。
- 本机真实残留锁（pid 36156、心跳 4013 分钟前、v1 无 `token`）复放到临时根：`reclaimed: 'stale-heartbeat'`、`readOnly: false`、`held: true`。
- Windows 实测：对已退出的 pid，`kill(pid, 0)` 可能返回 `EPERM` 而不是 `ESRCH`；已改为三态判定 + 60s 宽限，避免“崩溃写者永不回收”。
- `npm run check`：165 个测试通过。
