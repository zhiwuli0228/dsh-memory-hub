/**
 * 远端 provider 注册表：**配置 → adapter 实例**的唯一入口。
 *
 * 三件事：
 * 1. **归一化**：把 `config.yaml` 的 snake_case 段整理成带默认值的 settings；
 * 2. **兼容 desugar**：只有旧 `tencent:` 段、没有 `remote.providers` 时，合成一个
 *    `{id: tencent, kind: tencent, roles: [feed, mirror]}`，旧配置行为逐字不变；
 * 3. **构造期校验**：角色互斥、能力与角色匹配、id 唯一——**在联网之前**拒绝非法组合，
 *    而不是等到同步时才发现"两个 provider 都自称权威"。
 *
 * 本文件不依赖宿主，也不主动联网（adapter 自己的 probe 才会）。
 */

import { MemoryError } from '../errors.js'
import { TencentClient } from '../tencent-client.js'
import { httpJsonAdapterFactory } from './http-json-adapter.js'
import { TencentAdapter } from './tencent-adapter.js'
import { REMOTE_ROLES, type RemoteAdapter, type RemoteRole } from './types.js'

export const REMOTE_MODES = ['local-first', 'hybrid', 'remote-authority'] as const
export type RemoteMode = (typeof REMOTE_MODES)[number]

export interface RemoteProjectionConfig {
  /** 允许分发出去的作用域模式，如 `global`、`domain:*`；空数组 = 不允许任何分发。 */
  scopes: string[]
  /** 允许分发的知识类型；空数组 = 全部允许。 */
  types: string[]
  /** 带这些标签的知识永不分发。 */
  exclude_tags: string[]
}

export interface RemoteFeedConfig {
  scope: string
  type: string
  limit: number
  tags: string[]
  /**
   * pull 侧作用域还原（§5.8.2 非对称映射）：候选落地时从远端坐标 tags
   * （`mh:scope:*` + `mh:ws:*` / `mh:domain:*`）解析作用域，还原到**拉取者自己的**
   * 工作区结构；解析不出有效作用域 → 退回 `scope`。默认 false = 保持全落 feed.scope。
   */
  scope_from_tags: boolean
}

export interface RemoteMirrorConfig {
  trigger: 'manual' | 'accepted' | 'schedule' | 'cited'
  include_body: boolean
  max_body_chars: number
  /**
   * push 侧坐标编码（§5.8.1）：镜像时自动附加 `mh:` 命名空间坐标 tags
   * （`mh:scope:*` / `mh:ws:*` / `mh:core:*` / `mh:type:*` / `mh:from:*`），
   * 让金字塔结构在扁平远端池里可重建来历。默认开。
   */
  coordinate_tags: boolean
  /**
   * 萃取驱动的上报门槛（§5.9.2）：条目被 `memory_cite` 引用 ≥ N 次才允许推送。
   * 0（默认）= 不设门槛，保持"收了就推"的现状；团队池设 1+——
   * cite 是"这条真的有用"的签名，没人用的条目留在本地 aging，不污染团队池。
   */
  require_citations: number
}

export interface RemoteForgetConfig {
  /** 本地明确作废 → 远端同步作废。默认开：语义单一无歧义。 */
  on_deprecate: boolean
  /** merge 折叠 → 远端作废。**默认关**：被合并项的内容已在 target 正文里活着。 */
  on_merge: boolean
  /** 单次传播上限，0 = 不限。可由面板配置。 */
  max_per_run: number
}

export interface RemoteProviderConfig {
  id: string
  kind: string
  enabled: boolean
  roles: RemoteRole[]
  projection: RemoteProjectionConfig
  feed: RemoteFeedConfig
  mirror: RemoteMirrorConfig
  forget: RemoteForgetConfig
  /**
   * hybrid 组合检索：该 provider 注入预检包的 token 上限（默认 300）。
   * 0 = 不参与预检注入（同步照常）；上限防止单个远端吃掉整个预检包。
   */
  inject_max_tokens: number
  /** provider 自身连接参数（各家不同，adapter 自己解释）。 */
  config: Record<string, unknown>
}

export interface RemoteSettings {
  enabled: boolean
  mode: RemoteMode
  providers: RemoteProviderConfig[]
}

