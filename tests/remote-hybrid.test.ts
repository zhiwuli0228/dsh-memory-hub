/**
 * hybrid 组合检索（proposal-remote-providers §5.7）：
 * - **默认（local-first）零网络**：远端只在显式 hybrid 模式参与预检；
 * - hybrid：并发 fan-out、按 provider 分组、每条带 source 标注、**不混排分数**；
 * - 每 provider 注入 token 上限（inject_max_tokens，0 = 不参与）；
 * - 慢远端按死线降级为 unavailable，绝不拖住回合；
 * - 远端命中只是外部参考：不进 state.hits、不可 memory_cite、不自动 commit。
 */

import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHarness, type Harness } from './helpers.js'

let harness: Harness | null = null
let server: Server | null = null

afterEach(async () => {
  if (harness !== null) {
    await harness.cleanup()
    harness = null
  }
  if (server !== null) {
    server.closeAllConnections?.()
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }
  vi.unstubAllEnvs()
})

type SearchItem = { id: string; title: string; summary: string; content?: string; tags?: string[] }

/** 起一个只回应 /v1/memories/search 的假想远端。delayMs 模拟慢远端。 */
async function startSearchServer(items: SearchItem[], delayMs = 0): Promise<string> {
  const srv = createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: { items, next: null } }))
    }, delayMs)
  })
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()))
  server = srv
  const address = srv.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return `http://127.0.0.1:${address.port}`
}

function providerConfig(baseUrl: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'third-party',
    kind: 'http-json',
    enabled: true,
    roles: ['index'],
    projection: { scopes: [], types: [], exclude_tags: [] },
    feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [] },
    mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000 },
    forget: { on_deprecate: true, on_merge: false, max_per_run: 100 },
    inject_max_tokens: 300,
    config: {
      base_url: baseUrl,
      endpoints: {
        search: { method: 'POST', path: '/v1/memories/search', body: { query: '{{text}}', limit: '{{limit}}' } },
      },
      mapping: { items: '$.data.items', id: '$.id', title: '$.title', summary: '$.summary', body: '$.content', tags: '$.tags' },
      capabilities: ['read.search'],
    },
    ...overrides,
  }
}

function remoteSection(pack: string): string {
  const marker = 'Remote memory (external annotations'
  const index = pack.indexOf(marker)
  return index >= 0 ? pack.slice(index) : ''
}

const TWO_ITEMS: SearchItem[] = [
  { id: 'srv-1', title: '远端部署约定', summary: '统一用 docker compose 部署', tags: ['mh:scope:project', 'mh:ws:dsh-plugin-dev'] },
  { id: 'srv-2', title: '远端评审流程', summary: 'PR 必须两人评审' },
]

