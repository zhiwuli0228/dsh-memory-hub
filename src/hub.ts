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
import { ensureHubReadme } from './hub-readme.js'
import { WriterLock, observeLock, type LockOwner, type ReclaimCause } from './lock.js'
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

function describeBlocker(path: string, owner: LockOwner | null, expiresAt: number | null): string {
  if (owner === null) return `another writer holds ${path} (unreadable lock file)`
  const lease = expiresAt === null ? '' : `, lease expires at ${new Date(expiresAt).toISOString()}`
  return `another writer holds ${path} (pid ${owner.pid} on ${owner.host}${lease})`
}

/** 写锁诊断：当前是否持锁、谁在挡、上次回收了什么残留锁。 */
export interface LockInfo {
  /** This hub currently owns the writer lock. */
  held: boolean
  /** The writer blocking this hub, when `readOnlySource` is `lock`. */
  owner: LockOwner | null
  /** When the blocking owner's lease expires (epoch ms), if known. */
  expiresAt: number | null
  /** Which leftover lock was reclaimed on the most recent acquisition. */
  reclaimed: ReclaimCause | null
  /**
   * The lock file on disk right now: `missing` means the root is free and the
   * next write will take it; `owned` means this process holds it; `foreign`
   * means another writer does.
   */
  onDisk: 'missing' | 'owned' | 'foreign' | 'corrupt'
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
  private lockOwner: LockOwner | null = null
  private lockOwnerExpiresAt: number | null = null
  private lockReclaimed: ReclaimCause | null = null
  /** Set when another writer took this root over mid-session (lease stolen). */
  private lockLost = false
  private acquiring: Promise<boolean> | null = null
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

