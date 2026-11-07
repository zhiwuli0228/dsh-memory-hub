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

const coreWorkspaceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'core workspace id must be a slug (letters, digits, dot, underscore, dash)'),
  name: z.string().min(1).optional(),
  root: z.string().min(1).optional(),
})

const workspaceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'workspace id must be a slug (letters, digits, dot, underscore, dash)'),
  core_id: z.string().optional().nullable(),
  root: z.string().min(1),
  domains: z.array(z.string().min(1)).default([]),
  admin: z.boolean().default(false),
  enabled: z.boolean().default(true),
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
core_workspaces: []
#  - id: product
#    name: '产品主仓库'
#    root: 'D:/projects/product'

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
