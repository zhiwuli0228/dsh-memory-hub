# dsh-memory-hub

[![npm version](https://img.shields.io/npm/v/dsh-memory-hub.svg)](https://www.npmjs.com/package/dsh-memory-hub)

DeepSeek Harness（DSH）的长期记忆中枢：**文件原生、用户掌控、人类批准写入**。

> 让 DSH 记住项目里值得留下的结论：可检索、可追溯、可干预。

**V0.7.0 已发布**：在文件原生 Hub 之上，加入时效字段（`valid_from` / `expires_at` / `last_verified`）、近重复检测与 `merge` 合并、回顾式萃取（`memory_reflect`，含原文 `search` 模式）、引用驱动生命周期（aging 参考最近引用）、写入风险标记、派生 SQLite 索引（零依赖，按需建库）、面板批量审批，以及**每个 Hub 自动生成的目录说明书 README**（解释每个文件夹、澄清 `assets` 含义）。已在 DSH Desktop Runtime `0.2.1-rc.5` 完成宿主冒烟。验证记录见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

> 左侧边栏会新增「记忆中枢」图标。安装包含面板的版本后如果暂时没出现，重启一次 DSH 即可；本机已在运行中热加载成功。

## 它是什么

一条知识是一个带 YAML frontmatter 的 Markdown 文件，放在用户目录下的 Hub 里。每个用户回合开始时，插件做一次确定性检索，注入一份紧凑索引；模型按需读取全文、记录引用；任务结束给出回写评估；候选知识经 DSH 原生审批后才成为权威知识。

| 能力 | 说明 |
| --- | --- |
| 自动预检 | 每个用户回合第一步检索 accepted 知识，幂等键 `(sessionId, turn)` |
| 紧凑注入 | 只注入 ID、标题、一句话摘要、作用域；细节按需读取 |
| 检索与读取 | 关键词 + 类型 + 作用域 + 状态；CJK 二元组分词，无向量库 |
| 引用 | 区分"检索命中"与"实际使用"；记录 ID、版本、用途 |
| 候选与提交 | 候选写 `pending/`；提交必须经过 DSH 审批；模型不能自批 |
| 门禁 | 变更工具需要本回合有效预检；预检故障默认放行（可配置为拒绝） |
| 收尾 | 每个关闭任务都有评估；未评估的回合自动记 `deferred` |
| 汇总 | 管理员手动把项目知识晋升为 global 候选；按 `promoted_from` 幂等 |
| 多核心仓 | 每个 `core_workspaces[].root` 是一个独立 Hub；会话按工作目录最长前缀路由 |
| 双角色工作区 | 同一 `id` 可同时是核心工作区与另一个核心的子工作区（V0.1.7）：会话路由到自己的 Hub，父核心 Hub 挂为二级检索来源 |
| 金字塔记忆 | 沿 `core_id` 逐层上推父/祖父/…（最多 8 层，带环检测）；越靠自己的工作区记忆越完整，越往顶层越是蒸馏共享知识；检索以当前工作区为主，本层无命中才逐层上溯 |
| 分级蒸馏 | L1 `scope:"core"` 写自己的 Hub；L2 `scope:"parent"` 写父核心 Hub；L3+ 显式 `project:<祖先核心>` 逐层上推；`memory_get`/`cite`/`commit` 支持 `core` 参数 |
| 夜间维护 | 每天 03:00 确定性巡检所有 core / 子工作区，写报告并按需生成 pending 提案；不自动提交 |
| 系统级 Skill | `memory-hub` 注册到 Host 全局 skills 层，按需加载检索/回写流程；不占每轮上下文 |

## 5 分钟初始化工作区

### 1. 先分清两种目录

- **配置 Hub**：默认 `~/.dsh/memory-hub`（或 `$DSH_HOME/memory-hub`），保存 `config.yaml`；只有“工作目录不匹配任何 workspace”的会话才会把数据兜底写在这里。
- **数据 Hub**：每个 `core_workspaces[].root` 是一个独立 Hub，`knowledge/`、`pending/`、`records/` 都在该目录下。
- 子工作区的知识写进**所属核心**的 Hub（`project:backend` 的条目在 `product/` 目录里），不在子工作区自己的目录。

> 每个 Hub 根目录初始化时会自动生成 `README.md`，逐条解释每个文件夹的作用、能不能手改、删了会怎样，以及 `assets` 到底是什么。**第一次接触一个 Hub，先读它。**

### 2. 写最小配置

```yaml
# ~/.dsh/memory-hub/config.yaml（也可在面板「配置」页操作）
core_workspaces:
  - id: product
    root: 'E:/work/product'          # 必填：这个核心的 Hub 根目录
workspaces:
  - id: backend
    core_id: product                 # 归属核心
    root: 'E:/work/product/backend'  # 会话按最长前缀路由到这里
    admin: true
```

保存后 watcher 热加载，无需重启；新目录首次会初始化 `knowledge/`、`pending/`、`records/` 等并生成 `README.md`。只写 `id` 不写 `root` 的核心工作区不会打开 Hub，会话会落到兜底 Hub。

### 3. 验证三件事

| 检查 | 期望 |
| --- | --- |
| `memory_status` | `root` 指向你配置的目录，工作区与条目数正确 |
| `<root>/README.md` | 含「目录地图」「`assets` 含义」「写入流程」三节 |
| 面板「配置」 | 核心/子工作区与 `config.yaml` 一致 |

### 4. 初始化后立刻看到的目录

| 目录 | 一句话 |
| --- | --- |
| `knowledge/<type>/` | 权威知识，只能经人工审批写入 |
| `pending/` | 候选，等人批准；`pending/archive/` 是已处理 |
| `records/` | 账本（只追加）、ID 序号、派生索引、回顾水位 |
| `history/` | 每次提交的旧版本快照 |
| `reports/` | 维护报告 |
| `index/` | 旧版遗留的空目录，可删 |

## Web 面板

重启后，左侧边栏出现「记忆中枢」图标，主区域提供六个标签页：

- **总览**：状态、计数、精简的能力标签、记忆闭环示意、工作区与最近知识
- **配置**：核心工作区与子工作区（一对多）管理；可添加核心、添加子工作区并实时保存到 `config.yaml`
- **知识**：搜索、类型/状态过滤、全文详情与来源
- **待审批**：`pending/` 候选列表（只读，不代替 DSH 审批）
- **活动与策略**：最近任务、预检/门禁/证据要求
- **能力**：10 个 `memory_*` 工具的详细说明

面板通过 Host 路由 `/dsh-memory-hub/api/overview`、 `/dsh-memory-hub/api/knowledge` 和 `/dsh-memory-hub/api/config` 读取/保存数据，只允许回环请求；知识审批仍走 DSH 原生流程，面板不绕过。

## 安装

已发布到 npm：[`dsh-memory-hub`](https://www.npmjs.com/package/dsh-memory-hub)。

### DSH 插件管理器（推荐）

插件是 profile bundle，直接安装 npm spec，不要只做 `npm install -g`：

```sh
dsh plugin --profile <name> add dsh-memory-hub@0.1.5
```

只想查看包内容时可以用：

```sh
npm pack dsh-memory-hub@0.1.5
```

### Desktop（由 Electron 管理的 Profile）

通过 DSH 设置里的插件管理器安装 `dsh-memory-hub@0.1.5`。Desktop 的 `desktop` profile 由 Electron 管理，**不要**用 CLI 修改它。

### 本地目录 / GitHub

仓库包含构建产物 `dist/index.js` 与 `client.js`，安装本地目录或 GitHub 包时不需要再构建：

```sh
dsh plugin --profile <name> add <本地目录或 github:用户/仓库>
```

### 插件市场索引

DSH 的插件市场是自托管 JSON 索引。本仓库提供一份：

```text
https://cdn.jsdelivr.net/gh/zhiwuli0228/dsh-memory-hub@main/site/index.json
```

在 DSH 插件页打开实验性「自定义插件市场」，添加上述索引源即可在「发现」中安装。

安装后重启 DSH，或等待插件管理器热加载。插件加载只会在 `~/.dsh/memory-hub`（或 `$DSH_HOME/memory-hub`）下创建配置与目录，不会拖垮宿主启动。

## 配置

Hub 根目录默认是 `$DSH_HOME/memory-hub`，也可以在插件行的 `config.root` 里覆盖。策略与工作区放在 `<root>/config.yaml`：

```yaml
version: 1
core_workspaces:
  - id: product
    name: '产品主仓库'
    root: 'E:/work/product'   # 必填：核心 Hub 根目录；省略则该核心不打开 Hub
workspaces:
  - id: backend
    core_id: product     # 归属到核心工作区 product（可选）
    root: 'D:/projects/backend'
    domains: [backend]
    admin: true          # 允许运行汇总
    enabled: true
    distill:             # 可选：定时蒸馏（也可在面板「配置」页设置）
      enabled: true
      time: '04:00'      # 本地时间 HH:mm
      target: new        # new = 每次新建会话（cwd = root）；session = 投递到指定会话
      # session_id: session-xxxx
      max_proposals: 5

policy:
  preflight:
    mode: per-turn       # per-turn | off
    pack_tokens: 600
    max_hits: 6
    min_score: 1.0       # drop weak matches; 0 keeps every hit
    local_boost: 1.2     # prefer the current project over core knowledge
    inject: compact
  gate:
    mode: enforce        # enforce | off
    on_preflight_error: allow   # allow | deny
    unknown_tools: allow
    mutating_tools: [bash, pwsh, write, edit, str_replace_editor]
  maintenance:
    enabled: true        # Host 运行时每天巡检；错过的时间在下一次启动后补跑
    time: '03:00'        # 本地时间 HH:mm
    apply: propose       # report | propose；propose 只创建 pending，不提交
    all_cores: true
    max_proposals: 10
    stale_pending_days: 30
    stale_citation_days: 90
  temporal:                # 时效降权；默认即可，不配也生效
    aging_days: 90
  approval:
    mode: manual           # manual | auto（仅测试环境用 auto）

storage:
  index: auto              # auto | memory | sqlite；auto 在 ≥3 万条目时才建派生索引
  sqlite_min_entries: 30000
  index_candidate_limit: 2000
```

- 只有工作目录落在某个 `workspace.root` 内的会话才获得 `project:<id>` 作用域；其他会话只看到 global/domain，并落到配置 Hub 的兜底数据里。
- `core_workspaces[].root` 决定这个核心的数据写在哪；子工作区共用核心的 Hub，不单独建库。
- `config.yaml` 修改会被 watcher 热加载，不需要重启。
- 目录与文件格式见 [docs/KNOWLEDGE-FORMAT.md](docs/KNOWLEDGE-FORMAT.md)；九类知识的定义见 [docs/05-domain/knowledge-types.md](docs/05-domain/knowledge-types.md)。

## 工具

| 工具 | 用途 |
| --- | --- |
| `memory_search` | 检索 accepted 知识 |
| `memory_get` | 读取条目全文与来源 |
| `memory_status` | 根目录、工作区、计数、索引诊断 |
| `memory_preflight` | 手动/强制预检（没有自动任务时会创建一个可恢复任务） |
| `memory_cite` | 记录实际使用 |
| `memory_propose` | 创建候选（create / update / deprecate） |
| `memory_commit` | 经审批提交候选 |
| `memory_close_task` | 关闭任务并给出评估 |
| `memory_consolidate` | 管理员手动晋升项目知识 |
| `memory_duplicates` | 近重复检查（只读，给 keeper 建议） |
| `memory_reflect` | 回顾已结束会话：`digest` 摘要 / `search` 原文取证 |
| `memory_maintenance` | 巡检当前/全部 core，写报告并可选生成 pending 维护提案 |

`memory_commit` 会触发 DSH 原生审批；审批不可用（headless、审批关闭）时提交被拒绝，候选保持 `pending`。模型参数里没有可伪造的批准令牌。

### 夜间维护

`policy.maintenance.enabled: true` 后，Host 每 60 秒检查一次本地时间；到点当天只跑一次，错过的时间在下一次 Host 启动后补跑一次。它使用**插件内部定时器**，不是 DSH `schedule`，因此**不会出现在官方「自动化任务」栏**；控制入口是 `config.yaml`。

多个 core 时是一个全局定时器，按 `core_workspaces[]` 配置顺序**串行**巡检，fallback 最后；每个 core 独立写 `<hub>/reports/<timestamp>.md` 和 `latest.md`，然后：

- 精确重复（标题 + 摘要 + 正文哈希一致）→ 生成 **deprecate** pending 提案；
- 带 `core` / `shared` / `reusable` / `promote` 标签的子工作区知识 → 生成晋升到核心作用域的 pending 提案；
- 近似重复、过期 pending、长期未引用、加载诊断、超长正文、作用域异常 → 只写报告，留给人判断。

维护任务**永不**调用 `memory_commit`、不删除、不改写正文；同一指纹已有 pending 时跳过，避免每晚重复。也可以随时手动调用 `memory_maintenance`，用 `apply: "report"` 只看报告。

多 core 的完整顺序、单 core 失败语义、状态文件和配置含义见 [docs/01-architecture/maintenance.md](docs/01-architecture/maintenance.md)；每日检查与排障见 [docs/06-operations/maintenance.md](docs/06-operations/maintenance.md)。

### 定时蒸馏

每个核心/子工作区都可以配置 `distill`（面板「配置」页有同一组控件）：到点后由 **DSH `schedule` 服务**启动一次蒸馏，因此会出现在官方「自动化任务」栏。

- `target: new`（默认）：每次投递新建一个会话，`cwd` 固定为工作区 `root`，保证记忆路由到正确工作区；
- `target: session` + `session_id`：投递到已有会话（会话必须存在，且不能是委派子会话）；
- 蒸馏提示词只做三件事：读本工作区 L1 → `memory_propose` 到上级核心（`scope: "project:<父核心>"`；无上级时 `memory_consolidate` 到 global）→ `memory_close_task`；
- **永不** `memory_commit`：候选仍需在面板「待审批」人工批准；
- 插件启动和 `config.yaml` 热更新时会对比 Host 任务并增/改/删（标题前缀 `memory-hub:distill:`），单条失败只回填诊断，不影响其他工作区。

配置字段、失败排查与卸载行为见 [docs/06-operations/distillation-schedule.md](docs/06-operations/distillation-schedule.md)。

### 系统级记忆 Skill

插件还会在 Host 的全局 skills 层注册 `memory-hub`。它是一项**按需加载的操作规范**，不占用工具名额：

- 模型在任务涉及历史决策、约束、API、流程、回写，或用户说“记住/记录/以后按这个来”时加载；
- 用户也可以直接调用 `skill` 工具加载；
- 正文不进入每轮上下文，catalog 只显示 description 和 whenToUse；
- 覆盖固定流程（预检 → `memory_get` → `memory_cite` → 必要时 `memory_search` → `memory_close_task`）、作用域选择、写入审批、核心回填、夜间维护和反模式；
- 宿主没有 `skills` 服务时只记录 warning，插件继续运行。

**命名冲突**：当前官方/内置 skill（`agent-experience`、`cordis-*`、`office*` 等）没有 `memory-hub`，也没有旧的通用名 `memory-management`。DSH 同 layer 内按 rank 取第一个，runtime（250）会盖住 bundled（600），所以通用名一旦撞上官方 skill 会静默遮蔽而不是报错。因此本插件改用产品自有名 `memory-hub`，并在 `tests/skill.test.ts` 锁定当前官方名称快照；完整审计见 [docs/02-harness/context-policy.md](docs/02-harness/context-policy.md#与官方-skill-的命名冲突审计)。

## 安全与边界

- 默认本地优先、无网络请求；知识是用户目录下的普通文件，可直接编辑、git、备份。
- 路径经过真实化与作用域校验；项目知识不会自动晋升到 global。
- 夜间维护只写报告和 pending 提案，不自动提交、不删除、不改写正文；审批仍由人完成。
- 插件不修改 DSH 核心、不写 Profile 的 `package.json`/`cordis.patch.yml`；卸载保留全部记忆文件。
- V0.1 是**每个根目录一个写者**：第二个写者只让该根降级为只读，不会并发写，也不会波及其他工作区；跨机拷贝或进程退出留下的锁，在确认不是本机活写者后自动回收（`<root>/records/.writer.lock`）。

## 开发

```sh
npm install
npm run typecheck
npm run test        # 59 个单元/集成/插件/面板注册/skill/维护/锁测试
npm run build       # 产出 dist/index.js
npm run check       # typecheck + build + test
```

实现结构：

```text
src/
  index.ts            # Cordis 入口（apply / inject）
  runtime.ts          # 初始化、钩子、watcher、上下文注册、面板 API
  service.ts          # 预检、门禁、引用、提案、关闭、汇总、维护、面板数据
  maintenance.ts      # 确定性巡检：重复/晋升/过期/诊断，报告渲染
  maintenance-schedule.ts # 本地日期/时间判断
  store.ts            # Markdown + JSONL + 序列 + 版本归档
  search.ts           # CJK 分词与倒排索引
  frontmatter.ts      # 知识/候选文件解析与序列化
  skill.ts            # 系统级 memory-hub skill 定义与注册
  config.ts hub.ts lock.ts atomic.ts ledger.ts ...
client.js             # 侧边栏面板（模块加载器格式，无需构建）
tests/                # 59 个测试（10 个文件）
docs/
  DESIGN.md           # V0.1 设计
  KNOWLEDGE-FORMAT.md # 知识文件格式
  COMPATIBILITY.md    # 宿主验证记录与已知限制
  00-project/decision-log.md      # 按日期的决策与改动记录
  01-architecture/maintenance.md  # 多 core 夜间维护执行模型
  01-architecture/decisions/      # ADR-0004 skill、ADR-0005 夜间维护
  06-operations/maintenance.md    # 维护操作与排障
```

## 发布

推送 `v*` tag 会触发 GitHub Actions：在 Windows 上运行 typecheck、build、test，打包 npm tarball，通过 npm Trusted Publisher（OIDC）发布 npm，并创建 GitHub Release。首次使用前需要在 npm 包设置里绑定仓库和 `release.yml`，无需 `NPM_TOKEN`。步骤见 [docs/06-operations/release.md](docs/06-operations/release.md)。

```sh
git tag v0.1.5
git push origin v0.1.5
```

## 已知限制

- 审批**通过**路径依赖交互式审批；本机验证时审批提示被关闭，只验证了失败关闭。门禁的宿主级拒绝路径由单元测试覆盖，未在真实会话中强制触发。
- 未验证 PTC `run_code` 嵌套调用、外部 CLI、多进程共享 Hub。
- 上下文注入按"每个任务一份包"设计；长会话的累积效应尚未做规模测量。
- Web 面板的客户端模块已在本机运行中热加载（`client.advertised: true`，`sidebar.panellist` 与 `main` 均 active）；点击后的完整视觉布局尚未在本会话中截图确认。
- 面板「待审批」可人工点击批准/拒绝，支持勾选批量（`panel:human`，`policy.panel.review` 可关闭）；提交的候选仍需人工审核，模型不能自批。
- 夜间维护依赖 Host 运行；Host 关闭时不会执行，下一次启动且当天未跑过会补跑一次。
- 多 core 维护串行执行，总耗时是各 core 之和；一个 core 失败当天不重试。
- 维护不出现在官方「自动化任务」栏，不能在那里暂停/编辑/立即运行；控制入口是 `config.yaml`。
- `reports/` 目前不自动清理；条目多时可定期归档或删除旧报告。

## 许可

[MIT](LICENSE) © 2026 zhiwuli0228
