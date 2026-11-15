/**
 * 引用即议程 + trigger:'cited'（M5，proposal §5.9.2）。
 *
 * 这些用例保护四件事：
 * 1. `memory_cite` 的新引用会追加 `records/agenda.jsonl`（同一 task 内的去重引用不重复入议程）；
 * 2. `trigger: 'cited'`：条目**恰好达到** `require_citations` 门槛时触发一次 push，
 *    未到门槛不推、超过门槛不再推；
 * 3. maintenance 产出 `distill-hint`（单条目 ≥3 / 同主题 ≥3），只进报告不生成 pending；
 * 4. 议程是派生信号：删掉文件等于重置信号，不炸任何路径。
 */

import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createHarness } from './helpers.js'

let harness: Awaited<ReturnType<typeof createHarness>> | null = null
let server: Server | null = null

afterEach(async () => {
  if (server !== null) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }
  if (harness !== null) {
    await harness.cleanup()
    harness = null
  }
})

async function readAgenda(root: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(join(root, 'records', 'agenda.jsonl'), 'utf8')
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('cite writes the extraction agenda', () => {
  it('appends one agenda line per new citation and skips deduped ones', async () => {
    harness = await createHarness()
    const id = await harness.seed({ title: '部署约定', summary: '被反复使用的决策。' })

    await harness.service.preflightForTurn(harness.agent, 1, '部署约定')
    await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '第一次使用' })
    const afterFirst = await readAgenda(harness.root)
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst[0]).toMatchObject({ knowledgeId: id, version: 1, purpose: '第一次使用' })

    // 同一 task 内的重复引用走去重路径：不产生第二行议程。
    await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '同任务再用' })
    expect(await readAgenda(harness.root)).toHaveLength(1)

    // 新 task 的新引用 → 第二行。
    await harness.service.preflightForTurn(harness.agent, 2, '部署约定')
    await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '第二次任务使用' })
    const afterSecond = await readAgenda(harness.root)
    expect(afterSecond).toHaveLength(2)
    expect(afterSecond[1]).toMatchObject({ knowledgeId: id, purpose: '第二次任务使用' })
  })

  it('keeps working when the agenda file is deleted (derived signal)', async () => {
    harness = await createHarness()
    const id = await harness.seed({ title: '可重建信号', summary: '删了议程也不炸。' })
    await harness.service.preflightForTurn(harness.agent, 1, '可重建信号')
    await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '引用' })
    await rm(join(harness.root, 'records', 'agenda.jsonl'), { force: true })

    // maintenance 读不到议程 → 空信号，不抛错。
    const report = await harness.service.maintenance({ admin: true, coreId: null, apply: 'report' })
    expect(report.issues.some((issue) => issue.code === 'distill-hint')).toBe(false)
  })
})

describe('maintenance distill hints from the agenda', () => {
  it('hints a single entry cited three times and a topic cluster of three', async () => {
    harness = await createHarness()
    const single = await harness.seed({ title: '高频决策', summary: '单条目被引三次。' })
    const cluster = [
      await harness.seed({ title: '集群A-1', summary: '共享主题。', tags: ['deploy'] }),
      await harness.seed({ title: '集群A-2', summary: '共享主题。', tags: ['deploy'] }),
      await harness.seed({ title: '集群A-3', summary: '共享主题。', tags: ['deploy'] }),
    ]

    // 单条目 3 次引用（3 个独立 task）。
    for (const turn of [1, 2, 3]) {
      await harness.service.preflightForTurn(harness.agent, turn, '高频决策')
      await harness.service.cite(harness.agent, { knowledge_id: single, purpose: `使用 ${turn}` })
    }
    // 集群：每条 1 次（3 个独立 task）。
    for (const [index, knowledgeId] of cluster.entries()) {
      await harness.service.preflightForTurn(harness.agent, 10 + index, '集群')
      await harness.service.cite(harness.agent, { knowledge_id: knowledgeId, purpose: '集群使用' })
    }

    const report = await harness.service.maintenance({ admin: true, coreId: null, apply: 'report' })
    const hints = report.issues.filter((issue) => issue.code === 'distill-hint')
    expect(hints.some((issue) => issue.ids.includes(single) && issue.message.includes('3 次'))).toBe(true)
    expect(hints.some((issue) => issue.message.includes('deploy') && cluster.every((id) => issue.ids.includes(id)))).toBe(true)
  })

  it('never turns distill hints into pending proposals', async () => {
    harness = await createHarness()
    const id = await harness.seed({ title: '只提示不提案', summary: '蒸馏提示不生成 pending。' })
    for (const turn of [1, 2, 3]) {
      await harness.service.preflightForTurn(harness.agent, turn, '只提示不提案')
      await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '使用' })
    }
    const report = await harness.service.maintenance({ admin: true, coreId: null, apply: 'propose' })
    expect(report.issues.some((issue) => issue.code === 'distill-hint')).toBe(true)
    // created 里没有"建议蒸馏"类条目——hint 只进报告，避免元条目污染 knowledge/。
    expect(report.created).toHaveLength(0)
  })
})

