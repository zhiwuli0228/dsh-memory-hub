import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { ensureDir, pathExists, writeAtomic } from './atomic.js'
import {
  DEFAULT_CONFIG_YAML,
  defaultConfig,
  readConfigFile,
  type MemoryConfig,
} from './config.js'
import { MemoryError } from './errors.js'
import { WriterLock, type LockOwner } from './lock.js'
import { KNOWLEDGE_TYPES, TYPE_PREFIX, type KnowledgeType } from './types.js'

export interface HubOptions {
  root?: string
  readOnly?: boolean
  /** Human-readable reason for an explicit `readOnly: true` (optional). */
  readOnlyReason?: string
  lock?: boolean
  config?: MemoryConfig
  configPath?: string
}

export type ReadOnlySource = 'forced' | 'config' | 'lock'

export function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

export function resolveHubRoot(configured?: string): string {
  const trimmed = configured?.trim()
  if (trimmed !== undefined && trimmed !== '') return resolve(expandHome(trimmed))
  const dshHome = process.env.DSH_HOME?.trim()
  const base = dshHome !== undefined && dshHome !== '' ? resolve(expandHome(dshHome)) : join(homedir(), '.dsh')
  return join(base, 'memory-hub')
}

function describeBlocker(path: string, owner: LockOwner | null): string {
  if (owner === null) return `another writer holds ${path}`
  return `another writer holds ${path} (pid ${owner.pid} on ${owner.host})`
}

export class Hub {
  readonly root: string
  config: MemoryConfig
  configError: string | null = null
  /** Effective write gate: `false` only when this root can be written. */
  readOnly: boolean
  readOnlyReason: string | null = null
  /** Why `readOnly` is set: forced by config, unreadable config.yaml, or a busy writer lock. */
  readOnlySource: ReadOnlySource | null = null
  /** Explicit `readOnly: true`: the only source that also blocks config edits. */
  readonly forcedReadOnly: boolean

  private lock: WriterLock | null = null
  private readonly configSource: string | null = null
  private readonly lockAllowed: boolean

  private constructor(
    root: string,
    config: MemoryConfig,
    forcedReadOnly: boolean,
    readOnlyReason: string | undefined,
    configSource: string | undefined,
    lockAllowed: boolean,
  ) {
    this.root = root
    this.config = config
    this.forcedReadOnly = forcedReadOnly
    this.readOnly = forcedReadOnly
    this.readOnlyReason = forcedReadOnly ? (readOnlyReason ?? 'configured read-only') : null
    this.readOnlySource = forcedReadOnly ? 'forced' : null
    this.configSource = configSource ?? null
    this.lockAllowed = lockAllowed
  }

  static async open(options: HubOptions = {}): Promise<Hub> {
    const isDataRoot = options.config !== undefined
    const root = isDataRoot
      ? resolve(expandHome(options.root ?? ''))
      : resolveHubRoot(options.root)
    if (root === '') {
      throw new MemoryError('INVALID_INPUT', 'hub root must not be empty')
    }

    const forcedReadOnly = options.readOnly === true
    const lockAllowed = options.lock !== false
    const externalConfigPath = options.configPath
    let config: MemoryConfig
    let configSource: string | undefined
    let configError: string | null = null

    if (isDataRoot && options.config !== undefined) {
      config = options.config
      configSource = externalConfigPath ?? undefined
      await ensureLayout(root)
    } else {
      const configPath = join(root, 'config.yaml')
      config = defaultConfig()
      configSource = configPath

      await ensureLayout(root)

      if (!(await pathExists(configPath))) {
        try {
          await writeAtomic(configPath, DEFAULT_CONFIG_YAML)
        } catch (error) {
          configError = `cannot create config.yaml: ${(error as Error).message}`
        }
      }

      try {
        const loaded = await readConfigFile(configPath)
        if (loaded !== null) config = loaded
      } catch (error) {
        configError = (error as Error).message
      }
    }

    const hub = new Hub(
      root,
      config,
      forcedReadOnly,
      options.readOnlyReason,
      configSource,
      lockAllowed,
    )
    hub.configError = configError
    if (configError !== null) {
      hub.markReadOnly('config', configError)
    } else if (!forcedReadOnly && lockAllowed) {
      await hub.acquireLock()
    }

    return hub
  }