describe('hybrid combined retrieval', () => {
  it('never touches the network in local-first mode (default)', async () => {
    harness = await createHarness()
    const unreachable = 'http://127.0.0.1:1' // 即使配了 provider，local-first 也不该联网
    harness.hub.config.remote = {
      enabled: true,
      mode: 'local-first',
      hybrid: { deadline_ms: 2000 },
      providers: [providerConfig(unreachable)] as never,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await harness.service.manualPreflight(harness.agent, '部署约定是什么', false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.pack).not.toContain('Remote memory')
  })

  it('annotates remote hits per provider and records contributions in the ledger', async () => {
    harness = await createHarness()
    const baseUrl = await startSearchServer(TWO_ITEMS)
    harness.hub.config.remote = {
      enabled: true,
      mode: 'hybrid',
      hybrid: { deadline_ms: 2000 },
      providers: [providerConfig(baseUrl)] as never,
    }

    const result = await harness.service.manualPreflight(harness.agent, '部署约定是什么', false)
    const section = remoteSection(result.pack)
    expect(section).toContain('Remote memory (external annotations')
    expect(section).toContain('reference only')
    // 坐标标注（§5.8.5）：带 mh:ws 坐标的条目亮出来源工作区。
    expect(section).toContain('- [third-party] [ws:dsh-plugin-dev] 远端部署约定 — 统一用 docker compose 部署')
    expect(section).toContain('- [third-party] 远端评审流程 — PR 必须两人评审')
    // 不做分数混排：不出现 score/similarity 字样。
    expect(section.toLowerCase()).not.toContain('score')

    // 远端命中不进本地 hits（hits 只含 knowledge id 形态的本地条目）。
    expect(result.hits.every((hit) => hit.id.startsWith('DEC-') || hit.id.startsWith('KNO-'))).toBe(true)

    // 账本：preflight.recorded 带 remote 摘要。
    const ledgerText = await readFile(join(harness.root, 'records', 'ledger.jsonl'), 'utf8')
    expect(ledgerText).toContain('"remote":[{"provider":"third-party","hits":2,"ok":true}]')
  })

  it('caps each provider by inject_max_tokens and notes the truncation', async () => {
    harness = await createHarness()
    const baseUrl = await startSearchServer(TWO_ITEMS)
    harness.hub.config.remote = {
      enabled: true,
      mode: 'hybrid',
      hybrid: { deadline_ms: 2000 },
      providers: [providerConfig(baseUrl, { inject_max_tokens: 30 })] as never,
    }

    const result = await harness.service.manualPreflight(harness.agent, '部署约定是什么', false)
    const section = remoteSection(result.pack)
    expect(section).toContain('- [third-party] [ws:dsh-plugin-dev] 远端部署约定')
    expect(section).not.toContain('远端评审流程') // 第二条被 token 上限截掉
    expect(section).toMatch(/\(\+\d+ more from third-party; run memory_remote_sync to pull candidates\)/)
  })

  it('skips providers with inject_max_tokens 0 without any network call', async () => {
    harness = await createHarness()
    const baseUrl = await startSearchServer(TWO_ITEMS)
    harness.hub.config.remote = {
      enabled: true,
      mode: 'hybrid',
      hybrid: { deadline_ms: 2000 },
      providers: [providerConfig(baseUrl, { inject_max_tokens: 0 })] as never,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await harness.service.manualPreflight(harness.agent, '部署约定是什么', false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.pack).not.toContain('Remote memory')
  })

  it('degrades a failing provider to an unavailable line without losing the healthy one', async () => {
    harness = await createHarness()
    const goodUrl = await startSearchServer(TWO_ITEMS)
    // 第二个 provider 指向必然拒绝的端口。
    const good = providerConfig(goodUrl)
    const bad = providerConfig('http://127.0.0.1:1', { id: 'broken-remote' })
    harness.hub.config.remote = {
      enabled: true,
      mode: 'hybrid',
      hybrid: { deadline_ms: 2000 },
      providers: [good, bad] as never,
    }

    const result = await harness.service.manualPreflight(harness.agent, '部署约定是什么', false)
    const section = remoteSection(result.pack)
    expect(section).toContain('- [third-party] [ws:dsh-plugin-dev] 远端部署约定')
    expect(section).toContain('- [broken-remote] unavailable:')
  })

  it('applies the preflight deadline to slow providers instead of stalling the turn', async () => {
    harness = await createHarness()
    // 远端 1.5s 才响应；死线 300ms → 到点按 unavailable 处理。
    const slowUrl = await startSearchServer(TWO_ITEMS, 1500)
    harness.hub.config.remote = {
      enabled: true,
      mode: 'hybrid',
      hybrid: { deadline_ms: 300 },
      providers: [providerConfig(slowUrl)] as never,
    }

    const startedAt = Date.now()
    const result = await harness.service.manualPreflight(harness.agent, '部署约定是什么', false)
    const elapsed = Date.now() - startedAt
    const section = remoteSection(result.pack)
    expect(section).toContain('- [third-party] unavailable:')
    expect(section).toContain('exceeded 300ms preflight deadline')
    // 死线生效：整体耗时应远小于远端的 1.5s 响应（留 2x 余量防 CI 抖动）。
    expect(elapsed).toBeLessThan(1000)
  })
})
