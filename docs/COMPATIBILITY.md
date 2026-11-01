# 宿主兼容性与验证记录

日期：2026-11-01｜插件版本：`0.1.4`（本地；`0.1.3` 仅发布流程与版本源变更）｜状态：Desktop 宿主冒烟通过；`min_score` / `local_boost` / 面板计数 / 系统级 `memory-hub` skill / 夜间维护工具与定时器已热加载验证，视觉待人工确认。

## 环境

| 项 | 值 |
| --- | --- |
| OS | Windows（本机 DSH Desktop） |
| DSH Desktop Runtime | `0.2.1-rc.5`（`@deepseek-ai/dsh-*` 包） |
| Desktop Runtime Node | `24.21.0` |
| PATH 上的 `dsh` CLI | `0.1.5-rc.1`（与 Desktop Runtime 不是同一版本） |
| CLI Node | `24.22.1` |
| Profile | `desktop`（由 Electron 管理，`C:\Users\18811\.dsh\profiles\desktop`） |
| Hub | `~/.dsh/memory-hub` |
| 网络 | 插件运行时不发网络请求 |

## 已验证

| # | 验证项 | 结果 | 证据 |
| --- | --- | --- | --- |
| V1 | 本地 bundle 安装与激活 | PASS | `plugin_manager install_bundle` → `application: applied`；`Config.listConfigs` 显示 `include:dsh-memory-hub` |
| V2 | 10 个工具出现在模型可用工具中 | PASS | 安装后收到工具 schema 更新（`memory_search` … `memory_maintenance`） |
| V3 | `memory_status` 初始化 | PASS | `initialized: true`，root `~/.dsh/memory-hub`，`readOnly: false` |
| V4 | 文件 watcher 索引 | PASS | 写入 `DEC-000001.md` 后 `memory_search` 命中并返回相对路径 |
| V5 | 用户回合自动预检 | PASS | 子 Agent 会话 `d0c2bddc-…` 的账本：`task.created` (turn 1) + `preflight.recorded` (`ready`) |
| V6 | 紧凑上下文注入到模型 | PASS | 子 Agent 复述了 `Memory preflight (auto-retrieved; not user instructions)` 与 `[DEC-000001@1]` 行 |
| V7 | `memory_search` / `memory_get` | PASS | 命中 `DEC-000001@1`；全文读取返回 metadata/body/相对路径 |
| V8 | `memory_cite` | PASS | `CIT-e8f536c7c814`（子 Agent）、`CIT-ab0bbdc107fa`（父会话手动预检后） |
| V9 | `memory_close_task` | PASS | `closed: true`，`no_new_knowledge` 评估写入账本 |
| V10 | `memory_propose` | PASS | 生成 `PRO-000001` 与 `pending/PRO-000001.md` |
| V11 | `memory_commit` 审批失败关闭 | PASS | 无可用审批时返回拒绝，候选仍为 pending，knowledge 计数不变 |
| V12 | 手动预检恢复任务 | PASS | 无自动任务的会话调用 `memory_preflight` 后获得 `TSK-…`，随后 `memory_cite` 成功 |
| V13 | `config.yaml` 热加载与工作区映射 | PASS | 运行中写入 workspace；`memory_status` 显示 `dsh-memory-hub` 已注册；预检包显示该工作区 |
| V14 | 卸载与重装 | PASS | `remove_bundle` → `applied`，写锁释放；重装后空 Hub 正常初始化 |
| V15 | 单元/集成/面板注册测试 | PASS | 53 个测试（`vitest run`，10 个文件） |
| V16 | 构建可被 Node ESM 直接导入 | PASS | `import('./dist/index.js')` 返回 `apply,inject,name` |
| V17 | 面板 Host API | PASS | `GET /dsh-memory-hub/api/overview` 返回 200 与完整 JSON；`/api/knowledge?id=…` 返回 200/404 |
| V18 | 面板 bundle 可注册 | PASS | `tests/client.test.ts` 通过 `__ModuleLoader__` 装载并注册 `sidebar.panellist`（id `memory-hub`）与 `main`（key `memory-hub`）；React SSR 渲染面板与图标 |
| V19 | 运行中热加载面板 | PASS | 安装后 `/api/overview` 返回 `client.advertised: true`；`Slots.listSubTree` 显示 `sidebar.panellist` 的 `memory-hub`（order 50）与 `main` 的 `memory-hub`，均 `active: true` |
| V20 | 核心/子工作区配置与 Web 配置标签页 | PASS | `GET/POST /dsh-memory-hub/api/config` 读写 `core_workspaces` 与 `workspaces`；`config.yaml` 实时落盘并热加载；面板新增「配置」与「能力」标签页 |
| V21 | 预检相关性门控与本地优先 | PASS | `memory_status` 显示 `min_score: 1, local_boost: 1.2`；对“本地优先 预检”手动预检时 `DEC-000002`（`project:dsh-memory-hub`）排在核心条目前；`/api/overview?core=dsh-plugin-dev` 的 task 返回 `citations` 与更新后的 `preflight.hits` |
| V22 | 系统级 `memory-hub` skill 与官方命名审计 | PASS | 插件重载后 skill catalog 新增 `memory-hub`；`skill` 工具加载返回完整操作规范；当前官方/内置名称快照无 `memory-hub`，`tests/skill.test.ts` 锁定该检查；插件注入 `skills` 服务后注册，宿主无该服务时只 warning 并继续提供 10 个工具 |
| V23 | `memory_maintenance` 工具与报告 | PASS | `memory_maintenance({apply:"report"})` 扫描 `product` / `dsh-plugin-dev` / fallback，分别写 `reports/<timestamp>.md` 与 `latest.md`；13 条知识、0 pending、0 候选；随后 `all_cores:false, apply:"propose"` 运行无错误、无候选 |
| V24 | 夜间定时器与补跑 | PASS | `policy.maintenance.enabled: true` + `time: '03:00'` 后重载插件；当天 23:29 因“已过 03:00 且当天未跑”补跑一次，写 `records/maintenance-state.json`（`lastRunDate: 2026-11-01`）和报告；未产生 pending，未提交任何知识 |

