# Testing Guide

## 测试框架

- vitest 3.x
- Node 内置 assert / vitest 断言

## 运行

```sh
npm run test        # 全部测试
npm run test:watch  # 监听模式
```

## 测试分类

### 单元测试

- 目标：`src/search.ts`、`src/frontmatter.ts`、`src/scope.ts`、`src/ids.ts`、`src/maintenance-schedule.ts` 等纯逻辑。
- 不依赖 DSH 运行时。
- 使用临时目录。

### 集成测试

- 目标：`src/service.ts` 流程。
- 构建 mock store / ledger。
- 验证预检、引用、提案、关闭、汇总、维护。

### Host 冒烟测试

- 在真实或 mock DSH 环境中验证工具注册、预检、上下文注入。
- 需要 DSH runtime 或等效 mock。

### 面板注册测试

- 验证 `client.js` 可被 `__ModuleLoader__` 加载。
- 验证 slot 注册和 API 路由。

## 测试数据

- 使用 `fs.mkdtempSync` 创建临时目录。
- 测试结束后清理。
- 不要写真实 `~/.dsh/memory-hub`。

## 覆盖要求

- 新增核心逻辑必须覆盖。
- 失败分支必须覆盖。
- 边界条件必须覆盖。

## 当前测试

165 个测试，20 个文件。详见 `tests/`。

写锁与降级相关：

- `tests/lock.test.ts`：租约语义（心跳刷新、`token` 不变）、活写者不抢占、崩溃写者（`ESRCH`）立即回收、挂死写者心跳超租约后回收、探不到死活（`EPERM`）的 pid 按 60s 宽限回收且新鲜心跳不抢、跨机锁回收、v1 无 `token` 锁兼容、损坏锁按 mtime 租约回收、并发抢锁只有一个赢家、被抢后 `verifyOwnership` 失败 / 心跳停止 / `release` 不删别人的锁、租约 1s 时心跳自动缩频且健康写者不被抢；
- `tests/hub.test.ts`：第二写者只读、跨机残留锁回收、心跳过期的活进程锁被回收、新鲜活锁保留并报租约到期时间、对方退出后下一次 `ensureWritable()` 自动恢复可写、**锁文件被删后 `revalidateLock()` 清除缓存只读**、**阻挡者 pid 消失后清除缓存只读**、**持锁者自己的锁文件被删后重建而非误判被抢**、活写者存在时重读仍保持只读、锁被接管后拒绝写入并保留 `lost the lease` 原因、坏配置修复后恢复写权限；
- `tests/store.test.ts`：锁降级下写入返回 `READ_ONLY`，持有者退出后同一次会话内自动恢复写入；
- `tests/service.test.ts`：锁被占用时配置仍可保存，只有显式 `readOnly: true` 拒绝；**`status()` / `overview()` / `config()` 在锁文件消失或心跳超租约后立即不再报告只读**；
- `tests/plugin.test.ts`：配置根锁被占用时 core 工作区仍可写（不级联）。
- `tests/client.test.ts`：面板每 30s 轮询只读切片（`STATUS_POLL_MS` + `sameLock` 判定），只读横幅不会停在旧快照。

维护相关：

- `tests/maintenance.test.ts`：精确重复 deprecate、重复运行去重、显式标签晋升、report-only、非 admin 拒绝；
- `tests/maintenance-schedule.test.ts`：本地日期/时间、到点判断、默认配置；
- `tests/plugin.test.ts`：10 个工具注册。
