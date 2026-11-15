/**
 * CLI 只读三件套：search / get / inbox（ADR-0010 §6 完整 CLI 面）。
 *
 * 保护四件事：
 * 1. search 走与 MCP memory_search 同一份 service 调用（表格 + --json 两种输出）；
 * 2. get 命中输出标题与正文；未命中退出码 1，不抛栈；
 * 3. inbox 列 pending 候选（与面板 overview 同源），--batch 过滤生效；
 * 4. **不变量**：CLI 没有写路径——approve/commit 只存在于面板与 MCP fail-closed。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Hub } from '../src/hub.js'
import { Ledger } from '../src/ledger.js'
import { KnowledgeStore } from '../src/store.js'
import { runCli, type CliIo } from '../src/cli.js'

let root: string | null = null

afterEach(async () => {
  if (root !== null) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

async function makeRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-cli-test-'))
  return root
}

/** store 直连塞数据：一条 accepted 知识 + 一条 pending 候选（构造 CLI 可见的状态）。 */
async function seed(target: string): Promise<{ acceptedId: string; pendingId: string }> {
  const hub = await Hub.open({ root: target, lock: false })
  const ledger = new Ledger(hub.ledgerPath())
  await ledger.load()
  const store = new KnowledgeStore(hub, ledger)
  await store.load()
  try {
    const accepted = await store.propose(
      {
        operation: 'create',
        type: 'decision',
        scope: 'global',
        title: '写锁租约到期自动降级',
        summary: '写锁租约到期后 hub 自动降级为只读。',
        content: '## 结论\n写锁租约到期自动降级为只读，DSH 持锁时 CLI 只读。\n',
        sourceRefs: ['note:cli test fixture'],
      },
      { taskId: 'TSK-cli-seed' },
    )
    const { record } = await store.commit(accepted.id)
    const pending = await store.propose(
      {
        operation: 'create',
        type: 'knowledge',
        scope: 'global',
        title: 'CLI 收件箱夹具候选',
        summary: '等待人批准的候选。',
        content: '## 结论\n等待批准。\n',
        sourceRefs: ['note:cli test fixture'],
        tags: ['batch:cli-seed'],
      },
      { taskId: 'TSK-cli-seed' },
    )
    return { acceptedId: record.id, pendingId: pending.id }
  } finally {
    store.closeIndex()
    await hub.close()
    await ledger.close()
  }
}

interface Captured { out: string[]; err: string[] }

function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  const io: CliIo = {
    out: (text) => {
      out.push(text)
    },
    err: (text) => {
      err.push(text)
    },
  }
  return { io, out, err }
}

describe('memory-hub CLI 只读三件套', () => {
  it('search 命中已接受知识（表格输出含 id 与标题），--json 输出结构化 hits', async () => {
    const target = await makeRoot()
    const { acceptedId } = await seed(target)

    const plain = capture()
    const code1 = await runCli(['search', '写锁租约', '--root', target], plain.io)
    expect(code1).toBe(0)
    expect(plain.out.join('')).toContain(acceptedId)
    expect(plain.out.join('')).toContain('写锁租约到期自动降级')

    const json = capture()
    const code2 = await runCli(['search', '写锁租约', '--root', target, '--json'], json.io)
    expect(code2).toBe(0)
    const parsed = JSON.parse(json.out.join('')) as { query: string; total: number; hits: Array<{ id: string; snippet: string }> }
    expect(parsed.query).toBe('写锁租约')
    expect(parsed.hits[0]?.id).toBe(acceptedId)
    expect(parsed.hits[0]?.snippet.length).toBeGreaterThan(0)
  })

  it('search 无查询词 → 退出码 2 + usage；--type 过滤不误吞 positional', async () => {
    const target = await makeRoot()
    await seed(target)

    const missing = capture()
    const code1 = await runCli(['search', '--root', target], missing.io)
    expect(code1).toBe(2)
    expect(missing.err.join('')).toContain('usage')

    const filtered = capture()
    const code2 = await runCli(['search', '写锁租约', '--root', target, '--type', 'process', '--json'], filtered.io)
    expect(code2).toBe(0)
    const parsed = JSON.parse(filtered.out.join('')) as { total: number }
    expect(parsed.total).toBe(0) // decision 条目被 --type process 过滤掉
  })

  it('get 命中输出标题与正文；未命中退出码 1 且提示 id', async () => {
    const target = await makeRoot()
    const { acceptedId } = await seed(target)

    const hit = capture()
    const code1 = await runCli(['get', acceptedId, '--root', target], hit.io)
    expect(code1).toBe(0)
    const text = hit.out.join('')
    expect(text).toContain('写锁租约到期自动降级')
    expect(text).toContain('global')
    expect(text).toContain('decision/accepted')
    expect(text).toContain('降级为只读')

    const json = capture()
    const code2 = await runCli(['get', acceptedId, '--root', target, '--json'], json.io)
    expect(code2).toBe(0)
    const parsed = JSON.parse(json.out.join('')) as { metadata: { title?: string }; body: string }
    expect(parsed.metadata.title).toBe('写锁租约到期自动降级')
    expect(parsed.body).toContain('## 结论')

    const miss = capture()
    const code3 = await runCli(['get', 'DEC-999999', '--root', target], miss.io)
    expect(code3).toBe(1)
    expect(miss.err.join('')).toContain('DEC-999999')
  })

  it('inbox 列 pending 候选（pendingTotal/批次/--batch 过滤），不列已接受条目', async () => {
    const target = await makeRoot()
    const { acceptedId, pendingId } = await seed(target)

    const plain = capture()
    const code1 = await runCli(['inbox', '--root', target], plain.io)
    expect(code1).toBe(0)
    const text = plain.out.join('')
    expect(text).toContain('pending 1/1')
    expect(text).toContain(pendingId)
    expect(text).toContain('batch:cli-seed')
    expect(text).not.toContain(acceptedId)

    const batched = capture()
    const code2 = await runCli(['inbox', '--root', target, '--batch', 'cli-seed', '--json'], batched.io)
    expect(code2).toBe(0)
    const parsed = JSON.parse(batched.out.join('')) as { pendingTotal: number; pending: Array<{ id: string }> }
    expect(parsed.pendingTotal).toBe(1)
    expect(parsed.pending.map((item) => item.id)).toEqual([pendingId])

    const empty = capture()
    const code3 = await runCli(['inbox', '--root', target, '--batch', 'other'], empty.io)
    expect(code3).toBe(0)
    expect(empty.out.join('')).toContain('pending 0/1')
  })
})
