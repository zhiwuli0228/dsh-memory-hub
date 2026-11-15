/**
 * 腾讯 Agent Memory v3 API client.
 *
 * 只做 HTTP 封装：无状态、无 DSH 依赖、全部调用带超时与结构化错误。
 * 该模块只在 `tencent.enabled === true` 时被实例化；关闭时没有任何网络请求。
 *
 * 约定（来自 2026-11-13 实测）：
 * - 所有端点都是 POST + JSON，信封 `{code, message, request_id, data}`；
 * - 数据面需要 `Authorization: Bearer <token>` + `x-tdai-service-id`；
 * - 隔离字段 `team_id / agent_id / user_id / task_id` 放 body（body 优先于 header）；
 * - 402/5xx/网络错误统一抛 TencentError，由上层降级为诊断，不阻塞主流程。
 */

export interface TencentConfig {
  /** 数据面地址，例如 http://127.0.0.1:8420。 */
  url: string
  /** 鉴权 token（Bearer）。从环境变量读取，不落盘。 */
  apiKey: string
  /** x-tdai-service-id，默认 default。 */
  serviceId: string
  teamId: string
  agentId: string
  userId: string
  taskId: string
  /** 单次请求超时 ms。 */
  timeoutMs: number
}

export interface TencentEnvelope<T> {
  code: number
  message: string
  request_id: string
  data: T
}

/** 腾讯侧的原子记忆条目（L1）。 */
export interface TencentAtomicItem {
  id: string
  type: 'episodic' | 'persona' | 'instruction' | string
  content: string
  score?: number
  team_id?: string
  agent_id?: string
  user_id?: string
  created_at?: string
  updated_at?: string
}

/** 腾讯侧的 L2 场景条目。 */
export interface TencentScenarioEntry {
  path: string
  summary: string
  version?: number
  created_at?: string
  updated_at?: string
}

export class TencentError extends Error {
  readonly status: number | null
  readonly code: string

  constructor(message: string, options: { status?: number | null; code?: string } = {}) {
    super(message)
    this.name = 'TencentError'
    this.status = options.status ?? null
    this.code = options.code ?? 'TENCENT_ERROR'
  }
}

export interface TencentClientOptions {
  config: TencentConfig
  /** 注入 fetch 便于测试；默认用全局 fetch。 */
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 10_000

export class TencentClient {
  private readonly config: TencentConfig
  private readonly fetchImpl: typeof fetch

  constructor(options: TencentClientOptions) {
    this.config = options.config
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch)
  }

  get baseUrl(): string {
    return this.config.url.replace(/\/+$/, '')
  }

  private isolation(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      team_id: this.config.teamId,
      ...(this.config.agentId === '' ? {} : { agent_id: this.config.agentId }),
      ...(this.config.userId === '' ? {} : { user_id: this.config.userId }),
      ...(this.config.taskId === '' ? {} : { task_id: this.config.taskId }),
      ...extra,
    }
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || DEFAULT_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'x-tdai-service-id': this.config.serviceId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await response.text()
      let envelope: TencentEnvelope<T> | null = null
      try {
        envelope = JSON.parse(text) as TencentEnvelope<T>
      } catch {
        throw new TencentError(`tencent ${path}: non-JSON response (${response.status})`, { status: response.status })
      }
      if (!response.ok) {
        const message = typeof envelope?.message === 'string' ? envelope.message : `HTTP ${response.status}`
        throw new TencentError(`tencent ${path}: ${message}`, { status: response.status, code: envelope?.code === undefined ? 'HTTP_ERROR' : String(envelope.code) })
      }
      if (envelope === null || envelope.code !== 0) {
        throw new TencentError(`tencent ${path}: code ${envelope?.code ?? 'null'} ${envelope?.message ?? ''}`.trim(), {
          status: response.status,
          code: String(envelope?.code ?? 'BIZ_ERROR'),
        })
      }
      return envelope.data
    } catch (error) {
      if (error instanceof TencentError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TencentError(`tencent ${path}: timeout after ${this.config.timeoutMs}ms`, { code: 'TIMEOUT' })
      }
      throw new TencentError(`tencent ${path}: ${(error as Error).message}`, { code: 'NETWORK_ERROR' })
    } finally {
      clearTimeout(timeout)
    }
  }

  /** 只读连通性：拉取 L1 计数。失败说明配置/网络有问题。 */
  async ping(): Promise<{ total: number }> {
    return this.post<{ total: number }>('/v3/atomic/count', this.isolation())
  }

  /** 按语义/关键词检索 L1 原子记忆。 */
  async searchAtomics(query: string, limit = 10): Promise<TencentAtomicItem[]> {
    const data = await this.post<{ items?: TencentAtomicItem[]; total?: number }>(
      '/v3/atomic/search',
      this.isolation({ query, limit }),
    )
    return Array.isArray(data.items) ? data.items : []
  }

  /** 列出 L1 原子记忆（无 query 时按时间倒序）。 */
  async listAtomics(limit = 50): Promise<TencentAtomicItem[]> {
    const data = await this.post<{ items?: TencentAtomicItem[]; total?: number }>(
      '/v3/atomic/query',
      this.isolation({ limit }),
    )
    return Array.isArray(data.items) ? data.items : []
  }

  /** 列出 L2 场景文件。 */
  async listScenarios(): Promise<TencentScenarioEntry[]> {
    const data = await this.post<{ entries?: TencentScenarioEntry[]; total?: number }>(
      '/v3/scenario/ls',
      this.isolation(),
    )
    return Array.isArray(data.entries) ? data.entries : []
  }

  /** 读取 L2 场景文件全文。 */
  async readScenario(path: string): Promise<string> {
    const data = await this.post<{ content?: string }>('/v3/scenario/read', this.isolation({ path }))
    return typeof data.content === 'string' ? data.content : ''
  }

  /** 追加一条 conversation 消息（腾讯侧异步抽取为 L1）。 */
  async addConversation(sessionId: string, role: 'user' | 'assistant', content: string): Promise<unknown> {
    return this.post<unknown>(
      '/v3/conversation/add',
      this.isolation({ session_id: sessionId, messages: [{ role, content }] }),
    )
  }

  /** 读取 L0 会话消息。 */
  async queryConversation(sessionId: string, limit = 20): Promise<unknown> {
    return this.post<unknown>('/v3/conversation/query', this.isolation({ session_id: sessionId, limit }))
  }
}
