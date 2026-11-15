import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { MemoryError } from './errors.js'
import { REMOTE_MODES } from './remote/registry.js'
import { REMOTE_ROLES } from './remote/types.js'
import { KNOWLEDGE_TYPES } from './types.js'

export const DEFAULT_MUTATING_TOOLS = [
  'bash',
  'pwsh',
  'write',
  'edit',
  'str_replace_editor',
]

export const DEFAULT_EXEMPT_TOOLS = [
  'memory_search',
  'memory_get',
  'memory_status',
  'memory_preflight',
  'memory_cite',
  'memory_propose',
  'memory_commit',
  'memory_close_task',
  'memory_consolidate',
  'memory_maintenance',
]

const DISTILL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * 每个工作区的定时蒸馏设置。真正的调度交给 Host 的 `schedule` 服务：
 * 到点新建会话（cwd = 工作区 root）或投递到指定会话，由该会话执行蒸馏流程。
 */
const distillSchema = z.object({
  enabled: z.boolean().default(false),
  time: z.string().regex(DISTILL_TIME_PATTERN, 'distill time must be HH:mm').default('03:30'),
  // new = 每次投递新建会话（cwd 固定为工作区 root）；session = 投递到已有会话。
  target: z.enum(['new', 'session']).default('new'),
  session_id: z.string().nullable().optional(),
  agent_preset: z.string().min(1).nullable().optional(),
  max_proposals: z.number().int().min(1).max(20).default(5),
}).default({})

/**
 * 每个工作区的定时回顾（retrospective extraction）。与 distill 并列、互不影响：
 * 回顾只读本工作区名下已结束的会话，产出 L1（`project:<self>`）候选；上行晋升仍由 distill 负责。
 */
const reflectSchema = z.object({
  enabled: z.boolean().default(false),
  time: z.string().regex(DISTILL_TIME_PATTERN, 'reflect time must be HH:mm').default('04:30'),
  target: z.enum(['new', 'session']).default('new'),
  session_id: z.string().nullable().optional(),
  agent_preset: z.string().min(1).nullable().optional(),
  max_candidates: z.number().int().min(1).max(20).default(5),
  lookback_days: z.number().int().min(1).max(365).default(30),
}).default({})

const coreWorkspaceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'core workspace id must be a slug (letters, digits, dot, underscore, dash)'),
  name: z.string().min(1).optional(),
  root: z.string().min(1).optional(),
  distill: distillSchema.optional(),
  reflect: reflectSchema.optional(),
})

const workspaceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'workspace id must be a slug (letters, digits, dot, underscore, dash)'),
  core_id: z.string().optional().nullable(),
  root: z.string().min(1),
  domains: z.array(z.string().min(1)).default([]),
  admin: z.boolean().default(false),
  enabled: z.boolean().default(true),
  distill: distillSchema.optional(),
  reflect: reflectSchema.optional(),
})

const preflightSchema = z.object({
  mode: z.enum(['per-turn', 'off']).default('per-turn'),
  pack_tokens: z.number().int().positive().max(8000).default(600),
  max_hits: z.number().int().min(1).max(20).default(6),
  // 低于该分数的命中不进入预检包；0 表示不过滤。新手配置默认 1.0。
  min_score: z.number().min(0).max(1000).default(0),
  // 当前工作区自己的 project 知识在排序时的倍率；1 表示不提升。新手配置默认 1.2。
  local_boost: z.number().min(1).max(3).default(1),
  inject: z.enum(['compact', 'off']).default('compact'),
  // 阶段三：在预检包里加一行"可主动检索/写入记忆"的能力提示，提升采用率。
  hint_tools: z.boolean().default(true),
}).default({})

const gateSchema = z.object({
  mode: z.enum(['enforce', 'off']).default('enforce'),
  on_preflight_error: z.enum(['allow', 'deny']).default('allow'),
  unknown_tools: z.enum(['allow', 'deny']).default('allow'),
  mutating_tools: z.array(z.string().min(1)).default(DEFAULT_MUTATING_TOOLS),
  exempt_tools: z.array(z.string().min(1)).default(DEFAULT_EXEMPT_TOOLS),
}).default({})

