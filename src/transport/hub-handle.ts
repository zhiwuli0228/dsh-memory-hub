/**
 * headless transport 共享件：为 MCP / CLI / serve 打开一个 hub（ADR-0010）。
 * `lock: true` = 本进程是普通写者，与 DSH 按既有租约互斥（ADR-0009）；
 * 拿不到锁时 service 以 READ_ONLY 语义诚实降级，不做任何特权。
 */

import { basename, isAbsolute, join, resolve } from 'node:path'
import { Hub } from '../hub.js'
import { Ledger } from '../ledger.js'
import { KnowledgeStore } from '../store.js'
import { MemoryService } from '../service.js'
import { ReflectStateFile } from '../reflect.js'
import type { WorkspaceConfig } from '../config.js'
import type { AgentLike, Context } from '../host.js'

export interface TransportHandle {
  service: MemoryService
  /** 打开的 hub（serve 需要 hub 引用取 config.policy 等）。 */
  hub: Hub
  agent: AgentLike
  dispose: () => Promise<void>
}

export async function openMemoryHubForTransport(options: {
  root: string
  cwd?: string
  /** 覆盖合成的工作区（缺省按 DSH runtime 同款语义：cwd 目录名 = 项目工作区 id）。 */
  workspaces?: WorkspaceConfig[]
}): Promise<TransportHandle> {
  const root = isAbsolute(options.root) ? options.root : resolve(process.cwd(), options.root)
  const hub = await Hub.open({ root, lock: true })
  const ledger = new Ledger(hub.ledgerPath())
  const ledgerState = await ledger.load()
  const store = new KnowledgeStore(hub, ledger)
  await store.load()

  const cwd = options.cwd ?? process.cwd()
  // DSH runtime 的动态工作区语义：目录名 = 项目工作区 id，root = cwd 自身。
  // 不合成的话 resolveWorkspace 得到 null，project:* 永远不可见（只剩 global）。
  const workspaces: WorkspaceConfig[] =
    options.workspaces ?? [{ id: basename(cwd), root: cwd, domains: [], admin: false, enabled: true }]
  const ctx: Context = {
    tools: {
      register: () => () => {},
      get: () => undefined,
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    get: (name: string) => {
      if (name === 'workingDirectory') return ctx.workingDirectory
      if (name === 'tokenMeter') return ctx.tokenMeter
      return undefined
    },
    on: () => () => {},
    effect: () => () => {},
    inject: () => {},
    workingDirectory: {
      defaultDirectory: cwd,
      get: () => cwd,
    },
    tokenMeter: {
      estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message ?? null).length / 3.2)),
    },
  }

  const service = new MemoryService({
    ctx,
    hub,
    store,
    ledger,
    ledgerState,
    workspaces,
    reflectState: new ReflectStateFile(join(root, 'records', 'reflect-state.json')),
  })
  const agent: AgentLike = {
    id: 'memory-hub-transport',
    ctx,
    session: { id: 'memory-hub-transport', seq: 0 },
  }
  return {
    service,
    hub,
    agent,
    dispose: async () => {
      store.closeIndex()
      await hub.close()
      await ledger.close()
    },
  }
}