  /**
   * Mark this hub read-only. `config` and `lock` degradations are local to this
   * root; `forced` comes from the plugin configuration and applies everywhere.
   */
  markReadOnly(source: Exclude<ReadOnlySource, 'forced'>, reason: string): void {
    this.readOnly = true
    this.readOnlyReason = reason
    this.readOnlySource = source
  }

  /** Whether this hub may write `config.yaml` (atomic file write, not a knowledge write). */
  canWriteConfig(): boolean {
    return !this.forcedReadOnly
  }

  private async acquireLock(): Promise<boolean> {
    const attempt = await WriterLock.acquire(this.lockPath(), this.config.storage.lock_stale_ms)
    if (attempt.lock === null) {
      this.markReadOnly('lock', describeBlocker(this.lockPath(), attempt.owner))
      return false
    }
    this.lock = attempt.lock
    return true
  }

  /**
   * Re-read `config.yaml`. When the previous read-only state came from a bad
   * config, a successful reload also restores write access (and takes the lock
   * that was skipped while the hub was degraded).
   */
  async reloadConfig(): Promise<void> {
    const path = this.configPath()
    if (path === null) {
      this.configError = 'no config source for this hub'
      return
    }
    try {
      const loaded = await readConfigFile(path)
      if (loaded === null) {
        this.configError = 'config.yaml is missing'
        return
      }
      this.config = loaded
      this.configError = null
      if (this.readOnlySource === 'config') await this.recoverWrites()
    } catch (error) {
      this.configError = (error as Error).message
    }
  }

  private async recoverWrites(): Promise<void> {
    if (this.lockAllowed && this.lock === null) {
      const acquired = await this.acquireLock()
      if (!acquired) return
    }
    this.readOnly = this.forcedReadOnly
    this.readOnlyReason = this.forcedReadOnly ? 'configured read-only' : null
    this.readOnlySource = this.forcedReadOnly ? 'forced' : null
  }

  async close(): Promise<void> {
    if (this.lock !== null) {
      await this.lock.release()
      this.lock = null
    }
  }

  configPath(): string | null {
    if (this.configSource !== null) return this.configSource
    return join(this.root, 'config.yaml')
  }

  lockPath(): string {
    return join(this.root, 'records', '.writer.lock')
  }

  ledgerPath(): string {
    return join(this.root, 'records', 'ledger.jsonl')
  }

  sequencesPath(): string {
    return join(this.root, 'records', 'sequences.json')
  }

  /** 派生检索索引（可删除、可重建；不是权威数据）。 */
  indexPath(): string {
    return join(this.root, 'records', 'index.sqlite')
  }

  pendingDir(): string {
    return join(this.root, 'pending')
  }

  pendingArchiveDir(): string {
    return join(this.root, 'pending', 'archive')
  }

  pendingPath(id: string): string {
    return join(this.pendingDir(), `${id}.md`)
  }

  pendingArchivePath(id: string): string {
    return join(this.pendingArchiveDir(), `${id}.md`)
  }

  knowledgeDir(type: KnowledgeType): string {
    return join(this.root, 'knowledge', type)
  }

  knowledgePath(type: KnowledgeType, id: string): string {
    return join(this.knowledgeDir(type), `${id}.md`)
  }

  historyPath(type: KnowledgeType, id: string, version: number): string {
    return join(this.root, 'history', type, `${id}@v${version}.md`)
  }

  displayRoot(): string {
    const home = homedir()
    if (this.root === home) return '~'
    if (this.root.startsWith(home)) {
      const suffix = this.root.slice(home.length).replace(/^[/\\]/, '')
      return `~/${suffix.replace(/\\/g, '/')}`
    }
    return this.root
  }

  prefixFor(type: KnowledgeType): string {
    return TYPE_PREFIX[type]
  }
}

async function ensureLayout(root: string): Promise<void> {
  try {
    await ensureDir(root)
    for (const type of KNOWLEDGE_TYPES) {
      await ensureDir(join(root, 'knowledge', type))
    }
    await ensureDir(join(root, 'pending', 'archive'))
    await ensureDir(join(root, 'history'))
    await ensureDir(join(root, 'records'))
    await ensureDir(join(root, 'index'))
  } catch (error) {
    throw new MemoryError('STORAGE_ERROR', `cannot initialize memory hub at ${root}: ${(error as Error).message}`)
  }
}
