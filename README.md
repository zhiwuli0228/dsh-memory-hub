# dsh-memory-hub

[![npm version](https://img.shields.io/npm/v/dsh-memory-hub.svg)](https://www.npmjs.com/package/dsh-memory-hub)

DeepSeek Harness（DSH）的长期记忆中枢：**文件原生、用户掌控、人类批准写入**。

> 让 DSH 记住项目里值得留下的结论：可检索、可追溯、可干预。

**V0.1.3 已发布**：Host 插件 + Web 面板（含核心/子工作区配置），并在 DSH Desktop Runtime `0.2.1-rc.5` 上完成宿主冒烟（安装、工具、预检、注入、引用、提案、审批失败关闭、配置热加载、面板热加载、卸载/重装）。本版本补齐 GitHub Actions Trusted Publisher 自动发布与版本一致性。验证记录见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

> **当前工作树为 V0.1.4（未发布）**：预检加入 `min_score` / `local_boost`，包尾改为指令式回写提示，面板任务行显示命中/引用计数，并注册系统级 `memory-hub` skill。npm 上仍是 `0.1.3`。

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
| 系统级 Skill | `memory-hub` 注册到 Host 全局 skills 层，按需加载检索/回写流程；不占每轮上下文 |

## Web 面板

重启后，左侧边栏出现「记忆中枢」图标，主区域提供六个标签页：

- **总览**：状态、计数、精简的能力标签、记忆闭环示意、工作区与最近知识
- **配置**：核心工作区与子工作区（一对多）管理；可添加核心、添加子工作区并实时保存到 `config.yaml`
- **知识**：搜索、类型/状态过滤、全文详情与来源
- **待审批**：`pending/` 候选列表（只读，不代替 DSH 审批）
- **活动与策略**：最近任务、预检/门禁/证据要求
- **能力**：9 个 `memory_*` 工具的详细说明

面板通过 Host 路由 `/dsh-memory-hub/api/overview`、 `/dsh-memory-hub/api/knowledge` 和 `/dsh-memory-hub/api/config` 读取/保存数据，只允许回环请求；知识审批仍走 DSH 原生流程，面板不绕过。

## 安装

已发布到 npm：[`dsh-memory-hub`](https://www.npmjs.com/package/dsh-memory-hub)。

### DSH 插件管理器（推荐）

插件是 profile bundle，直接安装 npm spec，不要只做 `npm install -g`：

```sh
dsh plugin --profile <name> add dsh-memory-hub@0.1.3
```

只想查看包内容时可以用：

```sh
npm pack dsh-memory-hub@0.1.3
```

### Desktop（由 Electron 管理的 Profile）

通过 DSH 设置里的插件管理器安装 `dsh-memory-hub@0.1.3`。Desktop 的 `desktop` profile 由 Electron 管理，**不要**用 CLI 修改它。

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
workspaces:
  - id: backend
    core_id: product     # 归属到核心工作区 product（可选）
    root: 'D:/projects/backend'
    domains: [backend]
    admin: true          # 允许运行汇总
    enabled: true

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
```

- 只有工作目录落在某个 `workspace.root` 内的会话才获得 `project:<id>` 作用域；其他会话只看到 global/domain。
- `config.yaml` 修改会被 watcher 热加载，不需要重启。
- 目录与文件格式见 [docs/KNOWLEDGE-FORMAT.md](docs/KNOWLEDGE-FORMAT.md)。

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

`memory_commit` 会触发 DSH 原生审批；审批不可用（headless、审批关闭）时提交被拒绝，候选保持 `pending`。模型参数里没有可伪造的批准令牌。

### 系统级记忆 Skill

插件还会在 Host 的全局 skills 层注册 `memory-hub`。它不是第 10 个工具，而是一份**按需加载的操作规范**：

- 模型在任务涉及历史决策、约束、API、流程、回写，或用户说“记住/记录/以后按这个来”时加载；
- 用户也可以直接调用 `skill` 工具加载；
- 正文不进入每轮上下文，catalog 只显示 description 和 whenToUse；
- 覆盖固定流程（预检 → `memory_get` → `memory_cite` → 必要时 `memory_search` → `memory_close_task`）、作用域选择、写入审批、核心回填和反模式；
- 宿主没有 `skills` 服务时只记录 warning，插件继续运行。

**命名冲突**：当前官方/内置 skill（`agent-experience`、`cordis-*`、`office*` 等）没有 `memory-hub`，也没有旧的通用名 `memory-management`。DSH 同 layer 内按 rank 取第一个，runtime（250）会盖住 bundled（600），所以通用名一旦撞上官方 skill 会静默遮蔽而不是报错。因此本插件改用产品自有名 `memory-hub`，并在 `tests/skill.test.ts` 锁定当前官方名称快照；完整审计见 [docs/02-harness/context-policy.md](docs/02-harness/context-policy.md#与官方-skill-的命名冲突审计)。

## 安全与边界

- 默认本地优先、无网络请求；知识是用户目录下的普通文件，可直接编辑、git、备份。
- 路径经过真实化与作用域校验；项目知识不会自动晋升到 global。
- 插件不修改 DSH 核心、不写 Profile 的 `package.json`/`cordis.patch.yml`；卸载保留全部记忆文件。
- V0.1 是单写者：第二个进程会降级为只读，不会并发写。

## 开发

```sh
npm install
npm run typecheck
npm run test        # 45 个单元/集成/插件/面板注册/skill 测试
npm run build       # 产出 dist/index.js
npm run check       # typecheck + build + test
```

实现结构：

```text
src/
  index.ts            # Cordis 入口（apply / inject）
  runtime.ts          # 初始化、钩子、watcher、上下文注册、面板 API
  service.ts          # 预检、门禁、引用、提案、关闭、汇总、面板数据
  store.ts            # Markdown + JSONL + 序列 + 版本归档
  search.ts           # CJK 分词与倒排索引
  frontmatter.ts      # 知识/候选文件解析与序列化
  skill.ts            # 系统级 memory-hub skill 定义与注册
  config.ts hub.ts lock.ts atomic.ts ledger.ts ...
client.js             # 侧边栏面板（模块加载器格式，无需构建）
tests/                # 45 个测试
docs/
  DESIGN.md           # V0.1 设计
  KNOWLEDGE-FORMAT.md # 知识文件格式
  COMPATIBILITY.md    # 宿主验证记录与已知限制
```

## 发布

推送 `v*` tag 会触发 GitHub Actions：在 Windows 上运行 typecheck、build、test，打包 npm tarball，通过 npm Trusted Publisher（OIDC）发布 npm，并创建 GitHub Release。首次使用前需要在 npm 包设置里绑定仓库和 `release.yml`，无需 `NPM_TOKEN`。步骤见 [docs/06-operations/release.md](docs/06-operations/release.md)。

```sh
git tag v0.1.3
git push origin v0.1.3
```

## 已知限制

- 审批**通过**路径依赖交互式审批；本机验证时审批提示被关闭，只验证了失败关闭。门禁的宿主级拒绝路径由单元测试覆盖，未在真实会话中强制触发。
- 未验证 PTC `run_code` 嵌套调用、外部 CLI、多进程共享 Hub。
- 上下文注入按"每个任务一份包"设计；长会话的累积效应尚未做规模测量。
- Web 面板的客户端模块已在本机运行中热加载（`client.advertised: true`，`sidebar.panellist` 与 `main` 均 active）；点击后的完整视觉布局尚未在本会话中截图确认。
- 面板只读，不提供批准按钮；提交仍需在会话中经过 DSH 审批。

## 许可

[MIT](LICENSE) © 2026 zhiwuli0228
