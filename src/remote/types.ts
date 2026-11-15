/**
 * 远端记忆 provider 的抽象层。
 *
 * 设计约束（来自 proposal-remote-providers 与 AGENTS.md 不变量）：
 * 1. **按角色接入，不按厂商接入**——`feed` / `mirror` / `authority` / `index` 决定方向，
 *    方向决定谁有权覆盖谁。新接一家 = 新增一个 adapter 或写一份 `http-json` 配置。
 * 2. **能力必须显式声明**——provider 没声明 `write.delete` 时，`forget` 必须返回
 *    `unsupported`，而不是静默成功。静默成功会让本地以为远端已经清干净，实际没有。
 * 3. **失败只降级为诊断**——任何远端故障都不阻塞主流程，回合照常结束。
 * 4. 本文件**不依赖任何宿主**，也不做网络请求（由 adapter 实现承担）。
 */

/** 远端角色。一个 provider 可以同时持有多个角色，但 authority/mirror 对同一 scope 互斥。 */
export const REMOTE_ROLES = ['feed', 'mirror', 'authority', 'index'] as const
export type RemoteRole = (typeof REMOTE_ROLES)[number]

/**
 * 角色语义：
 * - `feed`：远端 → 本地**候选**。产物永远是 `pending/`，绝不自动 commit。
 * - `mirror`：本地 → 远端。只分发，不改本地权威。
 * - `authority`：远端权威，本地只读。只允许 `global` / `domain:*`，且必须显式 opt-in。
 * - `index`：只读检索，不参与同步（把远端当外部索引用）。
 */
export const REMOTE_CAPABILITIES = [
  'read.list',
  'read.search',
  'read.get',
  'write.append',
  'write.upsert',
  'write.delete',
  'scope',
  'changes',
  'realtime',
  'extract',
  'idempotent',
] as const
export type RemoteCapability = (typeof REMOTE_CAPABILITIES)[number]

/**
 * 错误词汇表——**五种，不允许 adapter 自创**。
 * 分类决定重试策略：只有 `unreachable` 值得重试。
 *
 * 为什么从四种加到五种：实现腾讯 adapter 时发现"HTTP 200 但业务码非 0"（参数错、
 * 资源不存在、写入被拒）既不是网络不可达，也不是冲突，更不是能力不支持。硬塞进
 * 四个里会让 outbox 无限重试一个永远不会成功的请求，所以补 `invalid`。
 */
export type RemoteErrorKind =
  /** 网络/超时/5xx：降级为诊断，进 outbox 等下次重试（**唯一可重试**） */
  | 'unreachable'
  /** 401/403：不重试，提示换凭据 */
  | 'unauthorized'
  /** 能力不支持：明确拒答，不静默 no-op */
  | 'unsupported'
  /** 409/412：交人审 diff，不自动合并 */
  | 'conflict'
  /** 远端明确拒绝请求本身（业务码非 0、参数错、资源不存在）：不重试 */
  | 'invalid'

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind
  readonly providerId: string

  constructor(providerId: string, kind: RemoteErrorKind, message: string) {
    super(`[remote:${providerId}:${kind}] ${message}`)
    this.name = 'RemoteError'
    this.providerId = providerId
    this.kind = kind
  }

  /** 只有网络/超时类值得重试；其它重试只会浪费配额并拖长故障时间。 */
  get retryable(): boolean {
    return this.kind === 'unreachable'
  }
}

export function remoteError(providerId: string, kind: RemoteErrorKind, message: string): never {
  throw new RemoteError(providerId, kind, message)
}

export function isRemoteError(error: unknown): error is RemoteError {
  return error instanceof RemoteError
}

/** adapter 之间交换的统一记录形状。`raw` 保留原始响应，便于 adapter 二次加工。 */
export interface RemoteRecord {
  externalId: string
  title: string
  summary: string
  body: string
  /** 'global' | 'domain:<id>' | 'project:<id>'；undefined 表示远端不区分作用域。 */
  scope?: string
  tags: string[]
  updatedAt?: string
  /** 远端 CAS 版本（有则用于冲突检测）。 */
  version?: string
  raw: unknown
}

