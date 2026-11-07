# 升级方案（免卸载）

本文回答一个问题：**升级 dsh-memory-hub 时，如何避免“先卸载、再安装”？**

官方 Desktop 的插件管理器对 desktop profile 只提供“卸载再安装”，没有独立的“更新”按钮（`dsh plugin` CLI 对 desktop profile 也受保护：`profile "desktop" is managed exclusively by the Electron application`）。但 dsh-memory-hub 有两条**完全不用卸载**的升级路径，取决于插件是怎么装进 profile 的。

## 0. 关键事实：记忆数据不在插件包内

插件包（npm tarball / `node_modules/dsh-memory-hub`）里**只有代码**。所有记忆数据都在插件包之外：

| 数据 | 位置 |
| --- | --- |
| 全局配置 Hub | `%USERPROFILE%\.dsh\memory-hub\`（`config.yaml`、`records/`、`pending/`、`ledger/`、`history/`） |
| 各核心 Hub | `core_workspaces[].root`（你自己的核心目录，如 `E:\009workspace\dsh\dsh-memory-hub`） |
| 子工作区知识 | 各工作区目录下的 `knowledge/`、`pending/` |

所以**无论用哪种方式升级，记忆、候选、账本、配置一行都不会丢**——被替换的只是插件的代码包。这一条对“卸载再安装”同样成立：卸载删的是 `node_modules` 里的包，不是你的记忆。

## 1. 推荐路径 A：本地 link 模式（本机已在用，零卸载）

Desktop profile 的 `package.json` 把插件装成**本地链接**而非市场版本：

```jsonc
// %USERPROFILE%\.dsh\profiles\desktop\package.json
"dependencies": {
  "dsh-memory-hub": "link:E:/009workspace/dsh/dsh-memory-hub/dsh-memory-hub"
}
```

`node_modules/dsh-memory-hub` 是指向仓库的符号链接。此时**“升级插件” = “更新仓库”**：

```powershell
cd E:\009workspace\dsh\dsh-memory-hub\dsh-memory-hub
git pull origin main                 # 或 git checkout v0.1.7
npm ci                               # 可选；生产依赖为零，主要用于拿到 lockfile
npm run build                        # 重新生成 dist/index.js（banner 0.1.7）
```

然后**重启 Desktop**（或重载插件）即生效。全程没有卸载、没有安装、没有市场操作；记忆与配置原样保留。

适用场景：本机开发（当前桌面 profile 即此状态）、以及任何你愿意把插件指向本地目录的机器。检查当前状态：

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-memory-hub" | Select-Object LinkType, Target
# SymbolicLink -> E:\009workspace\dsh\dsh-memory-hub\dsh-memory-hub
```

## 2. 推荐路径 B：非 Desktop profile 原地升级（CLI，无卸载）

`web` / `headless` / 自定义 profile 不受 Desktop 独占保护，用 `dsh plugin`（转发给该 profile 的 pnpm）原地升级——`add` 同一包名的新版本即可覆盖旧版本，**不需要先 remove**：

```powershell
dsh plugin --profile web add dsh-memory-hub@0.1.7
dsh plugin --profile web list        # 确认 dsh-memory-hub 变为 0.1.7
```

`pnpm add <pkg>@<version>` 是同名版本的原地替换：卸载旧版、安装新版由 pnpm 在一步内完成，profile 的 `cordis.patch.yml` 条目不变，无需重新启用。

## 3. 备选路径 C：Desktop profile 一次性迁移到 link 模式

如果某台机器的 Desktop 插件是从市场（npm）装的，而你又不想每次升级都“卸载再安装”，做**一次性的迁移**，之后永久走路径 A：

1. Desktop 插件管理器里卸载 `dsh-memory-hub`（此时记忆数据不受影响，见 §0）。
2. 用文本编辑器把 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的依赖改成：
   ```jsonc
   "dsh-memory-hub": "link:E:/009workspace/dsh/dsh-memory-hub/dsh-memory-hub"
   ```
   （路径换成你 clone 仓库的目录。）
3. 在 `%USERPROFILE%\.dsh\profiles\desktop` 执行 `pnpm install`，并把 `dsh-memory-hub` 重新加进 `dsh.profile.bundles`（若被卸载时移除）。
4. 重启 Desktop。之后所有升级 = 仓库 `git pull` + `npm run build` + 重启，见路径 A。

> 说明：Desktop 独占 profile 的管理，迁移涉及手工改 `package.json`，请先备份 `package.json`、`pnpm-lock.yaml`、`cordis.patch.yml` 三个文件（profile 目录里已有同款 `.bak-*` 惯例）。

## 4. 升级后验证

```powershell
# 会话里
memory_status                # 面板或工具应显示 0.1.7 与金字塔祖先链（parentCoreIds / ancestors）
memory_search query: "蒸馏"  # 仍能命中自己的 Hub 与上级核心的知识
```

或直接看面板：知识列表顶部工具版本显示 0.1.7；双角色条目带「父核心蒸馏」标签。

## 5. 回滚（数据零损失）

- 路径 A：`git checkout v0.1.6` + `npm run build` + 重启。
- 路径 B：`dsh plugin --profile <name> add dsh-memory-hub@0.1.6`。
- 路径 C：切回市场版本 `dsh-memory-hub@0.1.6`。

回滚只换代码，记忆与配置不变。

## 6. 配置与数据兼容

- 0.1.7 **没有新增/变更任何 config 字段**（`core_workspaces` / `workspaces` / `policy` 结构不变），旧 `config.yaml` 原样可用。
- 0.1.7 新增的是可选能力（多层祖先链、L3+ 显式上推），未启用 `core_workspaces` 的安装完全无感升级。
- `engines.dsh` 仍为 `>=0.2.1-rc.5`，与 0.1.6 一致。
