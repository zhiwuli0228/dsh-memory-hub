import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureDir, writeAtomic } from './atomic.js'
import type { Hub } from './hub.js'
import { KNOWLEDGE_TYPES, TYPE_PREFIX } from './types.js'

/** 生成的 Hub README 版本；只有低于这个版本且仍带标记时才重写。 */
export const HUB_README_VERSION = 3

/** 根目录没有自己的 README 时用这个文件名；有则写到备用名，绝不覆盖用户文档。 */
const PRIMARY_NAME = 'README.md'
const FALLBACK_NAME = 'MEMORY-HUB.md'

const MARKER_PATTERN = /<!--\s*dsh-memory-hub:hub-readme\s+(\d+)\s*-->/

type WritePlan = { name: string; action: 'created' | 'updated' }

/**
 * 每个 Hub 根目录的「说明书」。两件事写在里面：
 * 1. 每个目录/文件是干什么的、谁写、能不能手改、删了会怎样；
 * 2. 九类知识（尤其 `assets` 的真实含义）与唯一合法的写入路径。
 *
 * 只在 Hub 可写、且文件缺失或标记版本过旧时写入：
 * - `README.md` 缺失 → 写 `README.md`；
 * - `README.md` 是我们生成的旧版本 → 更新它；
 * - `README.md` 是用户自己的 → 不改名不覆盖，改为写 `MEMORY-HUB.md`（同样受版本标记约束）。
 */
export async function ensureHubReadme(hub: Hub): Promise<'created' | 'updated' | 'skipped'> {
  if (hub.readOnly) return 'skipped'
  const plan = await planWrite(hub.root)
  if (plan === null) return 'skipped'
  await ensureDir(hub.root)
  await writeAtomic(join(hub.root, plan.name), renderHubReadme(hub, plan.name === FALLBACK_NAME))
  return plan.action
}

async function readMaybe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function planWrite(root: string): Promise<WritePlan | null> {
  const primary = await readMaybe(join(root, PRIMARY_NAME))
  const primaryPlan = evaluate(PRIMARY_NAME, primary)
  if (primaryPlan === 'skip') return null
  if (primaryPlan !== 'fallback') return primaryPlan

  // 用户自己的 README.md 不覆盖；把说明书写到备用文件名。
  const fallback = await readMaybe(join(root, FALLBACK_NAME))
  const fallbackPlan = evaluate(FALLBACK_NAME, fallback)
  if (fallbackPlan === 'fallback' || fallbackPlan === 'skip') return null
  return fallbackPlan
}

function evaluate(name: string, existing: string | null): WritePlan | 'fallback' | 'skip' {
  if (existing === null) return { name, action: 'created' }
  const match = MARKER_PATTERN.exec(existing)
  // 没有标记 = 用户自己写的文件，视为占用该名字。
  if (match === null) return 'fallback'
  const version = Number(match[1])
  if (!Number.isFinite(version) || version >= HUB_README_VERSION) return 'skip'
  return { name, action: 'updated' }
}