describe('trigger: cited fires exactly once at the threshold', () => {
  it('pushes when an entry reaches require_citations and stays quiet afterwards', async () => {
    harness = await createHarness()
    const appendBodies: Array<Record<string, unknown>> = []

    server = createServer((request, response) => {
      let raw = ''
      request.on('data', (chunk) => {
        raw += String(chunk)
      })
      request.on('end', () => {
        const reply = (payload: unknown) => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify(payload))
        }
        if (request.url === '/v1/memories') {
          appendBodies.push(JSON.parse(raw === '' ? '{}' : raw) as Record<string, unknown>)
          reply({ id: `srv-${appendBodies.length}` })
        } else {
          response.writeHead(404)
          response.end('{}')
        }
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server!.address()
    if (address === null || typeof address === 'string') throw new Error('no port')

    harness.hub.config.remote = {
      enabled: true,
      mode: 'local-first',
      hybrid: { deadline_ms: 2000 },
      providers: [
        {
          id: 'team-pool',
          kind: 'http-json',
          enabled: true,
          roles: ['mirror'],
          projection: { scopes: ['*'], types: [], exclude_tags: [] },
          feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: false },
          mirror: { trigger: 'cited', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 2 },
          forget: { on_deprecate: false, on_merge: false, max_per_run: 100 },
          inject_max_tokens: 300,
          config: {
            base_url: `http://127.0.0.1:${address.port}`,
            endpoints: {
              append: { method: 'POST', path: '/v1/memories', body: { title: '{{title}}', content: '{{body}}', tags: '{{tags}}', key: '{{idempotency_key}}' } },
            },
            mapping: { id: '$.id' },
            capabilities: ['write.append'],
          },
        },
      ],
    }

    // 两条知识：一条会被引用到门槛，一条永远没人用。
    const cited = await harness.seed({ title: '会被用到的决策', summary: '两次引用后推送。' })
    await harness.seed({ title: '没人用的决策', summary: '留在本地。' })

    // 第 1 次引用：1 < 2，不触发。
    await harness.service.preflightForTurn(harness.agent, 1, '会被用到的决策')
    await harness.service.cite(harness.agent, { knowledge_id: cited, purpose: '第一次' })
    expect(appendBodies).toHaveLength(0)

    // 第 2 次引用：恰好达到门槛 → 触发一次 push。被引条目推出去，没人用的被门槛挡下。
    await harness.service.preflightForTurn(harness.agent, 2, '会被用到的决策')
    await harness.service.cite(harness.agent, { knowledge_id: cited, purpose: '第二次' })
    expect(appendBodies).toHaveLength(1)
    expect(appendBodies[0]).toMatchObject({ title: '会被用到的决策' })

    // 第 3 次引用：超过门槛，不再触发。
    await harness.service.preflightForTurn(harness.agent, 3, '会被用到的决策')
    await harness.service.cite(harness.agent, { knowledge_id: cited, purpose: '第三次' })
    expect(appendBodies).toHaveLength(1)
  })
})
