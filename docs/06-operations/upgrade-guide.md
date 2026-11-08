# 升级与老版本收编（免卸载、免迁移）

本文回答两个问题：

1. **升级** dsh-memory-hub 时，如何避免“先卸载、再安装”；
2. 已经装了老版本、已经积累了大量知识/候选/账本的 Hub，如何**原地收编**进当前版本。

核心事实只有一条：**插件包只有代码，记忆数据从来不在包里。** 所以升级 = 换代码，收编 = 指对目录，两者都不迁移数据。

## 0. 数据在哪（升级/收编前先认清）

| 数据 | 位置 |
| --- | --- |
| 全局配置 Hub | `%USERPROFILE%\.dsh\memory-hub\`：`config.yaml`、`knowledge/`、`pending/`、`records/`（`ledger.jsonl`、`sequences.json`、`index.sqlite`）、`reports/`、`history/` |
| 各核心 Hub | `core_workspaces[].root` 指向的核心目录（如 `E:\009workspace\dsh\dsh-memory-hub`），布局同上 |
| 子工作区知识 | 各工作区 root 下的 `knowledge/`、`pending/` |

`records/index.sqlite`、`records/reflect-state.json` 是**派生物**，删了会自动重建；`knowledge/`、`pending/`、`records/ledger.jsonl` 才是权威。

## 1. 升级路径 A：本地 link 模式（零卸载）

Desktop profile 的 `package.json` 把插件装成本地链接时：

```jsonc
// %USERPROFILE%\.dsh\profiles\desktop\package.json
"dependencies": { "dsh-memory-hub": "link:E:/009workspace/dsh/dsh-memory-hub/dsh-memory-hub" }
```

“升级插件” = “更新仓库”：

```powershell
cd E:\009workspace\dsh\dsh-memory-hub\dsh-memory-hub
git pull origin main        # 或 git checkout v0.7.0
npm ci                      # 可选；生产依赖为零
npm run build               # 重新生成 dist/index.js
```

然后**重启 Desktop**（或重载插件）即生效。没有卸载、没有安装、没有市场操作；记忆与配置原样保留。

确认当前是 link 模式：

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-memory-hub" | Select-Object LinkType, Target
# SymbolicLink -> E:\009workspace\dsh\dsh-memory-hub\dsh-memory-hub
```

## 2. 升级路径 B：非 Desktop profile 原地升级（CLI）

`web` / `headless` / 自定义 profile 不受 Desktop 独占保护，用该 profile 的 `dsh plugin` 原地升级——`add` 同一包名的新版本即可覆盖旧版本，**不需要先 remove**：

```powershell
dsh plugin --profile web add dsh-memory-hub@0.7.0
dsh plugin --profile web list        # 确认版本
```

`pnpm add <pkg>@<version>` 是同名版本的原地替换：卸载旧版、安装新版一步完成，`cordis.patch.yml` 条目不变，无需重新启用。

## 3. 升级路径 C：Desktop profile 从市场版迁移到 link 模式（一次性）

市场版每次升级都要“卸载再安装”，若想永久免卸载，做一次性迁移：

1. Desktop 插件管理器里卸载 `dsh-memory-hub`（记忆数据不受影响，见 §0）；
2. 把 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的依赖改成 `link:<仓库路径>`；
3. 在 profile 目录执行 `pnpm install`，并确认 `dsh.profile.bundles` 里 `dsh-memory-hub` **只出现一次**（重复会出现双重注册）；
4. 重启 Desktop。

> 迁移前备份 profile 的 `package.json`、`pnpm-lock.yaml`、`cordis.patch.yml`（目录里已有 `.bak-*` 惯例）。
> 卸载若用 `plugin_manager remove_bundle`，之后检查 `node_modules\dsh-memory-hub` 是否残留符号链接并手动删除。

## 4. 老版本收编：数据与配置的兼容性契约

以下都是**当前版本读取老数据**的既有行为，收编时不需要任何转换脚本：

