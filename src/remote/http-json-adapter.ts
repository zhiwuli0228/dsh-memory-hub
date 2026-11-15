/**
 * `http-json` 声明式适配器：给"其他家"一条**不写代码**的接入路径。
 *
 * 端点与字段映射全部写在配置里（见 proposal-remote-providers §5.6）：
 *
 * ```yaml
 * - id: my-memory
 *   kind: http-json
 *   roles: [index]
 *   config:
 *     base_url: https://memory.example.com
 *     auth: { type: bearer, token_env: MY_MEMORY_TOKEN }
 *     endpoints:
 *       search: { method: POST, path: /v1/memories/search, body: { query: '{{text}}', limit: '{{limit}}' } }
 *     mapping: { items: '$.data.items', id: '$.id', title: '$.title' }
 *     capabilities: [read.search]
 * ```
 *
 * 三条硬约束（同样来自 §5.6）：
 * 1. **能力必须显式声明**（`capabilities`），不猜；声明了但没配端点 = 运行时
 *    `unsupported`，不是构造失败——能力声明是契约，端点是实现，两者可以暂时不一致。
 * 2. 只允许 http/https；`token_env` 走环境变量或 DSH credential store，**密钥不落盘**。
 * 3. **不提供任意 JS 求值**——模板只做 `{{var}}` 插值，映射只做 `$.a.b` 路径取值。
 *    配置永远只是数据，不能变成代码执行面。
 */

import {
  RemoteError,
  REMOTE_CAPABILITIES,
  type RemoteAdapter,
  type RemoteCapability,
  type RemotePage,
  type RemoteProbeResult,
  type RemoteQuery,
  type RemoteRecord,
  remoteError,
} from './types.js'
import type { AdapterBuildContext, AdapterFactory } from './registry.js'

const CAPABILITY_SET = new Set<string>(REMOTE_CAPABILITIES)

/* ------------------------------------------------------------------ */
/* 配置解析与校验                                                       */
/* ------------------------------------------------------------------ */

export interface HttpJsonEndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: Record<string, unknown>
  query?: Record<string, unknown>
}

export interface HttpJsonAuthSpec {
  type: 'bearer' | 'header'
  token_env: string
  /** `type: header` 时的头名，默认 `x-api-key`。 */
  name?: string
}

export interface HttpJsonMappingSpec {
  items: string
  id: string
  /** append 响应里新记录的 id 路径，默认 `$.id`；缺失时回退幂等键。 */
  external_id?: string
  title?: string
  summary?: string
  body?: string
  scope?: string
  tags?: string
  updated_at?: string
  version?: string
  next_cursor?: string
  total?: string
}

export interface HttpJsonSettings {
  base_url: string
  auth: HttpJsonAuthSpec | null
  headers: Record<string, string>
  timeout_ms: number
  endpoints: {
    list?: HttpJsonEndpointSpec
    search?: HttpJsonEndpointSpec
    append?: HttpJsonEndpointSpec
  }
  mapping: HttpJsonMappingSpec
  capabilities: RemoteCapability[]
}

export type HttpJsonParseResult =
  | { ok: true; settings: HttpJsonSettings }
  | { ok: false; errors: string[] }

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function parseEndpoint(raw: unknown, name: string, errors: string[]): HttpJsonEndpointSpec | undefined {
  if (raw === undefined) return undefined
  const record = asRecord(raw)
  const method = readString(record.method)?.toUpperCase() ?? 'POST'
  const path = readString(record.path)
  if (path === undefined) {
    errors.push(`endpoints.${name}.path is required`)
    return undefined
  }
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
    errors.push(`endpoints.${name}.method "${method}" is not one of GET/POST/PUT/PATCH/DELETE`)
    return undefined
  }
  return {
    method,
    path,
    ...(record.body === undefined ? {} : { body: asRecord(record.body) }),
    ...(record.query === undefined ? {} : { query: asRecord(record.query) }),
  }
}

