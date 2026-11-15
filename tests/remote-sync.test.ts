/**
 * 远端同步引擎（RemoteSync）的行为测试：fake adapter + fake host，零网络。
 *
 * 覆盖提案 §5.4 / §5.5 的关键语义：
 * - pull 永远只生成候选，成功才推进游标，重复来源去重；
 * - push 投影过滤 + outbox 重放 + externalIds 台账；
 * - forget 默认只传播 deprecate、merge 默认零传播、只对已镜像条目生效、
 *   max_per_run 截断、无删除能力时记孤儿（不假装成功）、dry-run 零副作用。
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RemoteSync, readRemoteSyncSnapshot, migrateLegacyRemoteState, type RemoteAuditEvent, type RemoteSyncHost } from '../src/remote/sync.js'
import { normalizeProvider } from '../src/remote/registry.js'
import {
  RemoteError,
  type RemoteAdapter,
  type RemoteCapability,
  type RemotePage,
  type RemoteQuery,
  type RemoteRecord,
} from '../src/remote/types.js'
import type { KnowledgeRecord } from '../src/types.js'

/* ------------------------------------------------------------------ */
/* 脚手架                                                              */
/* ------------------------------------------------------------------ */

let dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
  dirs = []
})

async function tempRecordsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dmh-remote-sync-'))
  dirs.push(dir)
  return dir
}

function makeRecord(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'DEC-000001',
    type: 'decision',
    scope: { level: 'global' },
    status: 'accepted',
    version: 1,
    title: '标题',
    summary: '摘要',
    tags: [],
    sourceRefs: [],
    related: [],
    supersedes: [],
    promotedFrom: null,
    appliesTo: { branches: [], versions: [] },
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    supersededBy: null,
    format: 1,
    body: '正文',
    path: 'knowledge/decision/DEC-000001.md',
    extra: {},
    ...overrides,
  }
}

function remoteRecord(overrides: Partial<RemoteRecord> = {}): RemoteRecord {
  return {
    externalId: 'ext-a',
    title: '远端条目',
    summary: '远端摘要',
    body: '远端正文',
    tags: [],
    raw: null,
    ...overrides,
  }
}

interface FakeAdapterOptions {
  capabilities?: RemoteCapability[]
  listItems?: RemoteRecord[]
  failAppendWith?: RemoteError
  failDeleteWith?: RemoteError
}

class FakeAdapter implements RemoteAdapter {
  readonly id = 'fake'
  readonly kind = 'fake'
  readonly caps: ReadonlySet<RemoteCapability>
  readonly listItems: RemoteRecord[]
  failAppendWith: RemoteError | null
  failDeleteWith: RemoteError | null
  readonly appended: Array<{ key: string; title: string; body: string }> = []
  readonly deleted: Array<{ externalId: string; reason: string }> = []

  constructor(options: FakeAdapterOptions = {}) {
    this.caps = new Set<RemoteCapability>(options.capabilities ?? ['read.list', 'write.append', 'write.delete'])
    this.listItems = options.listItems ?? []
    this.failAppendWith = options.failAppendWith ?? null
    this.failDeleteWith = options.failDeleteWith ?? null
  }

  capabilities(): ReadonlySet<RemoteCapability> {
    return this.caps
  }