export interface RemoteQuery {
  text?: string
  scope?: string
  types?: string[]
  limit: number
  cursor?: string
}

export interface RemotePage<T> {
  items: T[]
  cursor?: string
  total?: number
  /** 游标失效，调用方应重拉快照（对应 HTTP 410 语义）。 */
  resetRequired?: boolean
}

export interface RemoteProbeResult {
  ok: boolean
  latencyMs?: number
  detail?: string
}

/**
 * adapter 契约。方法可选——**可选性本身就是能力声明**：
 * 没实现 `delete` 就是没有 `write.delete`，调用方据此拒答。
 */
export interface RemoteAdapter {
  readonly id: string
  readonly kind: string
  capabilities(): ReadonlySet<RemoteCapability>
  /** 只读探活；**不抛错**，失败返回 `ok: false` + 诊断。 */
  probe(): Promise<RemoteProbeResult>

  list?(q: RemoteQuery): Promise<RemotePage<RemoteRecord>>
  search?(q: RemoteQuery): Promise<RemotePage<RemoteRecord>>
  get?(externalId: string, scope?: string): Promise<RemoteRecord | null>

  append?(rec: RemoteRecord, opts: { idempotencyKey: string }): Promise<{ externalId: string }>
  upsert?(
    rec: RemoteRecord,
    opts: { idempotencyKey: string; baseVersion?: string },
  ): Promise<{ externalId: string; version?: string }>
  /** 删除/作废。没有此能力的 provider 必须让 forget 返回 unsupported，而不是静默成功。 */
  delete?(externalId: string, opts: { scope?: string; reason: string }): Promise<void>

  changesSince?(cursor: string | null): Promise<RemotePage<RemoteRecord>>
  close?(): Promise<void>
}

/** 声明式能力检查：调用前先问"你到底支不支持"，而不是 try/catch 猜。 */
export function hasCapability(adapter: RemoteAdapter, capability: RemoteCapability): boolean {
  return adapter.capabilities().has(capability)
}

/**
 * 强制要求某项能力。不满足时抛 `unsupported`（而不是 TypeError 或静默 undefined），
 * 这样上层可以把它翻译成"这个 provider 做不到"，而不是"插件坏了"。
 */
export function requireCapability(adapter: RemoteAdapter, capability: RemoteCapability): void {
  if (!hasCapability(adapter, capability)) {
    remoteError(
      adapter.id,
      'unsupported',
      `provider "${adapter.id}" (${adapter.kind}) does not declare capability "${capability}"`,
    )
  }
}

/**
 * 取一个必须存在的方法。比直接 `adapter.list!(...)` 安全：能力声明与方法实现不一致时
 * 立刻报 `unsupported`，而不是运行时 undefined is not a function。
 */
export function requireMethod<K extends 'list' | 'search' | 'get' | 'append' | 'upsert' | 'delete' | 'changesSince'>(
  adapter: RemoteAdapter,
  method: K,
): NonNullable<RemoteAdapter[K]> {
  const capability = METHOD_CAPABILITY[method]
  requireCapability(adapter, capability)
  const fn = adapter[method]
  if (typeof fn !== 'function') {
    remoteError(
      adapter.id,
      'unsupported',
      `provider "${adapter.id}" declares "${capability}" but does not implement "${method}()"`,
    )
  }
  return fn.bind(adapter) as NonNullable<RemoteAdapter[K]>
}

const METHOD_CAPABILITY = {
  list: 'read.list',
  search: 'read.search',
  get: 'read.get',
  append: 'write.append',
  upsert: 'write.upsert',
  delete: 'write.delete',
  changesSince: 'changes',
} as const satisfies Record<string, RemoteCapability>

/** 只读能力集合：`index` 角色只允许有这些。 */
export const READ_ONLY_CAPABILITIES: ReadonlySet<RemoteCapability> = new Set<RemoteCapability>([
  'read.list',
  'read.search',
  'read.get',
  'scope',
  'changes',
  'realtime',
])

export function isReadOnly(adapter: RemoteAdapter): boolean {
  for (const capability of adapter.capabilities()) {
    if (!READ_ONLY_CAPABILITIES.has(capability)) return false
  }
  return true
}
