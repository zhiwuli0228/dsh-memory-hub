# dsh-memory-hub

DeepSeek Harness（DSH）的长期记忆中枢：**文件原生、用户掌控、人类批准写入**。

> 让 DSH 记住项目里值得留下的结论：可检索、可追溯、可干预。

**V0.1.0 已实现**，并在 DSH Desktop Runtime `0.2.1-rc.5` 上完成宿主冒烟（安装、工具、预检、注入、引用、提案、审批失败关闭、配置热加载、卸载/重装）。验证记录见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

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

## 安装

仓库包含构建产物 `dist/index.js`，安装本地目录或 GitHub 包时不需要再构建。

### Desktop（由 Electron 管理的 Profile）

通过 DSH 设置里的插件管理器安装本地目录或包。Desktop 的 `desktop` profile 由 Electron 管理，**不要**用 CLI 修改它。

### CLI / 其他 Profile

```sh
dsh plugin --profile <name> add <本地目录或 github:用户/仓库>
```

安装后重启 DSH，或等待插件管理器热加载。插件加载只会在 `~/.dsh/memory-hub`（或 `$DSH_HOME/memory-hub`）下创建配置与目录，不会拖垮宿主启动。

## 配置

Hub 根目录默认是 `$DSH_HOME/memory-hub`，也可以在插件行的 `config.root` 里覆盖。策略与工作区放在 `<root>/config.yaml`：

```yaml
version: 1
workspaces:
  - id: backend
    root: 'D:/projects/backend'
    domains: [backend]
    admin: true          # 允许运行汇总
    enabled: true

policy:
  preflight:
    mode: per-turn       # per-turn | off
    pack_tokens: 600
    max_hits: 6
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

## 安全与边界

- 默认本地优先、无网络请求；知识是用户目录下的普通文件，可直接编辑、git、备份。
- 路径经过真实化与作用域校验；项目知识不会自动晋升到 global。
- 插件不修改 DSH 核心、不写 Profile 的 `package.json`/`cordis.patch.yml`；卸载保留全部记忆文件。
- V0.1 是单写者：第二个进程会降级为只读，不会并发写。

## 开发

```sh
npm install
npm run typecheck
npm run test        # 31 个单元/集成/插件入口测试
npm run build       # 产出 dist/index.js
npm run check       # typecheck + build + test
```

实现结构：

```text
src/
  index.ts            # Cordis 入口（apply / inject）
  runtime.ts          # 初始化、钩子、watcher、上下文注册
  service.ts          # 预检、门禁、引用、提案、关闭、汇总
  store.ts            # Markdown + JSONL + 序列 + 版本归档
  search.ts           # CJK 分词与倒排索引
  frontmatter.ts      # 知识/候选文件解析与序列化
  config.ts hub.ts lock.ts atomic.ts ledger.ts ...
tests/                # 31 个测试
docs/
  DESIGN.md           # V0.1 设计
  KNOWLEDGE-FORMAT.md # 知识文件格式
  COMPATIBILITY.md    # 宿主验证记录与已知限制
```

## 已知限制

- 审批**通过**路径依赖交互式审批；本机验证时审批提示被关闭，只验证了失败关闭。门禁的宿主级拒绝路径由单元测试覆盖，未在真实会话中强制触发。
- 未验证 PTC `run_code` 嵌套调用、外部 CLI、多进程共享 Hub。
- 上下文注入按"每个任务一份包"设计；长会话的累积效应尚未做规模测量。
- V0.1 无 Web UI；文件就是界面。

## 许可

[MIT](LICENSE) © 2026 zhiwuli0228