/** 旧 `tencent:` 段的最小形状：只列 registry 需要的字段。 */
export interface LegacyTencentConfig {
  enabled: boolean
  url: string
  api_key_env: string
  service_id: string
  team_id: string
  agent_id: string
  user_id: string
  task_id: string
  timeout_ms: number
  pull_scope: string
  pull_type: string
  pull_limit: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readInt(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  if (value < min || value > max) return fallback
  return value
}

function readRoles(value: unknown): RemoteRole[] {
  const allowed = new Set<string>(REMOTE_ROLES)
  const roles = readStringArray(value).filter((role): role is RemoteRole => allowed.has(role))
  // 去重但保持声明顺序，便于配置可读、测试可比。
  return [...new Set(roles)]
}

/** 单个 provider 段 → 带默认值的规范化配置。缺字段一律给安全默认（保守 = 少分发）。 */
export function normalizeProvider(raw: unknown, index: number): RemoteProviderConfig {
  const record = asRecord(raw)
  const projection = asRecord(record.projection)
  const feed = asRecord(record.feed)
  const mirror = asRecord(record.mirror)
  const forget = asRecord(record.forget)

  return {
    id: readString(record.id, `provider-${index + 1}`),
    kind: readString(record.kind, 'tencent'),
    enabled: readBool(record.enabled, true),
    roles: readRoles(record.roles),
    projection: {
      scopes: readStringArray(projection.scopes),
      types: readStringArray(projection.types),
      exclude_tags: readStringArray(projection.exclude_tags),
    },
    feed: {
      scope: readString(feed.scope, 'global'),
      type: readString(feed.type, 'knowledge'),
      limit: readInt(feed.limit, 50, 1, 500),
      tags: readStringArray(feed.tags),
      scope_from_tags: readBool(feed.scope_from_tags, false),
    },
    mirror: {
      trigger: ((): RemoteMirrorConfig['trigger'] => {
        const trigger = readString(mirror.trigger, 'manual')
        return trigger === 'accepted' || trigger === 'schedule' || trigger === 'cited' ? trigger : 'manual'
      })(),
      include_body: readBool(mirror.include_body, true),
      max_body_chars: readInt(mirror.max_body_chars, 4000, 0, 1_000_000),
      coordinate_tags: readBool(mirror.coordinate_tags, true),
      require_citations: readInt(mirror.require_citations, 0, 0, 1000),
    },
    forget: {
      on_deprecate: readBool(forget.on_deprecate, true),
      on_merge: readBool(forget.on_merge, false),
      max_per_run: readInt(forget.max_per_run, 100, 0, 100_000),
    },
    inject_max_tokens: readInt(record.inject_max_tokens, 300, 0, 4000),
    config: asRecord(record.config),
  }
}

/**
 * 旧 `tencent:` 段 → provider 列表。
 *
 * 这里是**兼容性契约**：字段一一对应，默认值与旧行为一致（roles 固定 feed+mirror，
 * forget 默认只传播 deprecate）。改这里等于改旧用户的行为，必须同时加回归测试。
 */
export function legacyTencentToProvider(tencent: LegacyTencentConfig): RemoteProviderConfig {
  return {
    id: 'tencent',
    kind: 'tencent',
    enabled: tencent.enabled,
    roles: ['feed', 'mirror'],
    // '*' = 全部分发：V0.7.x 的 push 没有投影概念、推全部 accepted，这里必须等价。
    // 空数组在新语义下表示"什么都不分发"，会让旧用户的行为悄悄改变。
    projection: { scopes: ['*'], types: [], exclude_tags: [] },
    feed: {
      scope: tencent.pull_scope,
      type: tencent.pull_type,
      limit: tencent.pull_limit,
      tags: ['tencent'],
      scope_from_tags: false,
    },
    mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 0 },
    forget: { on_deprecate: true, on_merge: false, max_per_run: 100 },
    inject_max_tokens: 300,
    config: {
      url: tencent.url,
      api_key_env: tencent.api_key_env,
      service_id: tencent.service_id,
      team_id: tencent.team_id,
      agent_id: tencent.agent_id,
      user_id: tencent.user_id,
      task_id: tencent.task_id,
      timeout_ms: tencent.timeout_ms,
    },
  }
}

/**
 * 原始配置 → 规范化 settings。
 *
 * 优先级：配置里**显式写了非空的** `remote.providers` 就只用它，不再 desugar 旧段——
 * 否则用户迁移到新配置后旧的 `tencent:` 还会偷偷生效，那是最难查的一类问题。
 *
 * ⚠️ 空数组必须当成"没写"。`configSchema` 给 `providers` 的默认值就是 `[]`，
 * 若把空数组当作显式配置，所有旧 `tencent:` 配置都会被静默忽略——这是一个会
 * 直接打断现存用户的回归，`tests/remote-service.test.ts` 有对应用例守着。
 */
