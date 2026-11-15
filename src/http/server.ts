/**
 * `memory-hub serve`（ADR-0010 S3 / §5–§7）。
 *
 * - 默认 127.0.0.1:7331；`--port 0` 用临时端口；端口被占**报错不改口**（最小暴露：显式动作）。
 * - **只允许 loopback**：非回环 host 直接拒绝启动（当前不提供 allow_remote 逃生口）。
 * - 写令牌 `records/server-token`（0600，缺则生成）；所有 POST 需 `x-dmh-token`。
 * - `records/server.json` 记 { url, pid, startedAt, tokenFile }；`serve --stop` 读 pid 优雅停。
 * - serve 进程是普通写者：与 DSH 按租约互斥，拿不到锁时面板报"另一进程持有写锁"。
 */

import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { isAbsolute, join, resolve } from 'node:path'
import { createMemoryRouter, type MemoryRouterDeps, type SessionOptionsPayload } from './router.js'
import { renderPanelHtml } from './panel.js'
import { openMemoryHubForTransport, type TransportHandle } from '../transport/hub-handle.js'

export interface ServeServerOptions {
  root: string
  /** 默认 7331；0 = 临时端口。 */
  port?: number
  cwd?: string
}

export interface ServeServerHandle {
  url: string
  port: number
  token: string
  /** 关闭 HTTP server 与 hub；移除 records/server.json。 */
  close: () => Promise<void>
}

export const DEFAULT_SERVE_PORT = 7331

export async function startServeServer(options: ServeServerOptions): Promise<ServeServerHandle> {
  const root = isAbsolute(options.root) ? options.root : resolve(process.cwd(), options.root)
  const host = '127.0.0.1' // 硬编码回环：当前没有 allow_remote 逃生口（ADR-0010 §5）
  const port = options.port ?? DEFAULT_SERVE_PORT

  // 写令牌：records/server-token，缺则生成。0600（Windows 上为尽力而为）。
  const tokenFile = join(root, 'records', 'server-token')
  await mkdir(join(root, 'records'), { recursive: true })
  let token: string
  try {
    token = (await readFile(tokenFile, 'utf8')).trim()
  } catch {
    token = randomBytes(32).toString('hex')
    await writeFile(tokenFile, `${token}\n`, { mode: 0o600 })
    await chmod(tokenFile, 0o600).catch(() => {})
  }

  const handle = await openMemoryHubForTransport({ root, cwd: options.cwd })
  const pack = { service: handle.service, hub: handle.hub }
  const routerDeps: MemoryRouterDeps = {
    resolvePack: () => pack,
    clientExtras: () => ({ advertised: false, reason: 'standalone server (no client modules)' }),
    distillReport: () => null,
    reflectReport: () => null,
    hubs: () => [{ id: '', root }],
    // Host 白名单必须在 listen 之后用实际绑定端口建 router——显式端口与临时端口
    // 统一走下方重建分支（此前只在临时端口分支重建，默认端口路径白名单死在 0）。
    hostMode: { kind: 'fixed-port', port: port },
    writeToken: () => token,
    // serve 独立端口：API 直接在 /api/*，面板页在 / 与 /panel——不带发行包名前缀。
    basePath: '/',
    panelHtml: () => renderPanelHtml(token, '/api'),
  }
  let router = createMemoryRouter(routerDeps)

  const server: Server = createServer((request, response) => {
    void router(request as never, response as never)
  })
  await new Promise<void>((resolveP, rejectP) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        rejectP(new Error(`port ${port} is already in use — pass --port 0 for an ephemeral port (serve never silently changes the port)`))
        return
      }
      rejectP(error)
    })
    server.listen(port, host, () => resolveP())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await closeServer(server)
    await handle.dispose()
    throw new Error('serve: could not determine bound port')
  }
  const boundPort = address.port
  // 无条件重建：Host 白名单对准真实绑定端口（显式端口与临时端口同路径，
  // 避免默认端口路径漏重建——白名单死在 port 0 会把一切请求 421）。
  routerDeps.hostMode = { kind: 'fixed-port', port: boundPort }
  router = createMemoryRouter(routerDeps)

  // server.json：pid + 地址，供 `serve --stop` 与文档发现。token 文件路径进 payload，
  // token 本体不进任何日志。
  const serverFile = join(root, 'records', 'server.json')
  const serverInfo = {
    url: `http://127.0.0.1:${boundPort}`,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    tokenFile,
  }
  await writeFile(serverFile, `${JSON.stringify(serverInfo, null, 2)}\n`, { mode: 0o600 }).catch(() => {})

  return {
    url: serverInfo.url,
    port: boundPort,
    token,
    close: async () => {
      await closeServer(server)
      await handle.dispose()
      await rm(serverFile, { force: true }).catch(() => {})
    },
  }
}

export interface StopServeResult {
  stopped: boolean
  pid?: number
  message?: string
}

/** 会话下拉是 DSH glue 独有的能力；standalone 恒 unavailable，面板退回手填。 */
export const standaloneSessionOptions = async (): Promise<SessionOptionsPayload> => ({ unavailable: true, items: [] })

/** `memory-hub serve --stop`：读 records/server.json，SIGTERM 优雅停。 */
export async function stopServeServer(root: string): Promise<StopServeResult> {
  const serverFile = join(resolve(root), 'records', 'server.json')
  let info: { pid?: number }
  try {
    info = JSON.parse(await readFile(serverFile, 'utf8')) as { pid?: number }
  } catch {
    return { stopped: false, message: `no server.json under ${serverFile} — serve is not running for this root` }
  }
  const pid = info.pid
  if (typeof pid !== 'number' || pid <= 0) {
    return { stopped: false, message: 'server.json has no usable pid' }
  }
  try {
    process.kill(pid, 0) // 探活
  } catch {
    await rm(serverFile, { force: true }).catch(() => {})
    return { stopped: false, pid, message: `pid ${pid} is not running; cleaned stale server.json` }
  }
  if (pid === process.pid) {
    return { stopped: false, pid, message: 'refusing to stop the current process' }
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch (error) {
    return { stopped: false, pid, message: `failed to signal pid ${pid}: ${(error as Error).message}` }
  }
  // Windows 上 SIGTERM 是强杀，被停方没有机会清理自己的 server.json；
  // 由停止方确认进程退出后移除残留记录（短暂轮询，最多 ~2s）。
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0)
      await new Promise<void>((resolveP) => setTimeout(resolveP, 100))
    } catch {
      await rm(serverFile, { force: true }).catch(() => {})
      return { stopped: true, pid }
    }
  }
  return { stopped: true, pid, message: `signalled pid ${pid}; it may still be shutting down (server.json left for next --stop)` }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveP) => {
    server.close(() => resolveP())
  })
}
