/**
 * HTTP API 唯一实现（ADR-0010 §2/§6）。
 *
 * 三层依赖里只属于 transport：不 import DSH 宿主包、不触碰客户端模块注册面
 * （tests/http-router.test.ts 有静态断言）。DSH 内嵌与 `memory-hub serve`
 * 共用同一份 handler——"渲染可以有两套，API 契约只能有一套"。
 *
 * 与挂载无关的三层防护（ADR-0010 §6，全部在本文件实现）：
 * 1. 只允许回环地址（403）；
 * 2. **Host 头白名单**（421）——fixed-port 模式下 Host 必须是 127.0.0.1 / localhost / [::1]
 *    （可带 :port），DNS rebinding 的正解；内嵌挂载跳过（宿主的 web 服务自有守卫）；
 * 3. **写操作令牌**（401）——fixed-port 模式下所有 POST 必须 `x-dmh-token` 匹配
 *    `records/server-token`（timing-safe 比较）；内嵌挂载传 null 关闭此闸
 *    （无跨源面，审批端点另有 x-dmh-review + Origin 双守卫）。
 */

import { timingSafeEqual } from 'node:crypto'
import { PLUGIN_VERSION } from '../service.js'
import type { Hub } from '../hub.js'
import type { MemoryService } from '../service.js'
import type { HttpRequestLike, HttpResponseLike } from '../host.js'

export interface RouterPack {
  service: MemoryService
  hub: Hub
}

export interface SessionOptionsPayload {
  unavailable: boolean
  items: Array<{ sessionId: string; cwd: string | null; title: string | null; updatedAt: number | null; blank: boolean }>
}

export interface MemoryRouterDeps {
  /** pack 解析：?core= → hub（DSH 多 hub 注册表；standalone 单 hub 恒返回同一 pack）。 */
  resolvePack: (url: URL) => RouterPack
  /** 挂载信息：glue 给客户端模块广告状态；standalone 给 panel 说明。进 overview payload.client。 */
  clientExtras: () => Record<string, unknown>
  distillReport: () => unknown
  reflectReport: () => unknown
  /** hub 清单（/api/hubs）。 */
  hubs: () => Array<{ id: string; root: string }>
  /** 会话下拉（glue 独有）；缺省 { unavailable: true }。 */
  listSessions?: () => Promise<SessionOptionsPayload>
  /** 配置写成功后的钩子（glue: reconcileDistill）；缺省无。 */
  onConfigUpdated?: (payload: Record<string, unknown>) => Promise<void>
  hostMode: { kind: 'embedded' } | { kind: 'fixed-port'; port: number }
  /** POST 写令牌；null = 关闭令牌闸（内嵌模式）。 */
  writeToken: () => string | null
  /**
   * API 与面板页的 URL 前缀。DSH 内嵌挂载保持缺省 '/dsh-memory-hub'
   * （client.js 的调用契约不变）；serve 独立端口传 '/'（API 走 /api/*，面板页在 / 与 /panel）。
   * 产品对外名是 Memory Hub：URL 前缀是挂载细节，不再把发行包名带进通用面。
   */
  basePath?: string
  /**
   * standalone 面板 HTML（fixed-port 专属；serve 注入 token 后的整页）。
   * 内嵌挂载不传 → 不暴露面板路由。GET / 与 <basePath>/panel 返回它；
   * 不是 API 端点——硬规则"standalone 不新增 API 端点"不受影响。
   */
  panelHtml?: () => string | null
}

const MAX_REVIEW_BATCH = 50

/** 缺省前缀 = DSH 内嵌挂载的历史契约；serve 显式传 '/'。 */
const DEFAULT_BASE_PATH = '/dsh-memory-hub'

