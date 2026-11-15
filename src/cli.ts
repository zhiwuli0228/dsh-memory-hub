#!/usr/bin/env node
/**
 * `memory-hub` CLI（ADR-0010 §6）。
 *
 * CLI 与 MCP 共用同一份 service 调用（tool-surface §6：不各写一套）。
 * 命令面：mcp / serve / status / search / get / inbox / eval-golden。
 * search / get / inbox 是只读三件套：给 shell 用户与 agent 的最小读取面，
 * 与 MCP 的 memory_search / memory_get / overview(pending) 同源。
 *
 * root 解析：`--root` 优先；否则回退默认 Hub `~/.dsh/memory-hub`
 * （KNO-000032：默认 Hub 只是配置/回退 Hub，项目知识按 core root 分布）。
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { PACKAGE_VERSION } from './version.js'
import { createMemoryToolCatalog, openMemoryHubForTransport, runMcpStdio } from './transport/mcp.js'
import { startServeServer, stopServeServer } from './http/server.js'
import { runGoldenSet } from './eval/golden.js'

const HELP = `memory-hub — local-first, file-native long-term memory hub (v${PACKAGE_VERSION})

Usage:
  memory-hub mcp [--root <dir>]            Start the MCP stdio server (Claude Code / opencode / Cline / any MCP client)
  memory-hub serve [--root <dir>] [--port N] [--stop]
                                           Start the standalone panel server (default port 7331, loopback only);
                                           --stop signals the pid recorded in records/server.json
  memory-hub status [--root <dir>] [--json] Read-only hub health check
  memory-hub search <query> [--root <dir>] [--limit N] [--type T]... [--json]
                                           Read-only retrieval over accepted knowledge (same engine as memory_search)
  memory-hub get <id> [--root <dir>] [--json]
                                           Read one knowledge entry by id (title/metadata/body)
  memory-hub inbox [--root <dir>] [--batch <id>] [--json]
                                           List pending proposals awaiting human approval
  memory-hub eval-golden --root <dir> [--top 20] [--k 5] [--json out] [--markdown out]
                                           Golden set baseline: cite-count-ranked entries vs top-K retrieval (read-only)
  memory-hub --version                      Print the version
  memory-hub --help                         Show this help

Root resolution: --root wins; otherwise the fallback hub ~/.dsh/memory-hub.
Point --root at a core hub root to serve that hub's knowledge.
Write paths stay out of the CLI on purpose: humans approve in the panel.
`

interface CliOptions {
  root?: string
  json: boolean
  port?: number
  stop: boolean
  top: number
  k: number
  jsonOut?: string
  markdownOut?: string
  limit?: number
  types: string[]
  batch?: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, stop: false, top: 20, k: 5, types: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      index += 1
      options.root = argv[index]
    } else if (arg === '--json') {
      // 二义：--json 出现在 status/search 里是布尔开关；出现在 eval-golden 里可带
      // 输出路径——只有以 .json 结尾的值才算路径，避免吞掉 positional 查询词。
      const next = argv[index + 1]
      if (next !== undefined && next.endsWith('.json')) {
        options.jsonOut = next
        index += 1
      } else {
        options.json = true
      }
    } else if (arg === '--markdown') {
      index += 1
      options.markdownOut = argv[index]
    } else if (arg === '--port') {
      index += 1
      const raw = Number(argv[index])
      options.port = Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : undefined
    } else if (arg === '--top') {
      index += 1
      const raw = Number(argv[index])
      options.top = Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 20
    } else if (arg === '--k') {
      index += 1
      const raw = Number(argv[index])
      options.k = Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 5
    } else if (arg === '--limit') {
      index += 1
      const raw = Number(argv[index])
      options.limit = Number.isFinite(raw) && raw >= 1 ? Math.min(20, Math.trunc(raw)) : undefined
    } else if (arg === '--type') {
      index += 1
      const value = argv[index]
      if (value !== undefined) options.types.push(value)
    } else if (arg === '--batch') {
      index += 1
      const value = argv[index]
      if (value !== undefined) options.batch = value
    } else if (arg === '--stop') {
      options.stop = true
    }
  }
  return options
}

/** 第一个非 flag、非 flag 值的 token（search 的 query / get 的 id）。 */
function positional(argv: string[]): string | undefined {
  const valueFlags = new Set(['--root', '--markdown', '--port', '--top', '--k', '--limit', '--type', '--batch'])
  // --json 的值已在 parseArgs 里按 .json 后缀消化；这里只需跳过已知值 flag。
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue
    if (arg.startsWith('--')) {
      if (valueFlags.has(arg)) index += 1
      continue
    }
    if (arg !== '') return arg
  }
  return undefined
}

function defaultRoot(): string {
  return join(homedir(), '.dsh', 'memory-hub')
}