const limitsSchema = z.object({
  max_pending_per_task: z.number().int().min(1).max(500).default(20),
  max_body_bytes: z.number().int().min(1024).max(1_048_576).default(65_536),
  max_source_refs: z.number().int().min(0).max(100).default(20),
}).default({})

const maintenanceSchema = z.object({
  enabled: z.boolean().default(false),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'maintenance time must be HH:mm').default('03:00'),
  apply: z.enum(['report', 'propose']).default('propose'),
  all_cores: z.boolean().default(true),
  max_proposals: z.number().int().min(1).max(20).default(10),
  stale_pending_days: z.number().int().min(1).max(3650).default(30),
  stale_citation_days: z.number().int().min(1).max(3650).default(90),
}).default({})

/**
 * 时效降权。默认值来自 2026-11-08 评审：aging 取 90 天；所有系数都是乘在检索分上的，
 * 1 表示关闭该项降权。过期条目不删除，只是降低排序并在预检里标注。
 */
const temporalSchema = z.object({
  aging_days: z.number().int().min(1).max(3650).default(90),
  aging_decay: z.number().min(0.1).max(1).default(0.85),
  stale_decay: z.number().min(0.1).max(1).default(0.6),
  scheduled_decay: z.number().min(0.1).max(1).default(0.3),
}).default({})

/**
 * 近重复检测。组合相似度 = 0.6 × 标题/摘要词元 Jaccard + 0.4 × 正文 3-gram Jaccard，
 * 只在同类型、同作用域之间比较；阈值越高越保守。
 */
const dedupeSchema = z.object({
  threshold: z.number().min(0.5).max(1).default(0.72),
  max_pairs: z.number().int().min(1).max(100).default(20),
}).default({})

/** 回顾式萃取的全局上限：digest 字符数、单次会话数、过短会话的判定。 */
const reflectPolicySchema = z.object({
  max_chars: z.number().int().min(500).max(40_000).default(8000),
  max_sessions: z.number().int().min(1).max(10).default(3),
  min_messages: z.number().int().min(1).max(50).default(4),
}).default({})

const tencentSchema = z.object({
  enabled: z.boolean().default(false),
  // 数据面地址（memory-core），例如 http://127.0.0.1:8420。
  url: z.string().min(1).default('http://127.0.0.1:8420'),
  // 鉴权 token 的环境变量名（不落盘密钥），例如 PROXY_USER_KEY。
  api_key_env: z.string().min(1).default('PROXY_USER_KEY'),
  service_id: z.string().min(1).default('default'),
  team_id: z.string().default(''),
  agent_id: z.string().default(''),
  user_id: z.string().default(''),
  task_id: z.string().default(''),
  // 定时同步间隔（分钟）；0 = 不启用定时，只手动触发。
  sync_interval_min: z.number().int().min(0).max(10080).default(30),
  // pull 时生成候选的作用域与类型。
  pull_scope: z.string().default('global'),
  pull_type: z.enum(KNOWLEDGE_TYPES).default('knowledge'),
  pull_limit: z.number().int().min(1).max(500).default(50),
  timeout_ms: z.number().int().min(100).max(120_000).default(10_000),
}).default({})

/**
 * 远端 provider 配置（多厂商）。
 *
 * 与 `tencent` 段的关系：**写了 `providers` 就只用 `providers`**，不再 desugar 旧段
 * （见 `remote/registry.ts`）；只写 `tencent` 时由 desugar 合成一个 provider，
 * 旧行为逐字不变。
 *
 * 这里只做形状校验与默认值；角色互斥、能力匹配等跨字段规则在
 * `validateRemoteSettings()` 里做，因为它需要 adapter 的能力声明。
 */
