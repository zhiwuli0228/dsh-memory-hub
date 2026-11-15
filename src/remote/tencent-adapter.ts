/**
 * 腾讯 Agent Memory 的 adapter 实现。
 *
 * 这一层**只做翻译**：把 `TencentClient` 的厂商方法映射成 `RemoteAdapter` 契约。
 * 它不判断"该不该同步"、不写本地文件、不认识 KnowledgeRecord——那是 sync 引擎的事。
 *
 * 能力现状（2026-11 实测，这是"治理缺口"的具体体现）：
 * - 有：`read.list` / `read.search` / `write.append` / `extract`
 * - 没有：`write.delete`（腾讯 v3 数据面不提供删除/作废）
 * - 没有：`scope`（隔离字段是进程级绑定，不是 per-call 作用域）
 * - 没有：`changes`（无原生增量游标，只能按时间戳自行比较）
 *
 * 因此当有人要求"把本地作废传播到腾讯"时，本 adapter 必须返回 `unsupported`，
 * 由上层记孤儿并提示人工处理——**绝不能静默成功**。
 */

import { TencentClient, TencentError, type TencentAtomicItem } from '../tencent-client.js'
import {
  RemoteError,
  type RemoteAdapter,
  type RemoteCapability,
  type RemotePage,
  type RemoteProbeResult,
  type RemoteQuery,
  type RemoteRecord,
  remoteError,
} from './types.js'

const CAPABILITIES: ReadonlySet<RemoteCapability> = new Set<RemoteCapability>([
  'read.list',
  'read.search',
  'write.append',
  'extract',
])

/** 把腾讯的 `TencentError` 归一成我们的错误词汇表。映射错了会导致 outbox 无限重试。 */
function mapError(providerId: string, error: unknown): RemoteError {
  if (error instanceof RemoteError) return error
  if (!(error instanceof TencentError)) {
    return new RemoteError(providerId, 'unreachable', (error as Error)?.message ?? String(error))
  }
  if (error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR') {
    return new RemoteError(providerId, 'unreachable', error.message)
  }
  const status = error.status ?? 0
  if (status === 401 || status === 403) {
    return new RemoteError(providerId, 'unauthorized', error.message)
  }
  if (status === 409 || status === 412) {
    return new RemoteError(providerId, 'conflict', error.message)
  }
  if (status >= 500) {
    return new RemoteError(providerId, 'unreachable', error.message)
  }
  // HTTP 200 但业务码非 0，或其它 4xx：请求本身不被接受，重试无意义。
  return new RemoteError(providerId, 'invalid', error.message)
}

/** 腾讯 L1 原子记忆 → 统一记录。 */
function toRecord(item: TencentAtomicItem): RemoteRecord {
  const summary = typeof item.content === 'string' ? item.content.replace(/\s+/g, ' ').trim() : ''
  const title = summary.length > 60 ? `${summary.slice(0, 60)}…` : summary
  return {
    externalId: item.id,
    title,
    summary: summary.length > 240 ? `${summary.slice(0, 240)}…` : summary,
    body: typeof item.content === 'string' ? item.content : '',
    tags: typeof item.type === 'string' && item.type !== '' ? [item.type] : [],
    ...(item.updated_at === undefined ? {} : { updatedAt: item.updated_at }),
    raw: item,
  }
}

export interface TencentAdapterOptions {
  /** provider 实例 id（配置里的 `remote.providers[].id`），不是厂商名。 */
  id: string
  client: TencentClient
}

export class TencentAdapter implements RemoteAdapter {
  readonly id: string
  readonly kind = 'tencent'
  private readonly client: TencentClient

  constructor(options: TencentAdapterOptions) {
    this.id = options.id
    this.client = options.client
  }

  capabilities(): ReadonlySet<RemoteCapability> {
    return CAPABILITIES
  }

  async probe(): Promise<RemoteProbeResult> {
    const startedAt = Date.now()
    try {
      const { total } = await this.client.ping()
      return { ok: true, latencyMs: Date.now() - startedAt, detail: `${total} atomics` }
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - startedAt, detail: (error as Error).message }
    }
  }

  async list(q: RemoteQuery): Promise<RemotePage<RemoteRecord>> {
    try {
      // 腾讯无原生增量游标，也不接受 per-call scope：这里只能按 limit 截断。
      // 需要增量的调用方请自行比较 `updatedAt`（见 sync 引擎的 pulledIds 去重）。
      const items = await this.client.listAtomics(q.limit)
      return { items: items.map(toRecord), total: items.length }
    } catch (error) {
      throw mapError(this.id, error)
    }
  }

  async search(q: RemoteQuery): Promise<RemotePage<RemoteRecord>> {
    if (typeof q.text !== 'string' || q.text.trim() === '') {
      remoteError(this.id, 'invalid', 'tencent search requires a non-empty `text`')
    }
    try {
      const items = await this.client.searchAtomics(q.text, q.limit)
      return { items: items.map(toRecord), total: items.length }
    } catch (error) {
      throw mapError(this.id, error)
    }
  }

  async append(rec: RemoteRecord, opts: { idempotencyKey: string }): Promise<{ externalId: string }> {
    try {
      // 腾讯的 append 语义是"往某个 conversation 追加一条消息，由它异步抽取"。
      // 用幂等键当会话 id，保证同一 (知识, 版本) 落进同一个会话，避免重复抽取。
      const sessionId = `dsh-memory-hub:${opts.idempotencyKey}`
      const payload = [rec.title, rec.summary, rec.body].filter((part) => part !== '').join('\n\n')
      await this.client.addConversation(sessionId, 'user', payload)
      return { externalId: sessionId }
    } catch (error) {
      throw mapError(this.id, error)
    }
  }
}

/**
 * 腾讯 adapter 不支持删除。单独导出这个断言函数，供 sync 引擎与测试使用：
 * 让"不支持"成为**可观测的事实**，而不是调用时才炸。
 */
export function tencentForgetUnsupported(providerId: string): never {
  remoteError(
    providerId,
    'unsupported',
    'tencent v3 exposes no delete/invalidate endpoint; forget cannot propagate to this provider',
  )
}