export function normalizeRemoteSettings(input: {
  remote?: unknown
  tencent?: LegacyTencentConfig
}): RemoteSettings {
  const remote = asRecord(input.remote)
  const rawProviders = Array.isArray(remote.providers) ? remote.providers : []
  const explicitProviders = rawProviders.length > 0 ? rawProviders : null

  let providers: RemoteProviderConfig[]
  let enabled: boolean
  let mode: RemoteMode

  if (explicitProviders !== null) {
    providers = explicitProviders.map((entry, index) => normalizeProvider(entry, index))
    enabled = readBool(remote.enabled, false)
    const rawMode = readString(remote.mode, 'local-first')
    mode = (REMOTE_MODES as readonly string[]).includes(rawMode) ? (rawMode as RemoteMode) : 'local-first'
  } else if (input.tencent !== undefined) {
    // 没有新配置 → 用旧段合成，行为与 V0.7.x 完全一致。
    providers = [legacyTencentToProvider(input.tencent)]
    enabled = input.tencent.enabled
    mode = 'local-first'
  } else {
    providers = []
    enabled = false
    mode = 'local-first'
  }

  return { enabled, mode, providers }
}

export interface RemoteValidationResult {
  ok: boolean
  errors: string[]
}

/**
 * 构造期校验。**在联网之前**拒绝非法组合，避免"两个 provider 都自称权威"这种
 * 事后很难查的状态。
 */
export function validateRemoteSettings(settings: RemoteSettings): RemoteValidationResult {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const provider of settings.providers) {
    const label = `provider "${provider.id}"`

    if (seen.has(provider.id)) {
      errors.push(`duplicate provider id "${provider.id}"`)
    }
    seen.add(provider.id)

    if (provider.roles.length === 0 && provider.enabled) {
      errors.push(`${label} is enabled but declares no role (expected one of ${REMOTE_ROLES.join(', ')})`)
      continue
    }

    // 角色互斥：同一 provider 同时 mirror 与 authority，等于让本地既是源又是副本。
    if (provider.roles.includes('mirror') && provider.roles.includes('authority')) {
      errors.push(
        `${label} declares both "mirror" and "authority"; they are mutually exclusive (two authorities for the same scope)`,
      )
    }

    // authority 需要显式 opt-in：local-first 下不承认任何远端权威。
    if (provider.roles.includes('authority') && settings.mode === 'local-first') {
      errors.push(
        `${label} declares "authority" but remote.mode is "local-first"; set mode to "hybrid" or "remote-authority" to opt in`,
      )
    }

    // authority 不允许承载 project 级作用域：项目记忆必须留在本地可审。
    if (provider.roles.includes('authority')) {
      const projectScope = provider.projection.scopes.find((scope) => scope.startsWith('project'))
      if (projectScope !== undefined) {
        errors.push(
          `${label} declares "authority" but projects scope "${projectScope}"; authority is limited to global and domain:*`,
        )
      }
    }
  }

  // 能力与角色的匹配只能在 adapter 构造后判断，这里只做角色层的结构性校验。
  return { ok: errors.length === 0, errors }
}

export function assertRemoteSettings(settings: RemoteSettings): void {
  const result = validateRemoteSettings(settings)
  if (!result.ok) {
    throw new MemoryError('INVALID_INPUT', `invalid remote configuration: ${result.errors.join('; ')}`)
  }
}

/* ------------------------------------------------------------------ */
/* adapter 构造                                                        */
/* ------------------------------------------------------------------ */

export interface AdapterBuildContext {
  providerId: string
  /** provider 的连接参数（`remote.providers[].config`），已去掉本地策略字段。 */
  config: Record<string, unknown>
  fetchImpl?: typeof fetch
  /** 解析密钥：环境变量优先，其次宿主 credential store。空字符串表示没配。 */
  resolveSecret(envName: string): string
}

export type AdapterFactory = (ctx: AdapterBuildContext) => RemoteAdapter