  async probe(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  async list(_q: RemoteQuery): Promise<RemotePage<RemoteRecord>> {
    return { items: this.listItems }
  }

  async append(rec: RemoteRecord, opts: { idempotencyKey: string }): Promise<{ externalId: string }> {
    if (this.failAppendWith !== null) throw this.failAppendWith
    this.appended.push({ key: opts.idempotencyKey, title: rec.title, body: rec.body })
    return { externalId: `ext-${this.appended.length}` }
  }

  async delete(externalId: string, opts: { reason: string }): Promise<void> {
    if (this.failDeleteWith !== null) throw this.failDeleteWith
    this.deleted.push({ externalId, reason: opts.reason })
  }
}

interface FakeHost {
  host: RemoteSyncHost
  proposals: Array<{ title: string; tags: string[]; sourceRefs: string[]; scope: string }>
  records: KnowledgeRecord[]
  audits: RemoteAuditEvent[]
}

function fakeHost(records: KnowledgeRecord[] = []): FakeHost {
  const proposals: FakeHost['proposals'] = []
  const audits: RemoteAuditEvent[] = []
  return {
    proposals,
    records,
    audits,
    host: {
      proposeCandidate: async (input) => {
        proposals.push({ title: input.title, tags: input.tags, sourceRefs: input.sourceRefs, scope: input.scope })
        return { proposalId: `PRO-${proposals.length.toString().padStart(6, '0')}` }
      },
      allKnowledge: async () => records,
      audit: async (event) => {
        audits.push(event)
      },
    },
  }
}

function settings(overrides: Record<string, unknown> = {}) {
  // 默认投影：global 可分发（与文档示例一致）；空 scopes 意味着什么都不分发，
  // 所以夹具必须显式给投影，否则 push/forget 全部空转。
  return normalizeProvider(
    {
      id: 'fake',
      kind: 'fake',
      roles: ['feed', 'mirror'],
      projection: { scopes: ['global'], types: [], exclude_tags: [] },
      ...overrides,
    },
    0,
  )
}

function engine(options: {
  recordsDir: string
  adapter: RemoteAdapter
  host: RemoteSyncHost
  providerSettings?: ReturnType<typeof settings>
  origin?: { coreId: string | null; workspaceId: string | null; hubKey: string }
  citationCount?: (knowledgeId: string) => number
}): RemoteSync {
  return new RemoteSync({
    providerId: 'fake',
    recordsDir: options.recordsDir,
    host: options.host,
    adapter: options.adapter,
    settings: options.providerSettings ?? settings(),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.citationCount === undefined ? {} : { citationCount: options.citationCount }),
  })
}

/* ------------------------------------------------------------------ */
/* pull                                                               */
/* ------------------------------------------------------------------ */

