# Deployment Guide

## 通过 DSH 插件管理器安装

### Desktop

1. 打开 DSH Desktop 设置 → 插件。
2. 选择「安装本地目录」或包。
3. 选择 `dsh-memory-hub` 目录。
4. 等待安装完成。
5. 插件会在 `~/.dsh/memory-hub`（或 `$DSH_HOME/memory-hub`）初始化配置。
6. 左侧边栏出现「记忆中枢」图标即表示面板注册成功；若未出现，重启 DSH。

### CLI / 其他 Profile

```sh
dsh plugin --profile <name> add <本地目录或 github:用户/仓库>
```

## 配置

编辑 `<root>/config.yaml`：

```yaml
version: 1
core_workspaces:
  - id: product
    name: 产品主仓库
workspaces:
  - id: backend
    core_id: product
    root: 'D:/projects/backend'
    domains: [backend]
    admin: true
    enabled: true
```

配置修改后会由 watcher 热加载，无需重启。

夜间维护是可选配置：

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

它使用插件内部定时器，不创建 DSH `schedule`，不会出现在官方「自动化任务」栏。操作与排障见 [maintenance.md](maintenance.md)。

## 卸载

通过插件管理器卸载。卸载后记忆文件保留在 `~/.dsh/memory-hub`。

## 备份

复制整个 Hub 根目录即可。

## 升级

1. 备份旧目录。
2. 安装新版本。
3. 检查 `docs/COMPATIBILITY.md` 中的验证记录。
4. 如遇格式升级，按提示处理。

## 多进程注意

- 每个根目录一个写者；锁是**租约**（心跳 15s，租约 `storage.lock_stale_ms` 默认 10 分钟）。
- 第二个进程只让冲突的那个根降级为只读，其他工作区根仍可写；对方退出后，被降级进程会在下一次写入时自动重抢锁，不需要重启。
- 不建议多进程并发写同一个根；跨机拷贝的残留锁会被自动识别（`host` 不符），崩溃写者（pid 不存在）立即回收，挂死写者最多阻塞一个租约。
- 锁在 `<root>/records/.writer.lock`；正常退出会主动释放，硬崩溃由租约兜底。手动删锁只作为最后手段——若对方其实还活着，会短暂出现两个写者。