export interface CliIo {
  out: (text: string) => void
  err: (text: string) => void
}

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const command = argv[0]

  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    io.out(HELP)
    return 0
  }
  if (command === '--version' || command === '-v') {
    io.out(`${PACKAGE_VERSION}\n`)
    return 0
  }

  const options = parseArgs(argv.slice(1))
  const root = options.root ?? defaultRoot()

  if (command === 'mcp') {
    const handle = await openMemoryHubForTransport({ root })
    try {
      await runMcpStdio(handle, {
        serverInfo: { name: 'memory-hub', version: PACKAGE_VERSION },
        tools: createMemoryToolCatalog(handle),
      })
    } finally {
      await handle.dispose()
    }
    return 0
  }

  if (command === 'serve') {
    if (options.stop) {
      const result = await stopServeServer(root)
      io.out(`${result.stopped ? 'stopped' : 'not-stopped'}${result.pid === undefined ? '' : ` (pid ${result.pid})`}${result.message === undefined ? '' : `: ${result.message}`}\n`)
      return result.stopped ? 0 : 1
    }
    const serveHandle = await startServeServer({ root, port: options.port })
    io.out(`memory-hub serve: ${serveHandle.url}\n`)
    io.out('write token: records/server-token (POSTs need the x-dmh-token header)\n')
    io.out('press Ctrl+C to stop\n')
    let closing = false
    const shutdown = (): void => {
      if (closing) return
      closing = true
      void serveHandle.close().finally(() => {
        process.exit(0)
      })
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    await new Promise<never>(() => {}) // serve 进程长驻；由信号或 kill 结束
  }

  if (command === 'search') {
    const query = positional(argv.slice(1))
    if (query === undefined) {
      io.err('usage: memory-hub search <query> [--root <dir>] [--limit N] [--type T] [--json]\n')
      return 2
    }
    const handle = await openMemoryHubForTransport({ root })
    try {
      const result = await handle.service.search(handle.agent, {
        query,
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.types.length === 0 ? {} : { types: options.types as never }),
      })
      if (options.json) {
        io.out(`${JSON.stringify({ query, total: result.total, hits: result.hits }, null, 2)}\n`)
        return 0
      }
      io.out(`${result.total} hit(s) for "${query}"\n`)
      result.hits.forEach((hit, index) => {
        io.out(`${index + 1}. ${hit.id} (v${hit.version}, score ${hit.score.toFixed(3)}) ${hit.title}\n`)
        io.out(`   ${hit.scope.level === 'project' ? `project:${hit.scope.workspaceId}` : hit.scope.level} · ${hit.type}/${hit.status}\n`)
        io.out(`   ${hit.snippet.replace(/\s+/g, ' ').slice(0, 160)}\n`)
      })
      return 0
    } finally {
      await handle.dispose()
    }
  }

  if (command === 'get') {
    const id = positional(argv.slice(1))
    if (id === undefined) {
      io.err('usage: memory-hub get <id> [--root <dir>] [--json]\n')
      return 2
    }
    const handle = await openMemoryHubForTransport({ root })
    try {
      const detail = handle.service.knowledgeDetail(id)
      if (detail === null) {
        io.err(`not found: ${id}\n`)
        return 1
      }
      if (options.json) {
        io.out(`${JSON.stringify(detail, null, 2)}\n`)
        return 0
      }
      const metadata = detail.metadata as { title?: string; type?: string; status?: string; version?: number; scope?: string; updatedAt?: string }
      io.out(`${metadata.title ?? id}\n`)
      io.out(`${id} · v${metadata.version ?? '?'} · ${metadata.type ?? '?'}/${metadata.status ?? '?'} · ${metadata.scope ?? '?'} · updated ${metadata.updatedAt ?? '?'}\n`)
      io.out(`${detail.path}\n\n`)
      io.out(`${detail.body}\n`)
      return 0
    } finally {
      await handle.dispose()
    }
  }

  if (command === 'inbox') {
    const handle = await openMemoryHubForTransport({ root })
    try {
      const overview = handle.service.overview() as {
        pendingTotal: number
        pending: Array<{ id: string; operation: string; type: string; title: string; scope: string; batch: string | null; createdAt: string; risk?: { level?: string } }>
        pendingBatches: Array<{ batch: string; count: number }>
      }
      const pending = options.batch === undefined ? overview.pending : overview.pending.filter((item) => item.batch === options.batch)
      if (options.json) {
        io.out(`${JSON.stringify({ pendingTotal: overview.pendingTotal, batches: overview.pendingBatches, pending }, null, 2)}\n`)
        return 0
      }
      io.out(`pending ${pending.length}/${overview.pendingTotal}`)
      if (overview.pendingBatches.length > 0) {
        io.out(` · batches: ${overview.pendingBatches.map((entry) => `${entry.batch}(${entry.count})`).join(', ')}`)
      }
      io.out('\n')
      pending.forEach((item, index) => {
        io.out(`${index + 1}. ${item.id} [${item.operation}/${item.type}] ${item.title}\n`)
        io.out(`   ${item.scope}${item.batch === null ? '' : ` · batch:${item.batch}`} · risk ${item.risk?.level ?? 'none'} · ${item.createdAt}\n`)
      })
      return 0
    } finally {
      await handle.dispose()
    }
  }

  if (command === 'eval-golden') {
    const report = await runGoldenSet({ root, top: options.top, k: options.k, json: options.jsonOut ?? null, markdown: options.markdownOut ?? null })
    io.out(`golden ${report.goldenCount} (skipped ${report.skipped}) · K=${report.k}\n`)
    io.out(`hit@1 = ${report.hitAt1}/${report.goldenCount} (${(report.hitAt1Rate * 100).toFixed(1)}%)\n`)
    io.out(`hit@${report.k} = ${report.hitAtK}/${report.goldenCount} (${(report.hitAtKRate * 100).toFixed(1)}%)\n`)
    for (const row of report.rows.slice(0, 10)) {
      io.out(`  ${row.hit === null ? '✗' : String(row.hit)}  ${row.knowledgeId}  (cited ${row.citations})  ${row.title}\n`)
    }
    return 0
  }

  if (command === 'status') {
    const handle = await openMemoryHubForTransport({ root })
    try {
      const status = handle.service.status(handle.agent)
      io.out(`${JSON.stringify(status, null, options.json ? 0 : 2)}\n`)
    } finally {
      await handle.dispose()
    }
    return 0
  }

  io.err(`unknown command: ${command}\n\n${HELP}`)
  return 2
}

async function main(): Promise<number> {
  const io: CliIo = { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) }
  return runCli(process.argv.slice(2), io)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`memory-hub: ${(error as Error).message}\n`)
    process.exitCode = 1
  })