const remoteProjectionSchema = z.object({
  // 允许分发出去的作用域模式（`global`、`domain:*`）；空 = 不分发任何作用域。
  scopes: z.array(z.string()).default([]),
  types: z.array(z.enum(KNOWLEDGE_TYPES)).default([]),
  exclude_tags: z.array(z.string()).default([]),
}).default({})

const remoteProviderSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).default('tencent'),
  enabled: z.boolean().default(true),
  roles: z.array(z.enum(REMOTE_ROLES)).default([]),
  projection: remoteProjectionSchema,
  feed: z.object({
    scope: z.string().default('global'),
    type: z.enum(KNOWLEDGE_TYPES).default('knowledge'),
    limit: z.number().int().min(1).max(500).default(50),
    tags: z.array(z.string()).default([]),
    // pull 作用域还原：按远端 mh: 坐标 tags 还原到本地结构（§5.8.2）。
    scope_from_tags: z.boolean().default(false),
  }).default({}),
  mirror: z.object({
    trigger: z.enum(['manual', 'accepted', 'schedule', 'cited']).default('manual'),
    include_body: z.boolean().default(true),
    max_body_chars: z.number().int().min(0).max(1_000_000).default(4000),
    // push 坐标编码：mh: 命名空间 tags（§5.8.1）。
    coordinate_tags: z.boolean().default(true),
    // 萃取驱动的上报门槛（§5.9.2）：被 memory_cite 引用 ≥ N 次才推。0 = 不设门槛。
    require_citations: z.number().int().min(0).max(1000).default(0),
  }).default({}),
  forget: z.object({
    // 明确作废 → 远端同步作废。默认开：语义单一。
    on_deprecate: z.boolean().default(true),
    // merge 折叠 → 远端作废。**默认关**：被合并项内容已在 target 正文里活着。
    on_merge: z.boolean().default(false),
    // 单次传播上限；0 = 不限。可由面板配置。
    max_per_run: z.number().int().min(0).max(100_000).default(100),
  }).default({}),
  // hybrid 组合检索：该 provider 注入预检包的 token 上限；0 = 不参与预检注入。
  // 上限防止单个远端吃掉整个预检包（proposal-remote-providers §5.7）。
  inject_max_tokens: z.number().int().min(0).max(4000).default(300),
  // provider 自带连接参数，adapter 自己解释（腾讯：url/api_key_env/...）。
  config: z.record(z.unknown()).default({}),
})

const remoteSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(REMOTE_MODES).default('local-first'),
  // hybrid 组合检索的整轮 fan-out 死线：到点未返回的远端按 unavailable 处理。
  // 预检在每回合开头跑，慢远端绝不能拖住回合。
  hybrid: z.object({
    deadline_ms: z.number().int().min(200).max(10_000).default(2000),
  }).default({}),
  providers: z.array(remoteProviderSchema).default([]),
}).default({})

/** 可选分层记忆（阶段三）：默认 flat，>20k 条目才建议启用。 */const layersSchema = z.object({
  enabled: z.boolean().default(false),
  // 达到该条目数时 status/面板提示启用分层（不强制）。
  suggest_at_entries: z.number().int().min(100).max(10_000_000).default(20_000),
  // 场景归纳目录名（相对 hub root）；空 = 关闭场景归纳。
  scenario_dir: z.string().default('scenario'),
}).default({})