function parseMapping(raw: unknown, errors: string[]): HttpJsonMappingSpec | undefined {
  if (raw === undefined) {
    errors.push('mapping is required when any read endpoint is declared')
    return undefined
  }
  const record = asRecord(raw)
  const items = readString(record.items)
  const id = readString(record.id)
  if (items === undefined || id === undefined) {
    errors.push('mapping.items and mapping.id are required')
    return undefined
  }
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && !value.startsWith('$')) {
      errors.push(`mapping.${key} must be a "$." path (got "${value}")`)
    }
  }
  return {
    items,
    id,
    ...(record.external_id === undefined ? {} : { external_id: readString(record.external_id) }),
    ...(record.title === undefined ? {} : { title: readString(record.title) }),
    ...(record.summary === undefined ? {} : { summary: readString(record.summary) }),
    ...(record.body === undefined ? {} : { body: readString(record.body) }),
    ...(record.scope === undefined ? {} : { scope: readString(record.scope) }),
    ...(record.tags === undefined ? {} : { tags: readString(record.tags) }),
    ...(record.updated_at === undefined ? {} : { updated_at: readString(record.updated_at) }),
    ...(record.version === undefined ? {} : { version: readString(record.version) }),
    ...(record.next_cursor === undefined ? {} : { next_cursor: readString(record.next_cursor) }),
    ...(record.total === undefined ? {} : { total: readString(record.total) }),
  }
}

/**
 * 原始 `providers[].config` → 结构化 settings。**只做结构校验**，不联网。
 * 能力必须显式声明且属于已知词汇表；base_url 必须是 http/https。
 */
export function parseHttpJsonSettings(config: Record<string, unknown>): HttpJsonParseResult {
  const errors: string[] = []
  const baseUrl = readString(config.base_url)
  if (baseUrl === undefined) {
    errors.push('base_url is required')
  } else {
    try {
      const url = new URL(baseUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.push(`base_url must be http/https (got "${url.protocol}")`)
      }
    } catch {
      errors.push(`base_url is not a valid URL: "${baseUrl}"`)
    }
  }

  const rawCapabilities = Array.isArray(config.capabilities) ? config.capabilities : []
  if (rawCapabilities.length === 0) {
    // 显式声明是 http-json 的核心约束：空 = 忘了写，而不是"全都不要"。
    errors.push('capabilities is required and must be a non-empty list (declare exactly what the service supports)')
  }
  const capabilities: RemoteCapability[] = []
  for (const entry of rawCapabilities) {
    if (typeof entry !== 'string' || !CAPABILITY_SET.has(entry)) {
      errors.push(`capabilities contains unknown entry "${String(entry)}" (known: ${[...CAPABILITY_SET].join(', ')})`)
      continue
    }
    capabilities.push(entry as RemoteCapability)
  }

  const endpoints: HttpJsonSettings['endpoints'] = {}
  const endpointRecord = asRecord(config.endpoints)
  const list = parseEndpoint(endpointRecord.list, 'list', errors)
  const search = parseEndpoint(endpointRecord.search, 'search', errors)
  const append = parseEndpoint(endpointRecord.append, 'append', errors)
  if (list !== undefined) endpoints.list = list
  if (search !== undefined) endpoints.search = search
  if (append !== undefined) endpoints.append = append
  if (endpoints.list === undefined && endpoints.search === undefined && endpoints.append === undefined) {
    errors.push('at least one of endpoints.list / endpoints.search / endpoints.append is required')
  }

  let mapping: HttpJsonMappingSpec | undefined
  if (endpoints.list !== undefined || endpoints.search !== undefined) {
    mapping = parseMapping(config.mapping, errors)
  } else {
    // 只有 append 时映射可选（只用 external_id，缺省 $.id）。
    const record = asRecord(config.mapping)
    mapping = { items: '$', id: '$.id', ...(record.external_id === undefined ? {} : { external_id: readString(record.external_id) }) }
  }

  const authRecord = asRecord(config.auth)
  let auth: HttpJsonAuthSpec | null = null
  if (authRecord.type !== undefined) {
    const type = readString(authRecord.type)
    const tokenEnv = readString(authRecord.token_env)
    if (type !== 'bearer' && type !== 'header') {
      errors.push(`auth.type must be "bearer" or "header" (got "${String(authRecord.type)}")`)
    } else if (tokenEnv === undefined) {
      errors.push('auth.token_env is required (never put the token itself in config.yaml)')
    } else {
      auth = { type, token_env: tokenEnv, ...(readString(authRecord.name) === undefined ? {} : { name: readString(authRecord.name) }) }
    }
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(asRecord(config.headers))) {
    if (typeof value === 'string') headers[key] = value
  }

  const timeoutRaw = config.timeout_ms
  const timeoutMs = typeof timeoutRaw === 'number' && Number.isInteger(timeoutRaw) && timeoutRaw >= 100 && timeoutRaw <= 120_000
    ? timeoutRaw
    : 10_000

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    settings: {
      base_url: baseUrl!,
      auth,
      headers,
      timeout_ms: timeoutMs,
      endpoints,
      mapping: mapping!,
      capabilities,
    },
  }
}

