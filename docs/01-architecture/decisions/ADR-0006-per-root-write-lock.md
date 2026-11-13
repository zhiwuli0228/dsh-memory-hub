# ADR-0006: Per-Root Write Lock

## Status

Accepted (2026-11-02)。决策 3（锁失效判定）已被 [ADR-0009](./ADR-0009-writer-lock-lease.md)（2026-11-13）取代：锁改为**租约 + fencing token**，“本机活进程即使挂起也不抢占”这一条不再成立，改为“心跳超过租约即可回收，旧写者按 token 降级为只读”。决策 1、2、4、5 继续有效。

## Context

V0.1 用 `<root>/records/.writer.lock` 做单写者保护，锁本身一直是**每个 hub 根目录一把**。但 `MemoryRuntime` 给每个 core Hub 传的是配置根实例的状态：

```ts
const dataHub = await Hub.open({ root, readOnly: configHub.readOnly, ... })
```

于是配置根（`~/.dsh/memory-hub`）的锁只要被占用，**所有**工作区一起只读：`memory_status` 全红、写工具返回 `READ_ONLY`、面板「配置」页保存按钮变灰。触发条件并不罕见：

- 同一台机器开了两个 DSH 进程（桌面端 + `dsh web` / headless）；
- 把整个 hub 目录（或漫游/同步目录）拷到另一台机器，锁里的 `host` / `pid` 属于原机器；
- 上一次崩溃留下的锁，`pid` 恰好被本机另一个进程复用 —— 旧判定只看 `pid` 是否存活，于是永不回收。

对单机单进程用户没有影响，但“一个根被占用 → 整个记忆中枢只读”的爆炸半径与锁的实际保护范围不匹配：不同 core 的 `records/`、`knowledge/` 本来互不相干。

## Decision

1. **锁的粒度就是 hub 根目录**：每个 core 根独立抢自己的锁、独立降级；配置根只影响 global / fallback 数据。
2. **只读来源分三类**，只有 `forced` 会传播：
   - `forced`：插件配置显式 `readOnly: true`，全局只读；
   - `config`：该根 `config.yaml` 读不出来/校验失败；
   - `lock`：该根写锁被占用。
3. **锁失效判定收紧**：`host` 与当前机器不同 → 视为残留，直接回收；本机进程不存在且心跳超过 `storage.lock_stale_ms` → 回收；本机活进程（即使挂起）→ 不抢占，避免出现两个写者。（**已被 ADR-0009 取代**：心跳超龄即回收，靠 fencing token 保证旧写者不再写。）
4. **`config.yaml` 与写锁解耦**：配置文件走原子替换，不需要独占知识库。`configWritable = !forcedReadOnly`，锁被占用或配置损坏时面板仍可保存；保存成功后 `reloadConfig` 修复 `config` 型只读并补抢写锁。
5. **同根去重**：若某个 core 的 `root` 与配置根相同，不再开第二个 Hub 抢同一把锁，而是共享配置根的锁并记一条 warning。

## Consequences

- 一个根被写者占用不再冻结其他工作区；面板只读提示与 `memory_status.readOnlyReason` 指向具体根。
- 跨机拷贝和重启后 PID 复用导致的“永久只读”被消除，同时保留“活进程不抢占”的安全边界。
- 用户可以只在面板里修 `config.yaml`，不必手改文件或删锁。
- `memory_status` / `/api/overview` / `/api/config` 增加 `readOnlySource` 与 `configWritable`，便于区分“真只读”和“锁降级”。
- `/api/config` 的 `readOnly` 语义不变（该根是否可写），新增字段向后兼容：旧面板按 `readOnly` 禁用，新面板按 `configWritable`。

## Alternatives Considered

- **取消锁、改乐观并发写**：需要账本/序号/索引的冲突合并与重试协议，V0.1 风险过大，且与“人类审批后写入”的可审查性冲突。
- **保留全局锁，只改提示文案**：治标不治本，爆炸半径仍在。
- **面板加“清理锁”按钮**：面板只读是硬规则，且远程清锁会破坏单写者语义。
- **心跳超龄即回收（无论进程是否存活）**：会在进程挂起时产生两个写者，风险高于收益；跨机场景已由 `host` 判定覆盖。（2026-11-13 重新评估：挂死写者导致永久只读的代价更高，改为“租约 + fencing token”实现，见 [ADR-0009](./ADR-0009-writer-lock-lease.md)。）

## Related

- [ADR-0009: Writer Lock as a Fenced Lease](./ADR-0009-writer-lock-lease.md)
- [DESIGN §7.1](../DESIGN.md)
- [troubleshooting「只读模式」](../../06-operations/troubleshooting.md)
- [proposal-per-root-lock](../../03-openspec/proposal-per-root-lock.md)