    // 目录说明书写在 Hub 根部：初始化时生成，版本过旧时更新；失败不影响打开。
    if (!hub.readOnly) {
      try {
        await ensureHubReadme(hub)
      } catch {
        // 说明书是辅助文件，写不进去也不能挡住 Hub 启动。
      }
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

  /** 写锁诊断（面板 / `memory_status` 用）。 */
  lockInfo(): LockInfo {
    const onDisk = this.forcedReadOnly
      ? 'missing'
      : this.lock !== null
        ? this.lock.state()
        : observeLock(this.lockPath(), this.config.storage.lock_stale_ms).state
    return {
      held: this.lock !== null && onDisk === 'owned',
      owner: this.lock === null ? this.lockOwner : null,
      expiresAt: this.lock !== null ? this.lock.expiresAt : this.lockOwnerExpiresAt,
      reclaimed: this.lockReclaimed,
      onDisk,
    }
  }

  /**
   * Re-derive the in-memory read-only flag from the lock file on disk.
   *
   * A `lock` degradation is a *cached* judgement: when this hub opened, another
   * writer held the root. That judgement goes stale the moment the other process
   * exits, deletes the file, or stops refreshing its heartbeat — and a stale
   * flag is indistinguishable from a real one for `memory_status` and the panel,
   * which is exactly how "pid is gone, lock file is gone, but memory still says
   * locked" happens.
   *
   * This is synchronous so read-only report paths (status / overview / config)
   * can call it without becoming async. It never acquires the lock; a freed root
   * is simply reported writable, and the next write takes the lock through the
   * normal compare-and-set path.
   */
  revalidateLock(): void {
    if (this.forcedReadOnly || this.readOnlySource === 'config' || !this.lockAllowed) return
    try {
      const path = this.lockPath()
      const seen = observeLock(path, this.config.storage.lock_stale_ms, this.lock?.owner.token ?? null)

      if (this.lock !== null) {
        if (seen.state === 'owned') return
        // Our lock file is gone, or it now carries someone else's token. Either
        // way this handle is dead; drop it instead of refreshing it. `detach`
        // stops the heartbeat first so the stale handle cannot rewrite the file.
        this.lock.releaseSync()
        this.lock.detach()
        this.lock = null
        if (seen.state === 'missing') {
          // Nobody claimed the root: it is free again, so do not fake a blocker.
          this.lockLost = false
          this.lockOwner = null
          this.lockOwnerExpiresAt = null
          this.markWritable()
          return
        }
        this.lockLost = true
        this.lockOwner = seen.owner
        this.lockOwnerExpiresAt = seen.expiresAt
        this.markReadOnly('lock', `lost the lease on ${path}; another writer took the root over`)
        return
      }

      if (seen.state === 'missing') {
        this.lockOwner = null
        this.lockOwnerExpiresAt = null
        this.markWritable()
        return
      }
      if (seen.owner === null) {
        // Unreadable and still within its grace period: keep the degradation.
        this.markReadOnly('lock', describeBlocker(path, null, seen.expiresAt))
        return
      }
      this.lockOwner = seen.owner
      this.lockOwnerExpiresAt = seen.expiresAt
      if (seen.reclaimable === null) {
        this.markReadOnly('lock', describeBlocker(path, seen.owner, seen.expiresAt))
        return
      }
      // The blocker is stale (dead pid / expired heartbeat / foreign host): the
      // root is effectively free, so report it writable; the next write reclaims.
      this.markWritable()
    } catch {
      // Diagnostics must never turn a reporting call into a failure.
    }
  }

  /**
   * Whether this root may write *right now*.
   *
   * This is the recovery path for a degraded root: a hub that lost the lock at
   * startup (another DSH process was running) re-tries the acquisition on its
   * next write instead of staying read-only until the next restart. It also
   * fences the lock: if another writer has taken this root over — the lease
   * expired, or the lock file was replaced — this hub drops its stale handle and
   * either takes the lock back (only when it is genuinely free) or reports that
   * writing is no longer allowed.
   */
  async ensureWritable(): Promise<boolean> {
    // Explicit read-only is a hard gate; a broken config.yaml has no writer
    // semantics to offer until it is repaired.
    if (this.forcedReadOnly) return false
    if (this.readOnlySource === 'config') return false

    if (this.lock !== null) {
      const state = this.lock.state()
      if (state === 'owned') {
        if (this.readOnlySource === 'lock') this.markWritable()
        return true
      }
      // Drop the dead handle before re-acquiring. A missing file is not a lost
      // race: the root is simply free again, so re-acquisition succeeds.
      await this.lock.release()
      this.lock = null
      if (state === 'missing') {
        this.lockLost = false
        this.lockOwner = null
        this.lockOwnerExpiresAt = null
        this.markWritable()
      } else {
        this.lockLost = true
        this.markReadOnly('lock', `lost the lease on ${this.lockPath()}; another writer took the root over`)
      }
    }

    if (!this.lockAllowed) return !this.readOnly

    // Coalesce concurrent write attempts so one root does not create a flock of
    // competing acquisitions against the same file.
    if (this.acquiring !== null) return this.acquiring
    const run = this.acquireLock().finally(() => {
      this.acquiring = null
    })
    this.acquiring = run
    return run
  }

  private async acquireLock(): Promise<boolean> {
    const attempt = await WriterLock.acquire(this.lockPath(), this.config.storage.lock_stale_ms)
    this.lockReclaimed = attempt.reclaimed
    if (attempt.lock === null) {
      this.lockOwner = attempt.owner
      this.lockOwnerExpiresAt = attempt.ownerExpiresAt
      const blocker = describeBlocker(this.lockPath(), attempt.owner, attempt.ownerExpiresAt)
      // Keep the "this hub was fenced" signal in the reason a user sees: it is
      // the difference between "someone else is running" and "I was degraded".
      this.markReadOnly('lock', this.lockLost ? `lost the lease; ${blocker}` : blocker)
      return false
    }
    this.lockOwner = null
    this.lockOwnerExpiresAt = null
    this.lock = attempt.lock
    this.lockLost = false
    // Losing the lease mid-session is also a write-stopper: the next write will
    // try to recover, and `memory_status` shows the reason in the meantime.
    attempt.lock.onLost((reason) => {
      this.lock = null
      if (reason === 'missing') {
        // The file disappeared but nobody took it: the root is free, so keep
        // reporting writable and let the next write re-acquire.
        this.lockLost = false
        this.lockOwner = null
        this.lockOwnerExpiresAt = null
        this.markWritable()
        return
      }
      this.lockLost = true
      this.markReadOnly('lock', `lost the lease on ${this.lockPath()}; another writer took the root over`)
    })
    this.markWritable()
    return true
  }

  /** Restore the writable state after `forced`/`config` degradation is gone. */
  private markWritable(): void {
    if (this.forcedReadOnly) return
    this.readOnly = false
    this.readOnlyReason = null
    this.readOnlySource = null
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
    this.markWritable()
    if (!this.lockAllowed) return
    if (this.lock === null) await this.acquireLock()
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
  } catch (error) {
    throw new MemoryError('STORAGE_ERROR', `cannot initialize memory hub at ${root}: ${(error as Error).message}`)
  }
}
