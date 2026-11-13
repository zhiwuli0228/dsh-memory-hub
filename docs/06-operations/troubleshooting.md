# Troubleshooting

## 插件未激活

- 检查 DSH 插件管理器是否显示已应用。
- 查看 `memory_status` 是否 `initialized: true`。
- 检查 `engines.dsh` 版本兼容性。

## 工具未出现

- 确认插件已激活。
- 重启 DSH。
- 检查是否有 `dsh.bundle.patch` 冲突。

## 面板未显示

- 插件启动时会尝试清除 `clientModules` 缓存；若未生效，重启 DSH。
- 检查浏览器控制台是否有 `__ModuleLoader__` 错误。

## 预检不命中

- 确认 `knowledge/` 目录下有 `accepted` 状态文件。
- 确认当前目录匹配某个 workspace 的 `root`。
- 检查 `policy.preflight.mode` 是否为 `per-turn`。

## `memory_commit` 失败

- 确认 DSH 审批服务可用（本机若关闭审批提示会失败）。
- 确认候选存在且未被拒绝/过期。
- 检查 `memory_status` 是否只读。

## 索引错误

- 运行 `memory_status` 查看 `index.errors`。
- 检查对应文件 YAML frontmatter 是否合法。
- 检查 `id` 是否与文件名一致。

## 只读模式

只读是**按根目录**判定的：一个根只读不代表其他工作区只读。先看 `memory_status.readOnlyReason`（面板顶部「只读模式:」后面那句），再对号入座：

| `readOnlyReason` | 原因 | 处理 |
| --- | --- | --- |
| `configured read-only` | 插件配置写了 `readOnly: true`（全局只读） | 去掉插件配置里的 `readOnly`，重载插件 |
| `cannot create config.yaml: ...` | 根目录不可写（权限/只读盘） | 修目录权限，或把 `root` 指到可写目录 |
| `invalid config ...` / `invalid YAML ...` | `config.yaml` 校验失败（`version` 必须是 `1`，id 必须是 slug，`root` 不能为空） | 改好后等热加载，或直接重载插件 |
| `another writer holds .../.writer.lock (pid ..., host ...)` | 另一个 DSH 进程持有该根的写锁 | 只保留一个 DSH 实例；对方退出后本进程会自动接管，无需重启 |
| `lost the lease; another writer holds ...` | 本进程曾是写者，租约到期后被另一个写者接管 | 说明有另一个 DSH 实例正在写该根；关掉多余实例后自动重抢 |

**同一个根只会有一个写者**，这是防止两个进程同时改 `records/`、`knowledge/` 的硬约束；但它的影响范围只到那个根。其他 core 的锁各自独立。

写锁是**租约**（[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)），正常情况不需要人工干预：

1. 写者每 15 秒刷新一次 `heartbeatAt`；租约 = `heartbeatAt + storage.lock_stale_ms`（默认 10 分钟）。
2. 记录的 `pid` 在本机**确定不存在**（`kill(pid, 0)` 返回 `ESRCH`，例如崩溃/被杀）→ 下一个写者**立即**回收，不用等租约。
3. `pid` 还在但心跳超过租约（挂死、假死、机器休眠、PID 复用）→ 下一个写者**自动**回收；旧写者的 `token` 已失效，若它醒来会发现锁不属于自己，降级为只读而不会跟着写。
4. `host` 不是本机（跨机拷贝、漫游/同步目录）→ 立即回收。
5. 有些 pid 探不出死活（Windows 上对已退出的 pid 也可能返回 `EPERM`，或进程属于另一个用户）→ 交给心跳仲裁，约 60 秒没心跳即回收。这是平台限制：**能证明已死的立即回收，证明不了的 1 分钟内回收，绝不会永久卡住**。
6. 正常的插件重载/退出会主动删掉自己的锁；不需要手动删 `.writer.lock`。

### 「pid 没了、锁文件也没了，`memory_status` 还是只读」

这是**内存缓存**问题，不是锁文件问题：`readOnly` 是 Hub 打开那一刻对锁文件的一次判断，旧版本之后不再重新读取，于是锁文件早已释放/删除，进程内标志还停在只读。

现在的版本会在这些时机重新观测锁文件并修正标志：`memory_status`、面板（`/api/overview`、`/api/config`）、以及每 60 秒一次的运行时巡检。所以：

- 升级到包含 [ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md) 的版本后重载插件，这类残留状态会自动消失；
- 如果仍显示只读，先看 `lock.onDisk`：
  - `missing` → 锁文件确实不在了；新版下一次读取就会恢复，若仍只读说明跑的是旧代码，重载插件即可；
  - `foreign` + `owner.pid` 已不存在 → 下一次写入会回收（探不到死活的 pid 约 60 秒）；
  - `foreign` + `owner.pid` 是活进程 → 真的还有另一个 DSH 在写，先关掉它。

面板每 30 秒会重查一次只读状态，所以对方退出后横幅会自己消失，不必重开面板。

排查写锁：

1. 用 `memory_status`（或面板顶部提示）看 `readOnlyReason` 与 `lock` 字段：`lock.owner` 是挡路的写者，`lock.expiresAt` 是它租约到期时间，`lock.reclaimed` 显示本次启动回收了哪种残留锁，`lock.onDisk` 是磁盘上锁文件的真实状态。
2. 想立刻恢复、又确认没有其他 DSH 在跑：关闭 DSH，等租约到期（最多 `lock_stale_ms`），或手动删 `<root>/records/.writer.lock`。手动删只作为最后手段——如果对方其实还活着，会短暂出现两个写者（新版会把它当作“文件消失”重建，不会把自己锁死）。
3. 确认没有同时运行桌面端 + `dsh web` + headless（它们会抢同一把锁，第二个只读）。

**配置页仍可保存**：`config.yaml` 走原子写，不需要写锁。即使某个根只读，面板「配置」页的添加/保存按钮仍可用（只有显式 `readOnly: true` 会禁用）。

## 夜间维护没有运行

- 检查 `policy.maintenance.enabled` 是否为 `true`。
- 检查 `time` 是本地 `HH:mm`，当前是否已过点。
- 检查 `<configHub-root>/records/maintenance-state.json` 是否已经是今天。
- Host 在 03:00 时是否运行；关闭则下一次启动补跑。
- 查看 Host 日志中的 `dsh-memory-hub: scheduled maintenance` 与 `scheduled maintenance failed for <core>`。
- 确认对应 core 配置了 `root` 且目录可写。

## 夜间维护没有出现在官方「自动化任务」栏

这是预期行为。维护使用插件内部定时器，不是 DSH `schedule` 任务；控制入口是 `config.yaml`。详见 [maintenance](maintenance.md)。

## 某个 core 没有报告

- 单个 core 失败只记 warning，不阻塞其他 core。
- 失败 core 当天不单独重试；第二天再跑，或手动 `memory_maintenance`。
- 检查该 core 的 root、只读状态和配置。

## 维护候选太多

- 降低 `policy.maintenance.max_proposals`。
- 检查是否给大量子工作区知识加了 `reusable` 等标签。
- 精确重复规则保守；近似重复只报告，不会自动生成候选。

## 性能问题

- 大规模知识库启动扫描慢：未来 V0.2 考虑索引落盘。
- 检索慢：检查是否命中大量大文件；可拆分知识。
- 多个 core 维护串行执行，总耗时是各 core 之和；慢 core 会拖慢后续 core。