/* ------------------------------------------------------------------ */
/* 模板插值与路径取值（不引入表达式求值）                                */
/* ------------------------------------------------------------------ */

const VAR_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(',')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * `{{var}}` 插值。
 * - **整个字符串恰好是一个变量** → 原值替换（数字保持数字、数组保持数组），
 *   严格服务端不必容忍 `"limit": "50"` 这种字符串化数字；
 * - 混合字符串 → 字符串拼接；缺失变量 → 空串（精确形式 → null，JSON 友好）。
 */
export function interpolate(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/)
    if (exact !== null) {
      const name = exact[1]!
      return name in vars ? vars[name] : null
    }
    return value.replace(VAR_PATTERN, (_match, name: string) => stringifyValue(vars[name]))
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, vars))
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) result[key] = interpolate(entry, vars)
    return result
  }
  return value
}

/** `$.a.b` 路径取值；只支持点路径，不支持数组下标（避免映射语言膨胀）。 */
export function lookup(root: unknown, path: string): unknown {
  if (path === '$' || path === '') return root
  if (!path.startsWith('$.')) return undefined
  let cursor: unknown = root
  for (const segment of path.slice(2).split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

/* ------------------------------------------------------------------ */
/* adapter                                                             */
/* ------------------------------------------------------------------ */

/** HTTP 状态 → 错误词汇表。与 tencent-adapter 的映射哲学一致：只有网络类可重试。 */
function statusErrorKind(status: number): 'unauthorized' | 'conflict' | 'unreachable' | 'invalid' {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 409 || status === 412) return 'conflict'
  if (status >= 500) return 'unreachable'
  return 'invalid'
}

export interface HttpJsonAdapterOptions {
  id: string
  settings: HttpJsonSettings
  /** 调用期再解析一次 token：测试注入用；生产构造期已验证非空。 */
  resolveToken(): string
  fetchImpl?: typeof fetch
}

export class HttpJsonAdapter implements RemoteAdapter {
  readonly id: string
  readonly kind = 'http-json'
  private readonly settings: HttpJsonSettings
  private readonly resolveToken: () => string
  private readonly fetchImpl: typeof fetch

  constructor(options: HttpJsonAdapterOptions) {
    this.id = options.id
    this.settings = options.settings
    this.resolveToken = options.resolveToken
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
  }

  capabilities(): ReadonlySet<RemoteCapability> {
    return new Set(this.settings.capabilities)
  }

  async probe(): Promise<RemoteProbeResult> {
    const startedAt = Date.now()
    try {
      if (this.settings.endpoints.list !== undefined) {
        const response = await this.request(this.settings.endpoints.list, { limit: 1, scope: null })
        const page = this.toPage(response)
        return { ok: true, latencyMs: Date.now() - startedAt, detail: `${page.items.length} item(s)` }
      }
      // 没有 list 端点时退化为 GET base_url：只验证可达，不验证语义。
      const response = await this.rawRequest(this.settings.base_url, { method: 'GET' })
      return {
        ok: response.status < 500,
        latencyMs: Date.now() - startedAt,
        detail: response.status < 500 ? `root responded ${response.status}` : `root responded ${response.status}`,
      }
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - startedAt, detail: (error as Error).message }
    }
  }

  async list(q: RemoteQuery): Promise<RemotePage<RemoteRecord>> {
    const spec = this.settings.endpoints.list
    if (spec === undefined) {
      remoteError(this.id, 'unsupported', 'capability "read.list" is declared but endpoints.list is not configured')
    }
    const response = await this.request(spec!, {
      limit: q.limit,
      ...(q.cursor === undefined ? {} : { cursor: q.cursor }),
      ...(q.scope === undefined ? {} : { scope: q.scope }),
    })
    return this.toPage(response)
  }

  async search(q: RemoteQuery): Promise<RemotePage<RemoteRecord>> {
    const spec = this.settings.endpoints.search
    if (spec === undefined) {
      remoteError(this.id, 'unsupported', 'capability "read.search" is declared but endpoints.search is not configured')
    }
    if (typeof q.text !== 'string' || q.text.trim() === '') {
      remoteError(this.id, 'invalid', 'http-json search requires a non-empty `text`')
    }
    const response = await this.request(spec!, {
      text: q.text,
      limit: q.limit,
      ...(q.cursor === undefined ? {} : { cursor: q.cursor }),
      ...(q.scope === undefined ? {} : { scope: q.scope }),
    })
    return this.toPage(response)
  }

  async append(rec: RemoteRecord, opts: { idempotencyKey: string }): Promise<{ externalId: string }> {
    const spec = this.settings.endpoints.append
    if (spec === undefined) {
      remoteError(this.id, 'unsupported', 'capability "write.append" is declared but endpoints.append is not configured')
    }
    const response = await this.request(spec!, {
      id: rec.externalId,
      title: rec.title,
      summary: rec.summary,
      body: rec.body,
      ...(rec.scope === undefined ? {} : { scope: rec.scope }),
      tags: rec.tags,
      ...(rec.updatedAt === undefined ? {} : { updated_at: rec.updatedAt }),
      ...(rec.version === undefined ? {} : { version: rec.version }),
      idempotency_key: opts.idempotencyKey,
    })
    const externalId = lookup(response, this.settings.mapping.external_id ?? this.settings.mapping.id)
    return {
      // 响应没给 id 时回退幂等键：engine 的 externalIds 台账仍然可用（对无删除能力的
      // 服务这只影响台账展示；真有 delete 能力的服务应返回真实 id）。
      externalId: typeof externalId === 'string' && externalId !== '' ? externalId : opts.idempotencyKey,
    }
  }

  /* ---------------- 内部 ---------------- */

  private authHeaders(): Record<string, string> {
    const auth = this.settings.auth
    if (auth === null) return {}
    const token = this.resolveToken()
    if (token === '') return {}
    return auth.type === 'bearer'
      ? { authorization: `Bearer ${token}` }
      : { [auth.name ?? 'x-api-key']: token }
  }

  private async request(spec: HttpJsonEndpointSpec, vars: Record<string, unknown>): Promise<unknown> {
    const base = this.settings.base_url.replace(/\/+$/, '')
    const path = spec.path.startsWith('/') ? spec.path : `/${spec.path}`
    const url = new URL(`${base}${path}`)
    if (spec.query !== undefined) {
      const query = interpolate(spec.query, vars)
      for (const [key, value] of Object.entries(asRecord(query))) {
        if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, stringifyValue(value))
      }
    }
    const headers: Record<string, string> = { ...this.settings.headers, ...this.authHeaders() }
    const method = spec.method
    let body: string | undefined
    if (method !== 'GET' && method !== 'DELETE' && spec.body !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(interpolate(spec.body, vars))
    }
    const response = await this.rawRequest(url.toString(), {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(this.settings.timeout_ms),
    })
    const text = await response.text()
    if (response.status >= 400) {
      const snippet = text.slice(0, 200)
      throw new RemoteError(this.id, statusErrorKind(response.status), `HTTP ${response.status}: ${snippet}`)
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new RemoteError(this.id, 'invalid', `HTTP ${response.status} with non-JSON body: ${text.slice(0, 120)}`)
    }
  }

  private async rawRequest(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init)
    } catch (error) {
      const message = (error as Error)?.message ?? String(error)
      const isTimeout = error instanceof Error && error.name === 'TimeoutError'
      throw new RemoteError(this.id, 'unreachable', isTimeout ? `request timed out: ${url}` : message)
    }
  }

  /** 响应 → 统一分页。缺 id 的条目丢弃（远端噪声不应阻塞整条流水线）。 */
  private toPage(response: unknown): RemotePage<RemoteRecord> {
    const mapping = this.settings.mapping
    const rawItems = lookup(response, mapping.items)
    if (!Array.isArray(rawItems)) {
      remoteError(this.id, 'invalid', `mapping.items "${mapping.items}" did not resolve to an array`)
    }
    const items: RemoteRecord[] = []
    for (const raw of rawItems) {
      const externalId = lookup(raw, mapping.id)
      if (typeof externalId !== 'string' || externalId === '') continue
      const body = readStringAt(raw, mapping.body)
      const summary = readStringAt(raw, mapping.summary) ?? truncate(body ?? '', 240)
      const title = readStringAt(raw, mapping.title) ?? truncate(summary, 60)
      const tagsRaw = mapping.tags === undefined ? undefined : lookup(raw, mapping.tags)
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw.filter((tag): tag is string => typeof tag === 'string')
        : typeof tagsRaw === 'string' && tagsRaw !== ''
          ? tagsRaw.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '')
          : []
      const scope = readStringAt(raw, mapping.scope)
      const updatedAt = readStringAt(raw, mapping.updated_at)
      const version = readStringAt(raw, mapping.version)
      items.push({
        externalId,
        title,
        summary,
        body: body ?? '',
        tags,
        ...(scope === undefined ? {} : { scope }),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        ...(version === undefined ? {} : { version }),
        raw,
      })
    }
    const nextCursor = mapping.next_cursor === undefined ? undefined : readStringAt(response, mapping.next_cursor)
    const total = mapping.total === undefined ? undefined : lookup(response, mapping.total)
    return {
      items,
      ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
      ...(typeof total === 'number' ? { total } : {}),
    }
  }
}