export const configSchema = z.object({
  version: z.literal(1).default(1),
  hub: z.object({ id: z.string().min(1).default('primary') }).default({}),
  core_workspaces: z.array(coreWorkspaceSchema).default([]),
  workspaces: z.array(workspaceSchema).default([]),
  policy: z.object({
    approval: z.object({
      mode: z.enum(['manual', 'auto']).default('manual'),
    }).default({}),
    panel: z.object({
      // 面板「待审批」是否提供人工点击的批准/拒绝；关闭时面板恢复只读。
      review: z.boolean().default(true),
    }).default({}),
    preflight: preflightSchema,
    gate: gateSchema,
    evidence: z.object({
      required_for: z.array(z.enum(KNOWLEDGE_TYPES)).default([
        'decision',
        'constraint',
        'process',
        'api-catalog',
        'runtime-base',
        'playbooks',
      ]),
    }).default({}),
    limits: limitsSchema,
    maintenance: maintenanceSchema,
    temporal: temporalSchema,
    dedupe: dedupeSchema,
    reflect: reflectPolicySchema,
  }).default({}),
  consolidation: z.object({
    mode: z.literal('manual').default('manual'),
    target_scope: z.string().default('global'),
  }).default({}),
  tencent: tencentSchema,
  remote: remoteSchema,
  layers: layersSchema,
  storage: z.object({
    watch: z.boolean().default(true),
    lock_stale_ms: z.number().int().positive().default(600_000),
    // 检索索引后端：auto = 条目数达到阈值且 node:sqlite 可用时用 SQLite，
    // 否则用内存索引；sqlite/memory 为显式选择（不可用时仍回退内存并记诊断）。
    index: z.enum(['auto', 'memory', 'sqlite']).default('auto'),
    sqlite_min_entries: z.number().int().min(1000).max(10_000_000).default(30_000),
    // 每轮进入精确打分的候选上限；小 Hub 会全量打分，结果与内存索引完全一致。
    index_candidate_limit: z.number().int().min(100).max(1_000_000).default(2000),
  }).default({}),
})

export type CoreWorkspaceConfig = z.infer<typeof coreWorkspaceSchema>
export type WorkspaceConfig = z.infer<typeof workspaceSchema>
export type ReflectConfig = z.infer<typeof reflectSchema>
export type TencentConfig = z.infer<typeof tencentSchema>
export type LayersConfig = z.infer<typeof layersSchema>
export type MemoryConfig = z.infer<typeof configSchema>

