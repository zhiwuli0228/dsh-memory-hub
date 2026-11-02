# Proposal: Per-Root Write Lock

> Status: implemented (2026-11-02, unreleased). 决策记录见 [ADR-0006](../01-architecture/decisions/ADR-0006-per-root-write-lock.md)。

## 1. Problem

`readOnly` 是 hub 实例级的，但 `MemoryRuntime` 把配置根 Hub 的 `readOnly` 直接传给每个 core Hub：

```ts
const dataHub = await Hub.open({ root, readOnly: configHub.readOnly, ... })
```

结果是一把锁的占用会传染成整个记忆中枢只读：

- 第二个 DSH 进程、跨机拷贝的残留锁、崩溃后 PID 复用的锁，都会让配置根进入只读；
- 配置根只读 → 所有 core 只读 → 面板「配置」页的添加/保存按钮也被禁用（`disabled: readOnly`）；
- 用户既写不了知识，也修不了配置，只能手改文件或删锁。

锁本来保护的是**同一个根目录下的 records/knowledge**；不同 core 根之间没有共享文件，没有理由互相牵连。

## 2. Goal

- 写锁按 hub 根目录生效，只读降级只作用于该根。
- 只有显式 `readOnly: true` 是全局只读。
- 残留锁（跨机、进程已死）能自动恢复，不必手删。
- 配置损坏或锁被占用时，用户仍能在面板里保存配置来自助修复。

## 3. Scope

Included:

- `src/lock.ts`：失效判定加入 `host` 比较；返回占用者信息用于诊断。
- `src/hub.ts`：区分 `forced` / `config` / `lock` 三种只读来源；`canWriteConfig()`；`reloadConfig()` 修复后恢复写权限并补抢锁。
- `src/runtime.ts`：不再把 `configHub.readOnly` 传给 core；同 root 时共享锁。
- `src/service.ts`：`updateConfig` 只受 `forcedReadOnly` 限制；`config()` / `status()` / `overview()` 暴露 `configWritable` 与 `readOnlySource`。
- `client.js`：配置页按 `configWritable` 禁用按钮（旧宿主回退到 `readOnly`）。

Out of Scope:

- 取消写锁或改为乐观并发写。
- 面板增加“清锁/解锁”入口。
- 多机共享同一个 hub 目录的协同协议。

## 4. Behavior

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 第二个 DSH 进程持有配置根锁 | 所有根只读、配置页禁用 | 配置根只读；各 core 根各自可写；配置页可保存 |
| 跨机拷贝来的 `.writer.lock`（`host` 不符） | 永久只读直到手删 | 自动回收 |
| 本机进程已退出、心跳超 `lock_stale_ms` | 自动回收 | 自动回收（不变） |
| 本机活进程持有锁（含挂起） | 不抢占 | 不抢占（不变，避免两个写者） |
| `config.yaml` 损坏 | 只读；面板禁用；修好后仍需重启 | 只读但 `configWritable: true`；保存或热加载即恢复 |
| core `root` == 配置根 | 同进程二次抢锁 → 该 core 永远只读 | 共享配置根锁，记 warning |

## 5. Constraints

- 仍然是“每个根一个写者”，不引入并发写。
- 面板只读规则不变：不提供批准、不提供清锁。
- `readOnly` 字段语义不变，新增字段向后兼容。

## 6. Risks

- 用户在显式 `readOnly: true` 下仍无法写：这是预期，界面横幅给出原因。
- 同机 PID 复用且该进程仍存活：仍会表现为该根只读，需要手动删锁；文档已写明判定步骤。
- core 根与配置根相同属于配置错误，只记 warning 而不是硬失败，避免用户卡死在启动阶段。

## 7. Verification

- `tests/hub.test.ts`：跨机锁回收、活进程锁不抢占、坏配置修复后恢复写权限并重新持锁。
- `tests/service.test.ts`：锁降级时 `configWritable: true` 且 `updateConfig` 落盘；显式只读时拒绝。
- `tests/plugin.test.ts`：配置根锁被占用时 core 工作区 `readOnly: false`（不级联）。
- `npm run check`：typecheck + build + 59 个测试通过。