describe('remote sync engine · pull', () => {
  it('proposes pending candidates from remote records and never commits', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost()
    const adapter = new FakeAdapter({ listItems: [remoteRecord()] })
    const result = await engine({ recordsDir, adapter, host: fake.host }).pull()
    expect(result).toMatchObject({ pulled: 1, proposed: 1, skipped: 0 })
    expect(fake.proposals).toHaveLength(1)
    expect(fake.proposals[0]!.tags).toContain('fake')
    expect(fake.proposals[0]!.sourceRefs[0]).toBe('note:remote:fake:ext-a')
  })

  it('dedupes by external id on the second run', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost()
    const adapter = new FakeAdapter({ listItems: [remoteRecord(), remoteRecord({ externalId: 'ext-b' })] })
    const sync = engine({ recordsDir, adapter, host: fake.host })
    await sync.pull()
    const second = await sync.pull()
    expect(second).toMatchObject({ pulled: 2, proposed: 0, skipped: 2 })
    expect(fake.proposals).toHaveLength(2)
  })

  it('keeps the source when propose fails so the next run retries it', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost()
    let failing = true
    const host: RemoteSyncHost = {
      ...fake.host,
      proposeCandidate: async (input) => {
        if (failing) throw new Error('store busy')
        return fake.host.proposeCandidate(input)
      },
    }
    const adapter = new FakeAdapter({ listItems: [remoteRecord()] })
    const sync = engine({ recordsDir, adapter, host })
    const first = await sync.pull()
    expect(first.proposed).toBe(0)
    expect(first.errors[0]).toContain('store busy')
    failing = false
    const second = await sync.pull()
    expect(second.proposed).toBe(1)
    // 重试全部成功 → lastError 清空（真机验证：挂着旧失败摘要像仍在故障）。
    expect(await readRemoteSyncSnapshot(recordsDir, 'fake')).toMatchObject({ lastError: null })
  })

  it('refuses to run without the feed role', async () => {
    const recordsDir = await tempRecordsDir()
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost().host, providerSettings: settings({ roles: ['mirror'] }) })
    await expect(sync.pull()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

/* ------------------------------------------------------------------ */
/* push                                                               */
/* ------------------------------------------------------------------ */

describe('remote sync engine · push', () => {
  it('mirrors accepted knowledge and records the external id mapping', async () => {
    const recordsDir = await tempRecordsDir()
    const record = makeRecord()
    const fake = fakeHost([record])
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fake.host })
    const result = await sync.push()
    expect(result).toMatchObject({ pushed: 1, outboxed: 0 })
    expect(adapter.appended).toHaveLength(1)
    expect(adapter.appended[0]!.key).toBe('fake:push:DEC-000001:1')
    const status = await sync.status()
    expect(status.mirrored).toBe(1)
  })

  it('applies the projection: empty scopes means nothing is distributed', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost([makeRecord()])
    const adapter = new FakeAdapter()
    const result = await engine({ recordsDir, adapter, host: fake.host, providerSettings: settings({ projection: { scopes: [], types: [], exclude_tags: [] } }) }).push()
    expect(result.pushed).toBe(0)
    expect(adapter.appended).toHaveLength(0)
  })

  it('honours scope patterns, type filters and excluded tags', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [
      makeRecord({ id: 'DEC-1', scope: { level: 'global' } }),
      makeRecord({ id: 'DEC-2', scope: { level: 'domain', id: 'infra' } }),
      makeRecord({ id: 'DEC-3', scope: { level: 'project', workspaceId: 'ws' } }),
      makeRecord({ id: 'CON-1', type: 'constraint', tags: ['local-only'] }),
    ]
    const fake = fakeHost(records)
    const adapter = new FakeAdapter()
    const providerSettings = settings({
      projection: { scopes: ['global', 'domain:*'], types: ['decision'], exclude_tags: ['local-only'] },
    })
    const result = await engine({ recordsDir, adapter, host: fake.host, providerSettings }).push()
    expect(result.pushed).toBe(2)
    // global + domain:infra 通过；project:ws（scope 不匹配）、CON-1（类型 + 排除标签）被挡下。
    expect(adapter.appended.map((entry) => entry.key)).toEqual([
      'fake:push:DEC-1:1',
      'fake:push:DEC-2:1',
    ])
  })

  it('queues failures in the outbox and replays them with the same idempotency key', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost([makeRecord()])
    const adapter = new FakeAdapter({ failAppendWith: new RemoteError('fake', 'unreachable', 'down') })
    const sync = engine({ recordsDir, adapter, host: fake.host })
    const first = await sync.push()
    expect(first).toMatchObject({ pushed: 0, outboxed: 1 })
    expect(await readRemoteSyncSnapshot(recordsDir, 'fake')).toMatchObject({ outboxPending: 1 })

    adapter.failAppendWith = null
    const second = await sync.push()
    expect(second).toMatchObject({ pushed: 1, replayed: 1, outboxed: 0 })
    expect(adapter.appended[0]!.key).toBe('fake:push:DEC-000001:1')
    expect(await readRemoteSyncSnapshot(recordsDir, 'fake')).toMatchObject({ outboxPending: 0, mirrored: 1 })
  })

  it('refuses to run without the mirror role', async () => {
    const recordsDir = await tempRecordsDir()
    const sync = engine({ recordsDir, adapter: new FakeAdapter(), host: fakeHost().host, providerSettings: settings({ roles: ['feed'] }) })
    await expect(sync.push()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

/* ------------------------------------------------------------------ */
/* forget                                                            */
/* ------------------------------------------------------------------ */

describe('remote sync engine · forget', () => {
  it('propagates deprecated mirrored entries via delete with the recorded external id', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [
      makeRecord({ id: 'DEC-1' }),
      makeRecord({ id: 'DEC-2', status: 'accepted' }),
    ]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    // 真实流程：镜像时还是 accepted，作废之后才传播。
    await sync.push()
    records[0]!.status = 'deprecated'
    records[0]!.deprecatedReason = 'outdated'

    const result = await sync.forget()
    expect(result).toMatchObject({ dryRun: false, forgotten: 1, orphans: 0, pending: 0 })
    expect(adapter.deleted).toEqual([{ externalId: 'ext-1', reason: 'outdated' }])
    // 已 forget 的条目不会重复传播。
    const second = await sync.forget()
    expect(second.forgotten).toBe(0)
    expect(adapter.deleted).toHaveLength(1)
  })

  it('does not propagate merges by default, and only when the entry was mirrored', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [
      makeRecord({ id: 'DEC-1', status: 'accepted' }),
      makeRecord({ id: 'DEC-2', status: 'accepted' }),
    ]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    // 两条都已镜像；随后 DEC-2 被"手动移出镜像台账"，模拟从未镜像过的条目。
    await sync.push()
    records[0]!.status = 'superseded'
    records[0]!.supersededBy = 'DEC-9'
    records[1]!.status = 'superseded'
    records[1]!.supersededBy = 'DEC-9'
    const statePath = join(recordsDir, 'remote', 'fake', 'state.json')
    const raw = JSON.parse(await readFile(statePath, 'utf8')) as { pushedIds: string[] }
    raw.pushedIds = ['DEC-1']
    const { writeAtomic } = await import('../src/atomic.js')
    await writeAtomic(statePath, JSON.stringify(raw, null, 2))

    // 默认 on_merge:false → 零传播。
    const none = await sync.forget()
    expect(none.forgotten).toBe(0)
    expect(none.pending).toBe(0)

    const syncOnMerge = engine({
      recordsDir,
      adapter,
      host: fakeHost(records).host,
      providerSettings: settings({ forget: { on_deprecate: true, on_merge: true, max_per_run: 100 } }),
    })
    const result = await syncOnMerge.forget()
    // 只有镜像过的 DEC-1 传播；DEC-2 不产生幽灵 forget。
    expect(result.forgotten).toBe(1)
    expect(adapter.deleted.map((entry) => entry.externalId)).toEqual(['ext-1'])
  })

  it('records an orphan and appends a deprecation marker when the provider cannot delete', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1' })]
    const adapter = new FakeAdapter({ capabilities: ['read.list', 'write.append'] })
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    await sync.push()
    records[0]!.status = 'deprecated'
    records[0]!.deprecatedReason = 'wrong'

    const result = await sync.forget()
    // marker ≠ 删除：计 orphan，不计 forgotten —— 这是"删除是真难的那件事"的诚实形态。
    expect(result.forgotten).toBe(0)
    expect(result.orphans).toBe(1)
    expect(result.items[0]!.action).toBe('marker')
    expect(adapter.appended.some((entry) => entry.title.startsWith('【已作废】'))).toBe(true)
    const orphanRaw = await readFile(join(recordsDir, 'remote', 'fake', 'orphans.jsonl'), 'utf8')
    expect(orphanRaw).toContain('"cause":"unsupported"')
    expect(orphanRaw).toContain('DEC-1')
  })

  it('queues forget for retry when the remote is unreachable, and replays after recovery', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1' })]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    await sync.push()
    records[0]!.status = 'deprecated'

    adapter.failDeleteWith = new RemoteError('fake', 'unreachable', 'network down')
    const failed = await sync.forget()
    expect(failed.forgotten).toBe(0)
    expect(failed.outboxed).toBe(1)
    expect(await readRemoteSyncSnapshot(recordsDir, 'fake')).toMatchObject({ outboxPending: 1 })

    adapter.failDeleteWith = null
    const recovered = await sync.forget()
    expect(recovered.forgotten).toBe(1)
    expect(adapter.deleted).toHaveLength(1)
    expect(await readRemoteSyncSnapshot(recordsDir, 'fake')).toMatchObject({ outboxPending: 0 })
  })

  it('does not retry non-retryable delete failures: they become orphans', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1' })]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    await sync.push()
    records[0]!.status = 'deprecated'

    adapter.failDeleteWith = new RemoteError('fake', 'conflict', 'version mismatch')
    const result = await sync.forget()
    expect(result).toMatchObject({ forgotten: 0, orphans: 1, outboxed: 0 })
    expect(await readRemoteSyncSnapshot(recordsDir, 'fake')).toMatchObject({ outboxPending: 0 })
    const orphanRaw = await readFile(join(recordsDir, 'remote', 'fake', 'orphans.jsonl'), 'utf8')
    expect(orphanRaw).toContain('"cause":"conflict"')
  })

  it('caps each run at max_per_run and leaves the overflow for the next run', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [
      makeRecord({ id: 'DEC-1' }),
      makeRecord({ id: 'DEC-2' }),
      makeRecord({ id: 'DEC-3' }),
    ]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host, providerSettings: settings({ forget: { on_deprecate: true, on_merge: false, max_per_run: 2 } }) })
    await sync.push()
    for (const record of records) {
      record.status = 'deprecated'
      record.deprecatedReason = 'cleanup'
    }

    const first = await sync.forget()
    expect(first).toMatchObject({ forgotten: 2, pending: 1 })
    const second = await sync.forget()
    expect(second).toMatchObject({ forgotten: 1, pending: 0 })
    expect(adapter.deleted).toHaveLength(3)
  })

  it('dry run previews planned actions with zero side effects', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1' })]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    await sync.push()
    records[0]!.status = 'deprecated'
    records[0]!.deprecatedReason = 'stale'

    const before = await readFile(join(recordsDir, 'remote', 'fake', 'state.json'), 'utf8')
    const preview = await sync.forget({ dryRun: true })
    expect(preview.dryRun).toBe(true)
    expect(preview.items).toEqual([
      { knowledgeId: 'DEC-1', externalId: 'ext-1', action: 'delete', detail: 'planned action (dry run)' },
    ])
    expect(adapter.deleted).toHaveLength(0)
    expect(adapter.appended).toHaveLength(1) // 只有 push 那一次
    expect(await readFile(join(recordsDir, 'remote', 'fake', 'state.json'), 'utf8')).toBe(before)
  })

  it('forgets a targeted entry regardless of the switches, but never fakes never-mirrored entries', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [
      makeRecord({ id: 'DEC-1' }),
      makeRecord({ id: 'DEC-2' }),
    ]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    await sync.push() // 两条都已镜像
    records[1]!.status = 'superseded'
    records[1]!.supersededBy = 'DEC-9'

    // 定向 forget 绕过 on_merge:false（真实流程：镜像时还是 accepted，合并后才变 superseded）。
    const targeted = await sync.forget({ knowledgeId: 'DEC-2', reason: 'manual cleanup' })
    expect(targeted.forgotten).toBe(1)
    expect(adapter.deleted.map((entry) => entry.externalId)).toEqual(['ext-2'])

    // 从未镜像过的条目：如实报 skipped，不产生幽灵请求。
    const ghost = await sync.forget({ knowledgeId: 'KNO-999999' })
    expect(ghost.items[0]).toMatchObject({ knowledgeId: 'KNO-999999', action: 'skipped' })
    expect(adapter.deleted).toHaveLength(1)
  })

  it('exposes the sync snapshot without an adapter', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord()]
    const adapter = new FakeAdapter()
    const sync = engine({ recordsDir, adapter, host: fakeHost(records).host })
    await sync.push()
    const snapshot = await readRemoteSyncSnapshot(recordsDir, 'fake')
    expect(snapshot).toMatchObject({ provider: 'fake', mirrored: 1, outboxPending: 0, orphans: 0 })
    // 未同步过的 provider：全空但不报错。
    expect(await readRemoteSyncSnapshot(recordsDir, 'other')).toMatchObject({ provider: 'other', mirrored: 0 })
  })
})