export const DEFAULT_CONFIG_YAML = `# Memory Hub configuration (npm package: dsh-memory-hub)
# This file is the portable configuration of your memory store. Back it up with
# the rest of the directory.
version: 1
hub:
  id: primary

# Core workspaces are memory hubs. If a core workspace has a root, it becomes
# an independent memory hub; sessions whose working directory is under that root
# use that hub. Sub-workspaces (core_id below) live inside the same hub.
#
# distill (optional) schedules a memory distillation in that workspace through
# the Host schedule service. target: new creates a fresh session with cwd set
# to the workspace root; target: session delivers to an existing session id.
# Distillation only proposes candidates (scope "parent" / "global"); a human still
# approves them in the panel.
core_workspaces: []
#  - id: product
#    name: '产品主仓库'
#    root: 'D:/projects/product'
#    distill:
#      enabled: true
#      time: '03:30'
#      target: new          # new | session
#      max_proposals: 5
#    reflect:
#      enabled: false       # retrospective extraction over this workspace's finished sessions
#      time: '04:30'
#      max_candidates: 5
#      lookback_days: 30

# Register the project roots you want project-scoped memory for. Sessions whose
# working directory is inside one of these roots see global + domain + project
# entries; other sessions see global + domain entries only.
workspaces: []
#  - id: backend
#    core_id: product
#    root: 'D:/projects/product/backend'
#    domains: [backend]
#    admin: true
#    enabled: true
#    distill:
#      enabled: true
#      time: '04:00'
#      target: session
#      session_id: session-xxxx
#    reflect:
#      enabled: false
#      time: '04:35'

policy:
  approval:
    mode: manual          # manual | auto (auto is for local testing only: commits are logged as test:auto)
  preflight:
    mode: per-turn        # per-turn | off
    pack_tokens: 600
    max_hits: 6
    min_score: 1.0        # drop weak matches; 0 keeps every BM25 hit
    local_boost: 1.2      # prefer project:<current-workspace> over core hits
    inject: compact       # compact | off
  gate:
    mode: enforce         # enforce | off
    on_preflight_error: allow   # allow | deny
    unknown_tools: allow        # allow | deny
    mutating_tools: [bash, pwsh, write, edit, str_replace_editor]
    exempt_tools: [memory_search, memory_get, memory_status, memory_preflight,
                   memory_cite, memory_propose, memory_commit,
                   memory_close_task, memory_consolidate]
  evidence:
    required_for: [decision, constraint, process, api-catalog, runtime-base, playbooks]
  limits:
    max_pending_per_task: 20
    max_body_bytes: 65536
    max_source_refs: 20
  maintenance:
    enabled: false        # true = run the deterministic nightly maintenance timer
    time: '03:00'         # local HH:mm; missed runs execute on the next Host start
    apply: propose        # report | propose (propose only creates pending; never commits)
    all_cores: true
    max_proposals: 10
    stale_pending_days: 30
    stale_citation_days: 90
  temporal:
    aging_days: 90          # days without confirmation before an entry is "aging"
    aging_decay: 0.85       # score multiplier for aging entries
    stale_decay: 0.6        # score multiplier once expires_at has passed
    scheduled_decay: 0.3    # score multiplier for valid_from entries not yet in effect
  dedupe:
    threshold: 0.72         # combined similarity above which a pair is reported as near-duplicate
    max_pairs: 20           # cap on reported pairs per scan
  reflect:
    max_chars: 8000         # digest size cap per session (user asks + assistant conclusions + failed tools)
    max_sessions: 3         # sessions per memory_reflect call
    min_messages: 4         # shorter sessions are skipped as too-short

consolidation:
  mode: manual
  target_scope: global

# 远端记忆 provider（可选，默认关闭）。关闭时零网络请求、不构造任何 adapter。
#
# 设计要点：远端按 [角色] 接入，不按厂商接入。
#   feed      远端 -> 本地候选（产物永远是 pending/，绝不自动 commit）
#   mirror    本地 -> 远端（只分发，不改本地权威）
#   authority 远端权威，本地只读（仅限 global / domain:*，且必须 mode != local-first）
#   index     只读检索，不参与同步
#
# 不写 remote.providers 时，下面的旧 tencent: 段会被自动 desugar 成
# 一个 {id: tencent, roles: [feed, mirror]} 的 provider —— 旧配置行为逐字不变。
# 一旦写了非空的 providers，旧段就被忽略（迁移后不会偷偷生效）。
#
# remote:
#   enabled: false
#   mode: local-first             # local-first | hybrid | remote-authority
#   hybrid:
#     deadline_ms: 2000           # 组合检索整轮死线：到点未返回的远端按 unavailable 处理
#   providers:
#     - id: tencent               # 实例 id，账本与工具参数都用它
#       kind: tencent             # 注册表里的 adapter kind
#       enabled: true
#       roles: [feed, mirror]
#       inject_max_tokens: 300    # hybrid 组合检索的注入上限（0 = 不参与预检注入）
#       projection:               # 哪些本地知识允许分发出去
#         scopes: [global, 'domain:*']
#         types: [decision, constraint, knowledge, api-catalog, process]
#         exclude_tags: [local-only]
#       feed:
#         scope: global
#         type: knowledge
#         limit: 50
#         tags: [tencent]
#       mirror:
#         trigger: manual         # manual | accepted | schedule
#         include_body: true
#         max_body_chars: 4000    # 硬顶：远端只收摘要 + 截断正文
#       forget:
#         on_deprecate: true      # 默认开：明确作废 -> 远端同步作废
#         on_merge: false         # 默认关：merge 是"折叠成一条"不是"删除"
#         max_per_run: 100        # 单次传播上限（0 = 不限）；面板可改
#       config:                   # provider 自带连接参数（腾讯：见下方 tencent 段字段）
#         url: 'http://127.0.0.1:8420'
#         api_key_env: PROXY_USER_KEY
#         service_id: default
#
#     # kind: http-json —— 不写代码接"其他家"：端点与字段映射全在配置里。
#     # 能力必须显式声明；声明了但没配端点 = 调用时 unsupported（不猜、不静默）。
#     # 密钥只走 token_env（环境变量或 $DSH_HOME/.credentials.yaml），不落盘。
#     - id: my-memory
#       kind: http-json
#       enabled: true
#       roles: [index]            # index = 只读检索，不参与同步
#       config:
#         base_url: 'https://memory.example.com'
#         auth: { type: bearer, token_env: MY_MEMORY_TOKEN }   # 或 { type: header, token_env: X, name: x-api-key }
#         headers: { x-tenant: acme }
#         timeout_ms: 10000
#         endpoints:
#           list:   { method: POST, path: /v1/memories/list,   body: { limit: '{{limit}}', cursor: '{{cursor}}' } }
#           search: { method: POST, path: /v1/memories/search, body: { query: '{{text}}', limit: '{{limit}}' } }
#           append: { method: POST, path: /v1/memories,        body: { title: '{{title}}', content: '{{body}}', key: '{{idempotency_key}}' } }
#         mapping:                  # 只支持 $.a.b 点路径取值，不支持表达式
#           items: '$.data.items'
#           id: '$.id'
#           title: '$.title'
#           summary: '$.summary'
#           body: '$.content'
#           scope: '$.metadata.scope'
#           tags: '$.tags'
#           updated_at: '$.updated_at'
#           next_cursor: '$.data.next'
#         capabilities: [read.list, read.search, write.append]

# 腾讯 Agent Memory 桥（可选，默认关闭）。关闭时零网络请求，行为与 0.7.1 一致。
# 开启后 memory_tencent_pull 拉取腾讯 L1/L2 生成 pending 候选（人审后才入库），
# memory_tencent_push 把本地 accepted 知识分发到腾讯通道。
# 新配置请改用上面的 remote.providers；本段保留为兼容入口。
tencent:
  enabled: false
  url: 'http://127.0.0.1:8420'    # memory-core 数据面
  api_key_env: PROXY_USER_KEY     # 读取 token 的环境变量名（不落盘）
  service_id: default
  team_id: ''                     # 例：team-oorlv5kamx
  agent_id: ''                    # 例：agt-oorq6rzprf
  user_id: ''                     # 例：usr-oon04odpor
  task_id: ''
  sync_interval_min: 30           # 定时同步间隔；0 = 只手动
  pull_scope: global
  pull_type: knowledge
  pull_limit: 50
  timeout_ms: 10000

# 可选分层记忆（阶段三，默认 flat）。
layers:
  enabled: false                  # true 时 status 提示分层建议，检索行为不变
  suggest_at_entries: 20000       # 条目数达到该值时建议启用
  scenario_dir: scenario          # 场景归纳目录（空字符串 = 关闭）

storage:
  watch: true
  lock_stale_ms: 600000
  # auto = use the derived SQLite index once the Hub exceeds sqlite_min_entries
  # (requires Node.js >= 22.5 for node:sqlite; otherwise the memory index is used).
  index: auto
  sqlite_min_entries: 30000
  # Entries scored exactly per query. Small Hubs score every candidate (same
  # results as the memory index); only very broad queries hit this cap.
  index_candidate_limit: 2000
`

export async function readConfigFile(path: string): Promise<MemoryConfig | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new MemoryError('STORAGE_ERROR', `cannot read ${path}: ${(error as Error).message}`)
  }

  let parsed: unknown
  try {
    parsed = parseYaml(raw)
  } catch (error) {
    throw new MemoryError('INVALID_INPUT', `invalid YAML in ${path}: ${(error as Error).message}`)
  }

  const result = configSchema.safeParse(parsed ?? {})
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')
    throw new MemoryError('INVALID_INPUT', `invalid config ${path}: ${details}`)
  }
  return result.data
}

export function defaultConfig(): MemoryConfig {
  return configSchema.parse({})
}