/** 与挂载无关的路由守卫顺序：回环 → 方法 → URL → Host → 令牌 → 业务。 */
export function createMemoryRouter(deps: MemoryRouterDeps): (request: HttpRequestLike, response: HttpResponseLike) => Promise<void> {
  return async (request, response) => {
    const method = typeof request.method === 'string' ? request.method : 'GET'
    if (!isLoopbackRequest(request)) {
      sendJson(response, 403, { error: 'loopback-only' }, method)
      return
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      sendJson(response, 405, { error: 'method-not-allowed' }, method)
      return
    }
    let url: URL
    try {
      url = new URL(typeof request.url === 'string' ? request.url : '/', 'http://localhost')
    } catch {
      sendJson(response, 400, { error: 'bad-request' }, method)
      return
    }
    if (deps.hostMode.kind === 'fixed-port' && !isAllowedHost(header(request, 'host'), deps.hostMode.port)) {
      // 421 Misdirected Request：伪造 Host 是 DNS rebinding 的入口，直接拒绝。
      sendJson(response, 421, { error: 'host-mismatch', message: `host header must be 127.0.0.1:${deps.hostMode.port}, localhost:${deps.hostMode.port} or [::1]:${deps.hostMode.port}` }, method)
      return
    }
    if (method === 'POST' && deps.hostMode.kind === 'fixed-port') {
      const expected = deps.writeToken()
      const provided = header(request, 'x-dmh-token')
      if (expected === null || provided === '' || !tokenEquals(provided, expected)) {
        sendJson(response, 401, { error: 'write-token-required', message: 'missing or wrong x-dmh-token header (token lives in records/server-token)' }, method)
        return
      }
    }
    try {
      const basePath = deps.basePath ?? DEFAULT_BASE_PATH
      // 前缀拼接：basePath='/' 时 API 在 /api/*；否则 <basePath>/api/*。
      const pathOf = (suffix: string): string => (basePath === '/' ? suffix : `${basePath}${suffix}`)
      // standalone 面板页（不是 API；fixed-port 专属）。Host 白名单已在上方通过。
      if (url.pathname === '/' || url.pathname === pathOf('/panel')) {
        const html = deps.panelHtml?.() ?? null
        if (html !== null) {
          if (response.writableEnded === true) return
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-frame-options': 'deny',
            'content-length': String(Buffer.byteLength(html, 'utf8')),
          })
          response.end(method === 'HEAD' ? undefined : html)
          return
        }
      }
      if (url.pathname === pathOf('/api/overview')) {
        let payload: Record<string, unknown>
        try {
          const pack = deps.resolvePack(url)
          payload = pack.service.overview()
        } catch (error) {
          payload = {
            version: PLUGIN_VERSION,
            initialized: false,
            error: (error as Error).message,
            generatedAt: new Date().toISOString(),
          }
        }
        payload.client = deps.clientExtras()
        payload.distill = deps.distillReport()
        sendJson(response, 200, payload, method)
        return
      }
      if (url.pathname === pathOf('/api/knowledge')) {
        const id = url.searchParams.get('id')
        if (id === null || id === '') {
          sendJson(response, 400, { error: 'missing-id' }, method)
          return
        }
        try {
          const pack = deps.resolvePack(url)
          const core = url.searchParams.get('core')
          const detail = pack.service.knowledgeDetail(id, core === null || core === '' ? undefined : core)
          if (detail === null) {
            sendJson(response, 404, { error: 'not-found', id }, method)
            return
          }
          sendJson(response, 200, detail, method)
        } catch (error) {
          sendJson(response, 503, { error: 'not-initialized', message: (error as Error).message }, method)
        }
        return
      }
      if (url.pathname === pathOf('/api/sessions')) {
        if (method !== 'GET' && method !== 'HEAD') {
          sendJson(response, 405, { error: 'method-not-allowed' }, method)
          return
        }
        const payload = deps.listSessions !== undefined ? await deps.listSessions() : { unavailable: true, items: [] }
        sendJson(response, 200, payload, method)
        return
      }
      if (url.pathname === pathOf('/api/hubs')) {
        sendJson(response, 200, { cores: deps.hubs() }, method)
        return
      }
      if (url.pathname === pathOf('/api/config')) {
        if (method === 'GET' || method === 'HEAD') {
          try {
            const pack = deps.resolvePack(url)
            sendJson(response, 200, { ...pack.service.config(), distill: deps.distillReport(), reflect: deps.reflectReport() }, method)
          } catch (error) {
            sendJson(response, 503, { error: 'not-initialized', message: (error as Error).message }, method)
          }
          return
        }
        if (method === 'POST') {
          try {
            const pack = deps.resolvePack(url)
            const body = await readJsonBody(request)
            const payload = await pack.service.updateConfig(body as { core_workspaces?: unknown; workspaces?: unknown; remote?: unknown })
            if (deps.onConfigUpdated !== undefined) await deps.onConfigUpdated(payload)
            sendJson(response, 200, { ...payload, distill: deps.distillReport(), reflect: deps.reflectReport() }, method)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: 'invalid-config', message }, method)
          }
          return
        }
      }
      if (url.pathname === pathOf('/api/pending')) {
        if (method !== 'POST') {
          sendJson(response, 405, { error: 'method-not-allowed' }, method)
          return
        }
        // 面板审核把“人工点击”当作批准依据：只接受面板自己发的同源请求
        // （自定义头 + 同源 Origin），并受 policy.panel.review 开关约束。
        // standalone 下另有 x-dmh-token 闸（上方已校验通过）。
        if (header(request, 'x-dmh-review') !== '1') {
          sendJson(response, 403, { error: 'review-header-required', message: 'missing x-dmh-review header' }, method)
          return
        }
        const origin = header(request, 'origin')
        if (origin !== '' && !isLocalOrigin(origin)) {
          sendJson(response, 403, { error: 'origin-forbidden', message: `origin ${origin} is not allowed` }, method)
          return
        }
        try {
          const pack = deps.resolvePack(url)
          if (pack.hub.config.policy.panel.review === false) {
            sendJson(response, 403, { error: 'review-disabled', message: 'panel review is disabled by policy.panel.review' }, method)
            return
          }
          const body = (await readJsonBody(request)) as Record<string, unknown>
          const action = typeof body.action === 'string' ? body.action : ''
          if (action !== 'approve' && action !== 'reject') {
            sendJson(response, 400, { error: 'invalid-action', message: 'action must be approve or reject' }, method)
            return
          }
          const rawIds = Array.isArray(body.ids)
            ? body.ids.filter((value): value is string => typeof value === 'string')
            : typeof body.id === 'string'
              ? [body.id]
              : []
          const ids = [...new Set(rawIds.map((value) => value.trim()).filter((value) => value !== ''))]
          if (ids.length === 0) {
            sendJson(response, 400, { error: 'missing-id' }, method)
            return
          }
          if (ids.length > MAX_REVIEW_BATCH) {
            sendJson(response, 400, { error: 'batch-too-large', message: `at most ${MAX_REVIEW_BATCH} proposals per request` }, method)
            return
          }
          const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : undefined
          const results: Array<Record<string, unknown>> = []
          for (const id of ids) {
            try {
              if (action === 'approve') {
                const result = await pack.service.approveProposal(id)
                results.push({ id, ok: true, action, knowledgeId: result.knowledgeId, version: result.version })
              } else {
                const result = await pack.service.rejectProposal(id, reason)
                results.push({ id, ok: true, action, status: result.status })
              }
            } catch (error) {
              results.push({ id, ok: false, message: error instanceof Error ? error.message : String(error) })
            }
          }
          const failed = results.filter((result) => result.ok !== true).length
          const firstFailure = results.find((result) => result.ok !== true)
          sendJson(
            response,
            failed === ids.length ? 409 : 200,
            {
              ok: failed === 0,
              action,
              approved: results.length - failed,
              failed,
              ...(firstFailure === undefined ? {} : { message: firstFailure.message }),
              results,
            },
            method,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(response, 409, { error: 'review-failed', message }, method)
        }
        return
      }
      sendJson(response, 404, { error: 'not-found', path: url.pathname }, method)
    } catch (error) {
      sendJson(response, 500, { error: 'internal', message: (error as Error).message }, method)
    }
  }
}