/* ------------------------------------------------------------------ */
/* 坐标编码与作用域还原（§5.8，M4a）                                     */
/* ------------------------------------------------------------------ */

describe('remote coordinate tags & scope restoration', () => {
  it('serializes pyramid coordinates into mh: tags on push and strips forged ones', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [
      makeRecord({
        id: 'DEC-1',
        scope: { level: 'project', workspaceId: 'dsh-memory-hub' },
        // 用户伪造的 mh:from 被剥掉（协议保留前缀）。
        tags: ['运维', 'mh:from:spoofed'],
      }),
    ]
    // append 失败进 outbox → 直接断言 outbox 条目的 tags（FakeAdapter 不透出 tags）。
    const sync = engine({
      recordsDir,
      adapter: new FakeAdapter({ failAppendWith: new RemoteError('fake', 'unreachable', 'offline') }),
      host: fakeHost(records).host,
      // 投影放行 project 作用域，否则条目被滤掉、outbox 为空。
      providerSettings: settings({ projection: { scopes: ['*'], types: [], exclude_tags: [] } }),
      origin: { coreId: 'dsh-plugin-dev', workspaceId: 'dsh-memory-hub', hubKey: 'dsh-memory-hub' },
    })
    await sync.push()
    const outboxRaw = await readFile(join(recordsDir, 'remote', 'fake', 'outbox.jsonl'), 'utf8')
    const entry = JSON.parse(outboxRaw.trim().split('\n')[0]!) as { tags: string[] }
    expect(entry.tags).toEqual([
      '运维',
      'mh:scope:project',
      'mh:type:decision',
      'mh:ws:dsh-memory-hub',
      'mh:core:dsh-plugin-dev',
      'mh:from:dsh-memory-hub',
    ])
  })

  it('emits no mh: tags when coordinate_tags is off', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1', tags: ['运维'] })]
    const sync = engine({
      recordsDir,
      adapter: new FakeAdapter({ failAppendWith: new RemoteError('fake', 'unreachable', 'offline') }),
      host: fakeHost(records).host,
      providerSettings: settings({ mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000, coordinate_tags: false } }),
      origin: { coreId: 'dsh-plugin-dev', workspaceId: 'ws-x', hubKey: 'ws-x' },
    })
    await sync.push()
    const outboxRaw = await readFile(join(recordsDir, 'remote', 'fake', 'outbox.jsonl'), 'utf8')
    const entry = JSON.parse(outboxRaw.trim().split('\n')[0]!) as { tags: string[] }
    expect(entry.tags).toEqual(['运维'])
  })

  it('restores the puller-side scope from mh: coordinates when scope_from_tags is on', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost()
    const adapter = new FakeAdapter({
      listItems: [
        // 坐标指向"dsh-memory-hub"工作区：拉取者恰好注册了同名工作区 → 落到那里。
        remoteRecord({ externalId: 'a', tags: ['mh:scope:project', 'mh:ws:dsh-memory-hub'] }),
        // domain 坐标 → domain:<id>。
        remoteRecord({ externalId: 'b', tags: ['mh:scope:domain', 'mh:domain:frontend'] }),
        // global 坐标 → global。
        remoteRecord({ externalId: 'c', tags: ['mh:scope:global'] }),
      ],
    })
    const sync = engine({
      recordsDir,
      adapter,
      host: fake.host,
      providerSettings: settings({
        feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: true },
      }),
    })
    await sync.pull()
    expect(fake.proposals).toHaveLength(3)
    // 作用域还原：坐标 → 拉取者自己的结构字符串。
    expect(fake.proposals.map((p) => p.scope)).toEqual([
      'project:dsh-memory-hub',
      'domain:frontend',
      'global',
    ])
  })

  it('falls back to feed.scope for missing, broken, or unknown coordinates', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost()
    const adapter = new FakeAdapter({
      listItems: [
        remoteRecord({ externalId: 'no-tags', tags: [] }),
        remoteRecord({ externalId: 'broken', tags: ['mh:scope:project'] }),
        remoteRecord({ externalId: 'unknown', tags: ['mh:scope:galaxy', 'mh:ws:x'] }),
      ],
    })
    const sync = engine({
      recordsDir,
      adapter,
      host: fake.host,
      providerSettings: settings({
        feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: true },
      }),
    })
    await sync.pull()
    expect(fake.proposals).toHaveLength(3)
  })

  it('ignores coordinates entirely when scope_from_tags is off (default)', async () => {
    const recordsDir = await tempRecordsDir()
    const fake = fakeHost()
    const adapter = new FakeAdapter({
      listItems: [remoteRecord({ externalId: 'a', tags: ['mh:scope:project', 'mh:ws:somewhere-else'] })],
    })
    const sync = engine({ recordsDir, adapter, host: fake.host })
    await sync.pull()
    // scope_from_tags 默认 false：坐标被忽略，候选落 feed.scope（默认 global）。
    expect(fake.proposals).toHaveLength(1)
  })
})