export function renderHubReadme(hub: Hub, fallbackName = false): string {
  const root = hub.displayRoot()
  const hubId = hub.config.hub.id
  const types = KNOWLEDGE_TYPES.map(
    (type) => `| \`${type}\` | \`${TYPE_PREFIX[type]}\` | ${TYPE_PURPOSE[type]} |`,
  ).join('\n')
  const nameNote = fallbackName
    ? '> 根目录的 `README.md` 是你自己的文档，所以说明书放在 `MEMORY-HUB.md`。\n'
    : ''

  return `# 这是 Memory Hub 数据目录（自动生成）

<!-- dsh-memory-hub:hub-readme ${HUB_README_VERSION} -->

> Hub id：\`${hubId}\` · 根目录：\`${root}\`
>
${nameNote}> 本文件由 dsh-memory-hub 在初始化/升级时生成，**可以编辑**（保留上面的标记即可，同版本不会被覆盖）。
> 想快速了解“每个文件夹干什么、什么能改”，先读完这一页。

## 一分钟理解

- 这是一个**文件原生的长期记忆库**：一条知识 = 一个带 YAML frontmatter 的 Markdown 文件。
- **Markdown / YAML / JSONL 是唯一权威数据**；索引、报告、水位都是可删的派生物。
- 知识进入这里只有一条合法路径：**候选（pending/）→ 人工批准 → 权威知识（knowledge/）**。
- 模型不能自批，面板只提供批准/拒绝；本目录里没有任何“模型自动改写正文”的通道。

## 目录地图

| 路径 | 作用 | 谁写 | 能手动改吗 | 删了会怎样 |
| --- | --- | --- | --- | --- |
| \`config.yaml\` | Hub 配置：核心/子工作区、策略、时效 | 面板 / 你 | ✅ 可以（改完重启或保存） | 丢失工作区与策略配置 |
| \`README.md\` / \`MEMORY-HUB.md\` | 本说明 | 插件生成 | ✅ 可以（保留标记） | 下次启动重新生成 |
| \`knowledge/<type>/<ID>.md\` | **权威知识**，按类型分目录 | 仅 \`memory_commit\` 审批通过后 | ⚠️ 可以改，但会绕过审批记录；优先用工具 | 知识永久丢失（有 git 备份可恢复） |
| \`pending/<PRO-ID>.md\` | **候选**，尚未成为权威知识 | 模型 \`memory_propose\` / 维护扫描 | ⚠️ 建议在面板批准或拒绝，不要手改状态 | 候选丢失，不影响已接受知识 |
| \`pending/archive/\` | 已处理候选的归档（批准/拒绝后） | 插件 | 只读查阅 | 审计线索丢失 |
| \`records/ledger.jsonl\` | 追加式账本：提案、批准、引用、任务 | 插件（只追加） | ❌ 不要手改 | 审计/引用计数丢失 |
| \`records/sequences.json\` | 下一个 ID 序号 | 插件 | ❌ 不要手改 | 可能撞号（可自动回填，但不建议） |
| \`records/index.sqlite\` | 派生全文索引（大 Hub 才有） | 插件自动重建 | ✅ 可删 | 下次启动自动重建 |
| \`records/reflect-state.json\` | 回顾水位（哪些会话已回顾） | 插件 | ✅ 可删 | 同一会话可能被重复回顾 |
| \`records/maintenance-state.json\` | 维护上次运行时间 | 插件 | ✅ 可删 | 只影响“今天是否已跑”判断 |
| \`records/.writer.lock\` | 该根的写锁（租约 + fencing token） | 当前写者（心跳 15s） | ⚠️ 只有确认没有其他 DSH 在跑时才删 | 下一个写者会重新创建；活写者的锁被删会短暂出现两个写者 |
| \`history/\` | 每次提交的旧版本快照 | 插件 | 只读查阅 | 历史版本丢失（当前版本不受影响） |
| \`reports/\` | 维护报告（\`latest.md\` + 时间戳） | 插件 | 只读查阅 | 丢失历史体检记录 |
| \`index/\` | 旧版本可能遗留的空目录（新 Hub 不再创建） | — | ✅ 可删 | 无影响 |

**判断标准**：\`knowledge/\`、\`pending/\`、\`records/ledger.jsonl\`、\`records/sequences.json\`、\`config.yaml\` 是权威数据，删/改前先备份；\`records/index.sqlite\`、\`records/reflect-state.json\`、\`records/maintenance-state.json\`、\`reports/\`、\`index/\` 是派生物或辅助数据，可删。

## 九类知识（注意 \`assets\` 的含义）

| 类型 | 前缀 | 用途 |
| --- | --- | --- |
${types}

### \`assets\` 到底是什么

\`assets\` **不是**代码资产、构建产物或依赖包，而是**外部资源的索引条目**：

- 设计稿、原型、截图、录屏、演示文稿的位置；
- 模板、清单、提示词、脚本片段等“拿来即用”的素材说明；
- 大文件本体留在原处（网盘、仓库、共享盘），这里只记**在哪里、怎么用、适用边界**。

写 \`assets\` 时正文可以很短，但 \`source_refs\` 必须指向真实位置（\`url:\` / \`file:\` / \`note:\`），否则以后没人找得到。

## 作用域与金字塔

| 作用域 | 放什么 | 例子 |
| --- | --- | --- |
| \`project:<当前工作区>\` | 本仓特定决策、约束、流程、坑 | 本仓用 pnpm |
| \`scope: "core"\` | 可复用到同核心仓其他子工作区的经验 | 插件发布 checklist |
| \`domain:<id>\` | 跨项目的领域知识 | 某协议/框架的通用约束 |
| \`global\` | 稳定、跨项目的通用约定（慎用） | 提交信息规范 |

- 子工作区可见：自己的 \`project:<id>\` + 核心 \`project:<core-id>\` + \`global\`（只取当前 Hub 自己的 global）。
- 同级子工作区互相不可见；向上晋升靠蒸馏/汇总，不是自动泄漏。
- 每个 \`core_workspaces[].root\` 是一个独立 Hub；本目录就是其中一个。

## 写入流程（唯一合法路径）

\`\`\`text
模型 memory_propose  →  pending/PRO-xxxx.md（候选，candidate）
        ↓ 人在 DSH 审批或面板点“批准”
memory_commit        →  knowledge/<type>/<ID>.md（accepted）
        ↓ 同时
history/ 快照 + records/ledger.jsonl 追加事件 + 序号 +1
\`\`\`

- 拒绝：候选归档到 \`pending/archive/\`，不删除原有知识。
- 更新：\`operation: update\` 会 +1 版本并保留旧版本到 \`history/\`。
- 合并：\`operation: merge\` 把多条并进一条，被并条目变 \`superseded\` 并写 \`superseded_by\`。
- 禁止：模型自批、伪造审批、手改账本冒充提交。

## 常用工具

| 目的 | 工具 |
| --- | --- |
| 看状态 / 诊断 | \`memory_status\` |
| 检索 | \`memory_search\`（先 \`detail: "ids"\` 扫，再 \`memory_get\`） |
| 读正文 | \`memory_get\`（默认摘要，按节读） |
| 标记实际使用 | \`memory_cite\` |
| 创建候选 | \`memory_propose\` |
| 提交候选 | \`memory_commit\`（触发人工审批） |
| 近重复检查 | \`memory_duplicates\` |
| 回顾已结束会话 | \`memory_reflect\` |
| 夜间巡检 | \`memory_maintenance\`（只报告 / 只生成候选） |
| 结束任务 | \`memory_close_task\` |

完整工作流见项目仓库的 \`docs/06-operations/\` 与系统 \`memory-hub\` skill。

## 维护与备份

- 维护每天 03:00（可配置）确定性巡检：写报告、必要时生成 \`pending/\` 候选，**不自动 commit、不删除、不改写正文**。
- 备份：整个目录 \`git init\` 或复制即可；\`git\` 忽略 \`records/index.sqlite\` 等派生物更省空间。
- 体量参考：约 2.5KB/条（Markdown）；3 万条以上才会出现 \`records/index.sqlite\`。

## 安全边界

- 不要往这里写密钥、token、密码、私钥；\`memory_propose\` 会扫描并标记可疑内容，但仍需人判断。
- 只读 Hub（\`readOnly: true\`、配置损坏或写锁被占用）不会接受任何写入。
- 写锁是**租约**：崩溃（pid 不存在）、心跳超 \`storage.lock_stale_ms\`（挂死/假死）、或跨机残留都会被自动回收，不需要手动删锁；对方退出后本进程会在下一次写入时自动接管。
- 面板只允许回环地址请求，且只提供“批准/拒绝”两个写操作。

## 常见误用

| 误用 | 后果 | 正确做法 |
| --- | --- | --- |
| 把 \`assets\` 当代码资产/构建产物 | 记了没用的东西，真素材反而找不到 | 只记外部资源位置与用法 |
| 把 \`pending/\` 当权威知识引用 | 未批准的内容被当成事实 | 看 \`status\`，只有 \`accepted\` 参与默认检索 |
| 手改 \`knowledge/\` 绕过审批 | 没有账本与历史版本，审计断链 | 走 \`memory_propose\` → 审批 |
| 把日志/长文整篇塞进知识 | 检索变差、上下文变贵 | 写结论 + 关键片段 + 路径 |
| 手改 \`records/ledger.jsonl\` | 引用计数、审计失真 | 只读；需要修正用新事件 |
`
}

const TYPE_PURPOSE: Record<(typeof KNOWLEDGE_TYPES)[number], string> = {
  decision: '已做出的选择与理由',
  constraint: '不可违反的边界',
  knowledge: '已确认的事实/机制',
  'api-catalog': '接口、命令、协议清单',
  process: '可复现的流程/步骤',
  'open-questions': '未决问题与待验证假设',
  'runtime-base': '环境、版本、部署前提',
  playbooks: '排障/操作手册',
  assets: '外部资源（设计稿/截图/模板/录屏）的索引，不是代码资产',
}