/* ---------------- 守卫与工具（同一份实现，两种挂载） ---------------- */

function isLoopbackRequest(request: HttpRequestLike): boolean {
  const address = request.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Host 头白名单：127.0.0.1 / localhost / [::1]，端口可带可不带。 */
function isAllowedHost(host: string, port: number): boolean {
  const normalized = host.trim().toLowerCase()
  if (normalized === '') return false
  const candidates = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
    '127.0.0.1',
    'localhost',
    '[::1]',
  ])
  return candidates.has(normalized)
}

/** timing-safe 令牌比较：先比长度再逐字节，避免逐字符短路泄漏。 */
function tokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** 面板审核只接受本机 Origin（http://127.0.0.1|localhost:<port>）。 */
export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1'
  } catch {
    return false
  }
}

function header(request: HttpRequestLike, name: string): string {
  const headers = request.headers ?? {}
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export function sendJson(response: HttpResponseLike, status: number, body: unknown, method: string): void {
  if (response.writableEnded === true) return
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(text, 'utf8')),
  })
  response.end(method === 'HEAD' ? undefined : text)
}

export function readJsonBody(request: HttpRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const readable = request as unknown as { on: (event: string, listener: (...args: unknown[]) => void) => void }
    readable.on('data', (chunk: unknown) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk)
    })
    readable.on('error', (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))))
    readable.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text === '' ? {} : JSON.parse(text))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}