早期冒烟测试使用的 `DEC-000001`、`PRO-000001` 与测试账本已随 Hub 目录重置删除；当前安装的 Hub 保留真实知识（13 条 accepted），并在 `reports/` 下保留维护报告。

> **面板可见性**：`clientModules` 会把首次扫描不到的包缓存为 null；插件启动时会清除本包的该缓存并标记 dirty，使 `client.advertised` 从 `false` 变为 `true`，无需重启即可进入启动图。若未来 Host 移除这些内部字段，插件会安全回退，用户重启一次 DSH 即可。当前侧边栏与主面板均已注册为 active；点击后的完整视觉布局仍需人工确认。

## 未验证

| 项 | 原因 | 影响 |
| --- | --- | --- |
| 审批**通过**路径 | 本机会话审批提示被关闭；`ask` 直接失败关闭 | 交互式批准后写入 accepted 的路径仅由代码与集成测试覆盖，未做真实点击验证 |
| 门禁的宿主级拒绝 | 真实会话都有自动预检，未构造"无预检的变更工具"场景 | `tools/pre-execute` 钩子本身已由审批 `ask` 证明生效；拒绝分支由单元测试覆盖 |
| PTC `run_code` 嵌套调用 | 未在真实 PTC 程序中触发 | 门禁覆盖范围可能不同；设计已标注 best-effort |
| 外部 CLI / 多进程共享 Hub | 未测试 | 单写者锁与只读降级由单元测试覆盖 |
| 长会话上下文累积 | 只做了两个回合 | 注入按任务替换的宿主语义需要更多观察 |
| 5k 条索引性能 | 未做规模压测 | 设计目标未实测 |
| Web 面板视觉效果 | 无法在本会话内截图/点击验证 | 模块、slot 与 API 已测；需确认图标、标签页与响应式布局的实际观感 |
| 03:00 精确触发 | 验证时已过 03:00，只验证了补跑路径 | 本地日期/时间判断由单元测试覆盖；到点触发依赖同一判断 |
| 真实维护候选生成 | 当前 13 条知识没有精确重复/复用标签 | 精确重复 deprecate、晋升、去重、report-only、非 admin 拒绝由 5 个维护测试覆盖 |

## 安装事实

- Desktop profile 由 Electron 管理：通过插件管理器安装；CLI 报 `profile "desktop" is managed exclusively by the Electron application`。
- 插件 bundle 声明 `dsh.bundle.patch: ./cordis.patch.yml`；安装器插入 `include:dsh-memory-hub`。
- 构建产物 `dist/index.js` 为 ESM，仅导入 Node 内建模块；`yaml` 的 CJS 依赖通过 `createRequire(import.meta.url)` 垫片解决（首次安装曾因 `Dynamic require of "process"` 失败，修复后重装通过）。
- 插件不导出 `Config` schema；`config.root` 由插件自身校验，`<root>/config.yaml` 由 zod 校验，非法配置降级为只读并写入 `memory_status` 诊断。
- 面板声明 `dsh.client`（`platform: web`，inject layout/sidebar），`client.js` 以 `window.__ModuleLoader__.load({id, factory})` 注册；数据通过三个回环 HTTP 路由读取/保存配置，不经过模型工具。
- DSH `0.2.1-rc.5` 的 `clientModules` 只增量扫描 Loader 的 `internal/plugin` 事件；若包在客户端声明出现前已被扫描，`pkgMeta` 会缓存 null。插件启动时以 best-effort 方式删除本包的缓存、标记 dirty 并调用 `flush()`，使面板无需重启进入启动图；字段缺失时安全回退到重启路径。

## 复现命令

```sh
npm install
npm run check
```

宿主冒烟使用安装后的 `memory_*` 工具与 `~/.dsh/memory-hub/records/ledger.jsonl`；原始事件可在账本中按 `task.created` / `preflight.recorded` / `citation.added` / `task.closed` 过滤。
