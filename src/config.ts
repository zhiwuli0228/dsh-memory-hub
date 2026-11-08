import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { MemoryError } from './errors.js'
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

const coreWorkspaceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'core workspace id must be a slug (letters, digits, dot, underscore, dash)'),
  name: z.string().min(1).optional(),
  root: z.string().min(1).optional(),
  distill: distillSchema.optional(),
})

const workspaceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'workspace id must be a slug (letters, digits, dot, underscore, dash)'),
  core_id: z.string().optional().nullable(),
  root: z.string().min(1),
  domains: z.array(z.string().min(1)).default([]),
  admin: z.boolean().default(false),
  enabled: z.boolean().default(true),
  distill: distillSchema.optional(),
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
  }).default({}),
  consolidation: z.object({
    mode: z.literal('manual').default('manual'),
    target_scope: z.string().default('global'),
  }).default({}),
  storage: z.object({
    watch: z.boolean().default(true),
    lock_stale_ms: z.number().int().positive().default(600_000),
  }).default({}),
})

export type CoreWorkspaceConfig = z.infer<typeof coreWorkspaceSchema>
export type WorkspaceConfig = z.infer<typeof workspaceSchema>
export type MemoryConfig = z.infer<typeof configSchema>

export const DEFAULT_CONFIG_YAML = `# dsh-memory-hub configuration
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

consolidation:
  mode: manual
  target_scope: global

storage:
  watch: true
  lock_stale_ms: 600000
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