describe('remote require_citations gate (§5.9.2)', () => {
  it('pushes only entries cited at least N times and reports the gated count', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1' }), makeRecord({ id: 'DEC-2' }), makeRecord({ id: 'DEC-3' })]
    const adapter = new FakeAdapter()
    const sync = engine({
      recordsDir,
      adapter,
      host: fakeHost(records).host,
      providerSettings: settings({
        mirror: { trigger: 'cited', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 2 },
      }),
      citationCount: (id) => (id === 'DEC-1' ? 3 : id === 'DEC-2' ? 2 : 0),
    })
    const result = await sync.push()
    // DEC-1（3 次）与 DEC-2（2 次）通过门槛；DEC-3（0 次）被挡下。
    expect(result.pushed).toBe(2)
    expect(result.gated).toBe(1)
    expect(adapter.appended).toHaveLength(2)
    expect(adapter.appended.map((appended) => appended.key)).toEqual([
      'fake:push:DEC-1:1',
      'fake:push:DEC-2:1',
    ])
  })

  it('does not query citations at all when the gate is off (default)', async () => {
    const recordsDir = await tempRecordsDir()
    const records = [makeRecord({ id: 'DEC-1' })]
    let queried = 0
    const adapter = new FakeAdapter()
    const sync = engine({
      recordsDir,
      adapter,
      host: fakeHost(records).host,
      citationCount: () => {
        queried += 1
        return 0
      },
    })
    const result = await sync.push()
    expect(result.pushed).toBe(1)
    expect(queried).toBe(0) // require_citations: 0 → 门槛关闭，引用计数一次都不查
  })
})