/** 内置 `tencent` 工厂。缺密钥时明确报错，由注册表降级为诊断而不是让插件挂掉。 */
export const tencentAdapterFactory: AdapterFactory = (ctx) => {
  const apiKeyEnv = readString(ctx.config.api_key_env, 'PROXY_USER_KEY')
  const apiKey = ctx.resolveSecret(apiKeyEnv)
  if (apiKey === '') {
    throw new Error(
      `api key env ${apiKeyEnv} is empty (checked process.env and $DSH_HOME/.credentials.yaml refs)`,
    )
  }
  const client = new TencentClient({
    ...(ctx.fetchImpl === undefined ? {} : { fetchImpl: ctx.fetchImpl }),
    config: {
      url: readString(ctx.config.url, 'http://127.0.0.1:8420'),
      apiKey,
      serviceId: readString(ctx.config.service_id, 'default'),
      teamId: readString(ctx.config.team_id, ''),
      agentId: readString(ctx.config.agent_id, ''),
      userId: readString(ctx.config.user_id, ''),
      taskId: readString(ctx.config.task_id, ''),
      timeoutMs: readInt(ctx.config.timeout_ms, 10_000, 100, 120_000),
    },
  })
  return new TencentAdapter({ id: ctx.providerId, client })
}

export const DEFAULT_ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  tencent: tencentAdapterFactory,
  'http-json': httpJsonAdapterFactory,
}

/** 一个 provider 的运行时句柄：要么有 adapter，要么有构造失败的诊断。**不会抛错**。 */
export interface RemoteProviderHandle {
  settings: RemoteProviderConfig
  adapter: RemoteAdapter | null
  /** adapter 构造失败的原因（缺密钥、未知 kind…）；成功时为 null。 */
  error: string | null
}

export interface RemoteRegistryOptions {
  resolveSecret: (envName: string) => string
  fetchImpl?: typeof fetch
  factories?: Record<string, AdapterFactory>
}

/**
 * provider 注册表。
 *
 * 构造 adapter 时**不联网**；失败只记 `error`，让 `memory_status` 能说清"为什么这个
 * provider 没生效"。这是 AGENTS.md 里"降级不允许静默"的具体落点。
 */
export class RemoteRegistry {
  private readonly settings: RemoteSettings
  private readonly handles: Map<string, RemoteProviderHandle>

  constructor(settings: RemoteSettings, options: RemoteRegistryOptions) {
    this.settings = settings
    const factories = options.factories ?? DEFAULT_ADAPTER_FACTORIES
    this.handles = new Map()

    for (const provider of settings.providers) {
      if (!provider.enabled) {
        this.handles.set(provider.id, { settings: provider, adapter: null, error: 'provider is disabled' })
        continue
      }
      const factory = factories[provider.kind]
      if (factory === undefined) {
        const known = Object.keys(factories).join(', ')
        this.handles.set(provider.id, {
          settings: provider,
          adapter: null,
          error: `unknown provider kind "${provider.kind}" (registered: ${known})`,
        })
        continue
      }
      try {
        const ctx: AdapterBuildContext = {
          providerId: provider.id,
          config: provider.config,
          resolveSecret: options.resolveSecret,
          ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        }
        this.handles.set(provider.id, { settings: provider, adapter: factory(ctx), error: null })
      } catch (error) {
        this.handles.set(provider.id, {
          settings: provider,
          adapter: null,
          error: (error as Error).message,
        })
      }
    }
  }

  get settingsSnapshot(): RemoteSettings {
    return this.settings
  }

  /** 全部 provider（含被禁用与构造失败的），按配置顺序。 */
  list(): RemoteProviderHandle[] {
    return [...this.handles.values()]
  }

  get(providerId: string): RemoteProviderHandle | null {
    return this.handles.get(providerId) ?? null
  }

  /** 承担某角色的**可用** provider（enabled 且 adapter 构造成功）。 */
  byRole(role: RemoteRole): RemoteProviderHandle[] {
    return this.list().filter(
      (handle) => handle.adapter !== null && handle.settings.enabled && handle.settings.roles.includes(role),
    )
  }

  /** 角色到 provider id 的映射，供 status / 面板展示。 */
  roleSummary(): Record<RemoteRole, string[]> {
    const summary = {} as Record<RemoteRole, string[]>
    for (const role of REMOTE_ROLES) {
      summary[role] = this.byRole(role).map((handle) => handle.settings.id)
    }
    return summary
  }

  async close(): Promise<void> {
    for (const handle of this.handles.values()) {
      try {
        await handle.adapter?.close?.()
      } catch {
        // 关闭失败不影响退出；adapter 自身应保证 close 幂等。
      }
    }
  }
}