| 对象 | 老版本数据 | 当前版本行为 |
| --- | --- | --- |
| 知识 frontmatter | 没有 `format` 字段 | 视为 `format: 1`，正常读取 |
| 知识 frontmatter | `format > 1`（比当前新） | **拒绝并记诊断**，文件原样保留；升级插件即可恢复，绝不“按旧格式猜着读” |
| 时效字段 | 没有 `valid_from` / `expires_at` / `last_verified` | 一律按 `fresh` 处理，排序不加成也不降权；字段在下次 commit 时才写入 |
| 候选 `pending/*.md` | 格式未变 | 原样解析、照常审批；`risk` 是**读取时重算**，不写回文件 |
| 账本 `records/ledger.jsonl` | 旧事件、旧字段 | 只追加不改写；不可解析的行忽略并记诊断；未知事件类型忽略；末尾半行启动时截断修复 |
| 账本 | 旧事件没有 `riskLevel` | 视为无风险；新事件多出的字段对旧版本只是被忽略 |
| ID 序列 | 没有 `records/sequences.json` | 由现有知识/候选文件名回填，不会撞号 |
| 配置 `config.yaml` | 没有 `storage` / `temporal` / `reflect` 等新段 | zod 默认值补齐；未知键忽略，原样可用 |
| 派生索引 | 没有 `records/index.sqlite` | `storage.index: auto` 在 ≥ `sqlite_min_entries`（默认 30000）时新建，否则内存索引；库缺失/损坏/删除都会自动重建 |

一句话：**收编不改写任何权威文件**；新字段随下一次正常写入自然生长。

## 5. 收编既有 Hub 的操作清单

适用于“公司里已经跑了几年的 Hub / Obsidian 库”：

1. **先备份**：`git init` 或直接复制整个 Hub 目录。文件是唯一真相，备份成本最低。
2. **指对目录**：在 `config.yaml` 里把 `core_workspaces[].root` / `workspaces[].root` 指到老 Hub 根目录（含 `knowledge/`），不要把知识文件复制进插件目录。
3. **只读盘点**：调 `memory_status`，看条目数、类型分布、`index.backend` 与 diagnostics；此时不写任何文件。
4. **看诊断**：diagnostics 里出现的多半是 `format` 过新、frontmatter 非法、文件名与类型不符的条目——按提示修完即恢复，未被修改的原文件仍在原处。
5. **看一眼维护报告**：`memory_maintenance`（`apply: report`）会列出 aging、未引用、近重复；这是新能力对老数据的“体检”，不需要 backfill。
6. **大规模才建索引**：条目 ≥ 30k 才需要 SQLite；启动首次多几秒重建，之后按指纹复用。`storage.index: memory` 可强制不建库。

### 收编后验证

```powershell
# 会话里
memory_status                 # 版本、条目数、index.backend、diagnostics
memory_search query: "关键决策"  # 老知识能被检索；本层无命中会回退上级核心
memory_preflight intent: "..." # 预检包能带出老知识
```

面板「知识」「待审批」两页应能看到老条目与老候选，时间标签显示 `fresh`（老数据没有时效字段时的预期）。

## 6. 回滚（数据零损失）

- 路径 A：`git checkout <旧 tag>` + `npm run build` + 重启。
- 路径 B：`dsh plugin --profile <name> add dsh-memory-hub@<旧版本>`。
- 路径 C：切回市场版本。

回滚只换代码。唯一需要留意：回滚到**不认识新账本字段**的极老版本也无妨（多余字段被忽略）；但不要把知识文件手工改回旧格式——`format` 闸门会拒绝比当前新的文件，反向不做自动降级。

## 7. 常见失败

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 面板/工具看不到老条目 | 老 Hub 不在 `core_workspaces[].root` 下，或工作区未 `enabled` | 核对 root 与 `workspaces`，`memory_status` 看 workspace 归属 |
| diagnostics 报 `format N is newer` | 用新版本写过、又用旧版本读 | 升级插件到写它的版本或更新；不要手改 `format` |
| `memory_status` 显示 `index.backend: memory` 但条目很多 | `node:sqlite` 不可用、只读 Hub 或条目低于阈值 | 看 diagnostics 的 `indexWarning`；必要时 `storage.index` 显式设置 |
| 升级后插件没生效 | 只 `git pull` 没 `npm run build`（link 模式） | 重新 build 并重启 Desktop |
| 出现两份工具/面板 | `dsh.profile.bundles` 重复，或市场版与 link 版并存 | 只保留一个 bundle 条目，删掉另一份 |