/* ------------------------------------------------------------------ */
/* 旧腾讯桥状态迁移（proposal §7：一次性接管 pulledIds/pushedIds 游标）    */
/* ------------------------------------------------------------------ */

describe('legacy remote state migration', () => {
  it('takes over the legacy cursor exactly once and keeps the legacy file untouched', async () => {
    const recordsDir = await tempRecordsDir()
    const legacy = {
      lastPullAt: '2026-11-13T16:37:15.603Z',
      lastPushAt: '2026-11-13T10:00:00.000Z',
      outboxPending: 0,
      lastError: null,
      pushedIds: ['DEC-1', 'DEC-2'],
      pulledIds: ['m_1', 'm_2', 'm_3'],
    }
    await writeFile(join(recordsDir, 'tencent-state.json'), JSON.stringify(legacy), 'utf8')

    const first = await migrateLegacyRemoteState(recordsDir, 'tencent')
    expect(first).toEqual({ migrated: true, pulled: 3, pushed: 2 })

    // 新状态接管了游标；旧文件原样保留（文件是权威，迁移只复制不搬运）。
    const state = JSON.parse(
      await readFile(join(recordsDir, 'remote', 'tencent', 'state.json'), 'utf8'),
    ) as { pulledIds: string[]; pushedIds: string[]; lastPullAt: string | null; externalIds: Record<string, string> }
    expect(state.pulledIds).toEqual(['m_1', 'm_2', 'm_3'])
    expect(state.pushedIds).toEqual(['DEC-1', 'DEC-2'])
    expect(state.lastPullAt).toBe('2026-11-13T16:37:15.603Z')
    expect(state.externalIds).toEqual({})
    const legacyAfter = await readFile(join(recordsDir, 'tencent-state.json'), 'utf8')
    expect(legacyAfter).toBe(JSON.stringify(legacy))

    // 幂等：第二次调用不再动已接管的状态。
    const second = await migrateLegacyRemoteState(recordsDir, 'tencent')
    expect(second.migrated).toBe(false)
    expect(second.reason).toBe('new state already exists')
  })

  it('refuses to migrate over an existing new state and reports unparsable legacy files', async () => {
    const recordsDir = await tempRecordsDir()
    // 新状态已存在（引擎已运行过）→ 绝不覆盖。
    await mkdir(join(recordsDir, 'remote', 'tencent'), { recursive: true })
    await writeFile(
      join(recordsDir, 'remote', 'tencent', 'state.json'),
      JSON.stringify({ pulledIds: ['own-cursor'] }),
      'utf8',
    )
    await writeFile(join(recordsDir, 'tencent-state.json'), JSON.stringify({ pulledIds: ['legacy'] }), 'utf8')
    const guarded = await migrateLegacyRemoteState(recordsDir, 'tencent')
    expect(guarded.migrated).toBe(false)
    const untouched = JSON.parse(
      await readFile(join(recordsDir, 'remote', 'tencent', 'state.json'), 'utf8'),
    ) as { pulledIds: string[] }
    expect(untouched.pulledIds).toEqual(['own-cursor'])

    // 旧文件损坏：如实报告失败，新引擎从零开始，不假装迁移成功。
    const broken = await tempRecordsDir()
    await writeFile(join(broken, 'tencent-state.json'), '{not-json', 'utf8')
    const failed = await migrateLegacyRemoteState(broken, 'tencent')
    expect(failed.migrated).toBe(false)
    expect(failed.reason).toContain('unparsable')

    // 无旧文件：静默跳过（全新安装的常态）。
    const fresh = await tempRecordsDir()
    const absent = await migrateLegacyRemoteState(fresh, 'tencent')
    expect(absent).toMatchObject({ migrated: false, reason: 'no legacy state file' })
  })

  it('seeds the migrated cursor so pull does not re-propose already-seen sources', async () => {
    const recordsDir = await tempRecordsDir()
    await writeFile(
      join(recordsDir, 'tencent-state.json'),
      JSON.stringify({ pulledIds: ['m_old'] }),
      'utf8',
    )
    // 引擎的 providerId 是 'fake'，迁移按同一 id 落盘。
    await migrateLegacyRemoteState(recordsDir, 'fake')

    const fake = fakeHost()
    // 旧桥已拉过的 m_old + 一条新来源。
    const adapter = new FakeAdapter({
      listItems: [
        remoteRecord({ externalId: 'm_old', title: '旧', summary: '旧来源' }),
        remoteRecord({ externalId: 'm_new', title: '新', summary: '新来源' }),
      ],
    })
    const pull = await engine({ recordsDir, adapter, host: fake.host }).pull()
    expect(pull).toMatchObject({ pulled: 2, proposed: 1, skipped: 1 }) // 只有新来源生成候选
    expect(fake.proposals[0]!.title).toBe('新')
  })
})
