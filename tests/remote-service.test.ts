/**
 * 远端 provider 在 **service 层**的行为：状态报告、配置热重建、旧配置回归。
 *
 * 这些用例保护三件事：
 * 1. 旧 `tencent:` 配置的行为逐字不变（不因为引入 remote 抽象而改变老用户看到的东西）；
 * 2. 关掉时零网络、零 adapter；
 * 3. 配置改了必须立刻生效，不能等重启。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHarness, type Harness } from './helpers.js'

let harness: Harness | null = null

afterEach(async () => {
  if (harness !== null) {
    await harness.cleanup()
    harness = null
  }
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

type RemoteStatus = {
  enabled: boolean
  mode: string
  providers: Array<{
    id: string
    kind: string
    enabled: boolean
    roles: string[]
    ready: boolean
    error: string | null
    capabilities: string[]
    forget: { on_deprecate: boolean; on_merge: boolean; max_per_run: number }
  }>
  roles: Record<string, string[]>
  validation: { ok: boolean; errors: string[] }
}

function remoteBlock(config: Record<string, unknown>): Record<string, unknown> {
  return (config.remote ?? {}) as Record<string, unknown>
}

describe('remote providers in the memory service', () => {
  it('reports disabled with no providers when nothing is configured', async () => {
    harness = await createHarness()
    const status = harness.service.status(harness.agent).remote as RemoteStatus
    expect(status.enabled).toBe(false)
    expect(status.providers).toEqual([])
    expect(status.validation.ok).toBe(true)
    // 关掉时必须零网络：任何 fetch 都不该发生。
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await harness.service.remoteProbe()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the legacy tencent bridge visible through the new abstraction', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = {
      ...harness.hub.config.tencent,
      enabled: true,
      url: 'http://127.0.0.1:8420',
      api_key_env: 'DMH_TEST_KEY',
    }
    vi.stubEnv('DMH_TEST_KEY', 'sk-test')

    const status = harness.service.status(harness.agent).remote as RemoteStatus
    expect(status.enabled).toBe(true)
    expect(status.mode).toBe('local-first')
    expect(status.providers).toHaveLength(1)
    const provider = status.providers[0]!
    // legacy 段被 desugar 成 feed+mirror，与 V0.7.x 的 pull/push 语义一致。
    expect(provider).toMatchObject({ id: 'tencent', kind: 'tencent', enabled: true, ready: true })
    expect(provider.roles).toEqual(['feed', 'mirror'])
    expect(provider.error).toBeNull()
    // 删除传播默认：作废开、合并关、上限 100。
    expect(provider.forget).toEqual({ on_deprecate: true, on_merge: false, max_per_run: 100 })
    // 能力里明确**没有** write.delete —— 这是治理缺口的可观测形态。
    expect(provider.capabilities).toContain('read.search')
    expect(provider.capabilities).not.toContain('write.delete')
    expect(status.roles).toEqual({ feed: ['tencent'], mirror: ['tencent'], authority: [], index: [] })
  })

  it('surfaces a missing credential as a per-provider diagnostic instead of throwing', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = {
      ...harness.hub.config.tencent,
      enabled: true,
      api_key_env: 'DMH_MISSING_KEY',
    }
    vi.stubEnv('DMH_MISSING_KEY', '')

    const status = harness.service.status(harness.agent).remote as RemoteStatus
    const provider = status.providers[0]!
    expect(provider.ready).toBe(false)
    expect(provider.error).toContain('DMH_MISSING_KEY')
    // 不可用 → 不承担任何角色，但仍在列表里（用户能查到为什么）。
    expect(status.roles.feed).toEqual([])
    expect(status.providers).toHaveLength(1)
  })

  it('honours an explicit remote.providers list over the legacy section', async () => {
    harness = await createHarness()
    // 旧段是 enabled，但新段存在时必须只用新段——否则迁移后旧配置偷偷生效。
    harness.hub.config.tencent = { ...harness.hub.config.tencent, enabled: true }
    ;(harness.hub.config as unknown as Record<string, unknown>).remote = {
      enabled: true,
      mode: 'local-first',
      providers: [
        { id: 'team-a', kind: 'tencent', enabled: true, roles: ['index'], config: { api_key_env: 'DMH_K' } },
      ],
    }
    vi.stubEnv('DMH_K', 'sk-test')

    const status = harness.service.status(harness.agent).remote as RemoteStatus
    expect(status.providers.map((p) => p.id)).toEqual(['team-a'])
    expect(status.providers[0]!.roles).toEqual(['index'])
    expect(status.roles).toEqual({ feed: [], mirror: [], authority: [], index: ['team-a'] })
  })

  it('reports invalid role combinations without dropping the whole remote block', async () => {
    harness = await createHarness()
    ;(harness.hub.config as unknown as Record<string, unknown>).remote = {
      enabled: true,
      mode: 'local-first',
      providers: [{ id: 'a', kind: 'tencent', roles: ['authority'], config: { api_key_env: 'DMH_K' } }],
    }
    vi.stubEnv('DMH_K', 'sk-test')

    const status = harness.service.status(harness.agent).remote as RemoteStatus
    expect(status.validation.ok).toBe(false)
    expect(status.validation.errors.join()).toContain('opt in')
    // 仍然逐 provider 报告，而不是整个 remote 段消失。
    expect(status.providers).toHaveLength(1)
  })

  it('rebuilds adapters after a config reload so role changes take effect immediately', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = { ...harness.hub.config.tencent, enabled: true, api_key_env: 'DMH_K' }
    vi.stubEnv('DMH_K', 'sk-test')

    const before = harness.service.status(harness.agent).remote as RemoteStatus
    expect(before.providers[0]!.id).toBe('tencent')
    // 记住这次构造的 adapter 实例，稍后断言它被丢弃。
    const firstRegistry = (
      harness.service as unknown as { ensureRemoteRegistry?: () => unknown }
    ).ensureRemoteRegistry as (() => unknown) | undefined
    expect(firstRegistry).toBeTypeOf('function')
    const first = firstRegistry!.call(harness.service)

    ;(harness.hub.config as unknown as Record<string, unknown>).remote = {
      enabled: true,
      mode: 'local-first',
      providers: [{ id: 'renamed', kind: 'tencent', roles: ['feed'], config: { api_key_env: 'DMH_K' } }],
    }
    // 模拟 updateConfig 的副作用：重载配置后必须重置注册表。
    ;(
      harness.service as unknown as { resetRemoteRegistry: () => void }
    ).resetRemoteRegistry.call(harness.service)

    const after = harness.service.status(harness.agent).remote as RemoteStatus
    expect(after.providers.map((p) => p.id)).toEqual(['renamed'])
    const second = firstRegistry!.call(harness.service)
    expect(second).not.toBe(first)
  })
})

describe('remote sync and forget via the service', () => {
  it('refuses to sync when remote providers are disabled', async () => {
    harness = await createHarness()
    await expect(harness.service.remoteSync(harness.agent, {})).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    await expect(harness.service.remoteForget(harness.agent, {})).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('previews forget with zero side effects and no network', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = {
      ...harness.hub.config.tencent,
      enabled: true,
      api_key_env: 'DMH_K',
      url: 'http://127.0.0.1:1', // 不可达：dry-run 绝不应发起任何网络请求
    }
    vi.stubEnv('DMH_K', 'sk-test')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const outcome = await harness.service.remoteForget(harness.agent, { dryRun: true })
    expect(outcome.results).toHaveLength(1)
    const entry = outcome.results[0]!
    expect(entry.ok).toBe(true)
    expect(entry.result).toMatchObject({ dryRun: true, forgotten: 0, orphans: 0, pending: 0 })
    // dry-run：无候选、无网络。
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports an unknown provider instead of silently doing nothing', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = { ...harness.hub.config.tencent, enabled: true, api_key_env: 'DMH_K' }
    vi.stubEnv('DMH_K', 'sk-test')

    await expect(harness.service.remoteSync(harness.agent, { provider: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('queues pushes to an unreachable endpoint in the per-provider outbox', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = {
      ...harness.hub.config.tencent,
      enabled: true,
      api_key_env: 'DMH_K',
      url: 'http://127.0.0.1:1',
      timeout_ms: 1000,
    }
    vi.stubEnv('DMH_K', 'sk-test')

    const id = await harness.seed({ title: '要镜像的知识', summary: '全局结论' })
    void id
    const outcome = await harness.service.remoteSync(harness.agent, { direction: 'push' })
    expect(outcome.results).toHaveLength(1)
    const entry = outcome.results[0]!
    expect(entry.ok).toBe(true)
    expect(entry.push).toMatchObject({ pushed: 0 })
    expect((entry.push?.outboxed ?? 0)).toBeGreaterThan(0)
    // outbox 落在 records/remote/tencent/ 下（按 provider 分区，不再与旧 tencent outbox 混放）。
    const snapshot = await harness.service.remoteStatusDetailed()
    expect(snapshot.sync[0]).toMatchObject({ provider: 'tencent' })
    expect((snapshot.sync[0]?.outboxPending ?? 0)).toBeGreaterThan(0)
  })

  it('exposes per-provider sync counts in config() for the panel remote card', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = {
      ...harness.hub.config.tencent,
      enabled: true,
      api_key_env: 'DMH_K',
      url: 'http://127.0.0.1:8420',
    }
    vi.stubEnv('DMH_K', 'sk-test')

    // 面板卡片的数据源：config().remote.providers[].sync。
    // 造一个"已镜像但后来作废"的条目 → pendingForget 必须是 1。
    const id = await harness.seed({ title: '已镜像后作废', summary: '全局结论' })
    const recordsDir = join(harness.root, 'records')
    await mkdir(join(recordsDir, 'remote', 'tencent'), { recursive: true })
    await writeFile(
      join(recordsDir, 'remote', 'tencent', 'state.json'),
      JSON.stringify({ pushedIds: [id], forgottenIds: [], pulledIds: [] }, null, 2),
      'utf8',
    )
    // 通过正式写路径作废（deprecate 提案 → commit），和面板/模型走的是同一条路。
    const proposal = await harness.store.propose(
      {
        operation: 'deprecate',
        type: 'decision',
        scope: 'global',
        title: `[测试] 废弃 ${id}`,
        summary: '面板测试作废',
        target: id,
        expectedVersion: 1,
        reason: '面板测试作废',
        sourceRefs: ['note:test fixture'],
      },
      { taskId: 'TSK-test' },
    )
    await harness.store.commit(proposal.id)

    const config = harness.service.config()
    const remote = remoteBlock(config as unknown as Record<string, unknown>)
    expect(remote.enabled).toBe(true)
    const providers = remote.providers as Array<Record<string, unknown>>
    expect(providers).toHaveLength(1)
    const sync = providers[0]!.sync as Record<string, unknown>
    expect(sync).toMatchObject({ mirrored: 1, pendingForget: 1, outboxPending: 0, orphans: 0 })
    // 面板保存要回传完整 provider 段：连接参数（env 变量名）必须可回显，否则保存即丢失。
    expect(providers[0]!.config).toMatchObject({ api_key_env: 'DMH_K', url: 'http://127.0.0.1:8420' })
    expect(providers[0]!.projection).toMatchObject({ scopes: ['*'] })
  })

  it('persists a remote patch from the panel and rebuilds providers immediately', async () => {
    harness = await createHarness()
    harness.hub.config.tencent = {
      ...harness.hub.config.tencent,
      enabled: true,
      api_key_env: 'DMH_K',
      url: 'http://127.0.0.1:8420',
    }
    vi.stubEnv('DMH_K', 'sk-test')

    // 模拟面板"保存远端设置"：整段替换 remote（与 workspaces patch 同语义）。
    await harness.service.updateConfig({
      remote: {
        enabled: true,
        mode: 'local-first',
        providers: [
          {
            id: 'tencent',
            kind: 'tencent',
            enabled: true,
            roles: ['feed'],
            projection: { scopes: ['*'], types: [], exclude_tags: [] },
            forget: { on_deprecate: false, on_merge: false, max_per_run: 0 },
            config: { api_key_env: 'DMH_K', url: 'http://127.0.0.1:8420' },
          },
        ],
      },
    })

    const config = harness.service.config()
    const remote = remoteBlock(config as unknown as Record<string, unknown>)
    expect(remote.enabled).toBe(true)
    const providers = remote.providers as Array<Record<string, unknown>>
    expect(providers).toHaveLength(1)
    expect(providers[0]).toMatchObject({
      id: 'tencent',
      roles: ['feed'],
      forget: { on_deprecate: false, on_merge: false, max_per_run: 0 },
    })
    // 面板改动必须立刻生效：角色变了，mirror 方向就不该再有 handle。
    const status = harness.service.status(harness.agent).remote as RemoteStatus
    expect(status.providers[0]!.roles).toEqual(['feed'])
    // 写路径必须留痕：config.remote.updated 进账本（JSONL 直接查原文）。
    const ledgerText = await readFile(join(harness.root, 'records', 'ledger.jsonl'), 'utf8')
    expect(ledgerText).toContain('"type":"config.remote.updated"')
    // 持久化：重开 hub 读到的还是新值。
    const yaml = await readFile(join(harness.root, 'config.yaml'), 'utf8')
    expect(yaml).toContain('on_deprecate: false')
  })
})