function readStringAt(root: unknown, path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  const value = lookup(root, path)
  return typeof value === 'string' && value !== '' ? value : undefined
}

function truncate(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/* ------------------------------------------------------------------ */
/* 工厂                                                                 */
/* ------------------------------------------------------------------ */

/** 内置 `http-json` 工厂：配置校验失败或密钥缺失 → 抛错，由注册表降级为诊断。 */
export const httpJsonAdapterFactory: AdapterFactory = (ctx: AdapterBuildContext) => {
  const parsed = parseHttpJsonSettings(ctx.config)
  if (!parsed.ok) {
    throw new Error(`invalid http-json config: ${parsed.errors.join('; ')}`)
  }
  const token = parsed.settings.auth === null ? '' : ctx.resolveSecret(parsed.settings.auth.token_env)
  if (parsed.settings.auth !== null && token === '') {
    throw new Error(
      `auth token env ${parsed.settings.auth.token_env} is empty (checked process.env and $DSH_HOME/.credentials.yaml refs)`,
    )
  }
  return new HttpJsonAdapter({
    id: ctx.providerId,
    settings: parsed.settings,
    resolveToken: () => (parsed.settings.auth === null ? '' : ctx.resolveSecret(parsed.settings.auth.token_env)),
    ...(ctx.fetchImpl === undefined ? {} : { fetchImpl: ctx.fetchImpl }),
  })
}
