import { readFileSync, rmSync, statSync } from 'node:fs'
import { open, readFile, rename, rm, stat, type FileHandle } from 'node:fs/promises'
import { hostname } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { ensureDir, writeAtomic } from './atomic.js'
import { MemoryError } from './errors.js'
import { randomHex } from './ids.js'
import { nowIso } from './time.js'

/** 心跳间隔；租约到期时间由心跳 + `storage.lock_stale_ms` 决定。 */
export const LOCK_HEARTBEAT_MS = 15_000

/** 锁文件格式版本；v1（无 `token`）仍可读，用于回收旧锁。 */
export const LOCK_FORMAT_VERSION = 2

export interface LockOwner {
  pid: number
  host: string
  startedAt: string
  heartbeatAt: string
  /** 每次成功获取锁生成的唯一令牌；v1 旧锁没有该字段。 */
  token: string | null
}

/**
 * 为什么可以回收一把残留锁。全部都是“确定原写者已经不在写”的判定，
 * 而不是“它看起来很久没动了”的猜测：
 * - `foreign-host`：锁写在别的机器上（跨机拷贝、漫游/同步目录），本机不可能是它的写者；
 * - `dead-process`：记录的 pid 在本机不存在，原写者已经退出；
 * - `stale-heartbeat`：本机 pid 仍存在，但心跳已经超过租约（pid 被复用、或原写者已冻结到租约之外）；
 * - `corrupt`：锁文件读不出合法 JSON，且文件本身超过租约未被改写。
 */
export type ReclaimCause = 'foreign-host' | 'dead-process' | 'stale-heartbeat' | 'corrupt'

/**
 * Why this writer no longer owns the lock. `foreign` = another writer took it
 * over (this root is read-only for us); `missing` = the lock file disappeared but
 * nobody claimed it (the root is free, so the next write may re-acquire).
 */
export type LostReason = 'foreign' | 'missing'

export interface LockAttempt {
  /** Non-null when this process now owns the lock. */
  lock: WriterLock | null
  /** The holder that blocked the acquisition, for diagnostics. */
  owner: LockOwner | null
  /** Which leftover lock this attempt reclaimed, if any. */
  reclaimed: ReclaimCause | null
  /** When the blocking holder's lease expires (epoch ms), for diagnostics. */
  ownerExpiresAt: number | null
}

type LockSnapshot =
  | { kind: 'missing' }
  | { kind: 'ok'; owner: LockOwner; mtimeMs: number }
  | { kind: 'corrupt'; mtimeMs: number }

/**
 * What the lock file looks like *right now*, cheaply and synchronously.
 *
 * `state` answers the question a cached in-memory flag cannot: is the file
 * still there at all? `missing` and `foreign` must not be conflated — a vanished
 * lock means the root is free and this process may simply take it, while a
 * foreign lock means someone else is writing.
 */
export interface LockObservation {
  state: 'missing' | 'owned' | 'foreign' | 'corrupt'
  owner: LockOwner | null
  /** When the current holder's lease expires (epoch ms), if known. */
  expiresAt: number | null
  /** Why this lock may be taken over right now, or null while it is live. */
  reclaimable: ReclaimCause | null
}

function snapshotSync(path: string): LockSnapshot {
  let raw: string
  let mtimeMs: number
  try {
    mtimeMs = statSync(path).mtimeMs
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'corrupt', mtimeMs: Date.now() }
  }
  const owner = parseOwner(raw)
  return owner === null ? { kind: 'corrupt', mtimeMs } : { kind: 'ok', owner, mtimeMs }
}

/**
 * Observe the lock file without acquiring anything.
 *
 * Used to keep the in-memory read-only flag honest: a Hub that degraded because
 * of a busy lock must notice when that lock file is released, deleted, or goes
 * stale, otherwise `memory_status` and the panel keep reporting read-only even
 * though the root is writable again.
 */
export function observeLock(path: string, staleMs: number, token: string | null = null): LockObservation {
  const snapshot = snapshotSync(path)
  if (snapshot.kind === 'missing') {
    return { state: 'missing', owner: null, expiresAt: null, reclaimable: null }
  }
  if (snapshot.kind === 'corrupt') {
    return {
      state: 'corrupt',
      owner: null,
      expiresAt: ownerExpiresAt(snapshot, staleMs),
      reclaimable: decideReclaim(snapshot, staleMs, Date.now()),
    }
  }
  const owned = token !== null && snapshot.owner.token === token
  return {
    state: owned ? 'owned' : 'foreign',
    owner: snapshot.owner,
    expiresAt: ownerExpiresAt(snapshot, staleMs),
    reclaimable: decideReclaim(snapshot, staleMs, Date.now()),
  }
}

/**
 * How confident we are that the recorded pid is still running.
 *
 * `unknown` is not pedantry: on Windows `process.kill(pid, 0)` reports `EPERM`
 * for some pids that no longer exist (observed on a real machine: a dead writer's
 * pid gave `EPERM` while `tasklist` reported no such process), and it is also the
 * answer for a *live* process owned by another user. Neither case justifies
 * claiming the writer is alive, so the heartbeat decides.
 */
type Liveness = 'alive' | 'dead' | 'unknown'
/**
 * Grace period for `unknown` liveness: long enough that a healthy writer running
 * as another user (heartbeat every 15s) keeps refreshing and is never preempted,
 * short enough that a crashed writer whose pid cannot be probed is recovered in
 * about a minute instead of the full lease.
 */
const UNKNOWN_LIVENESS_GRACE_MS = 60_000

function liveness(pid: number): Liveness {
  if (!Number.isInteger(pid) || pid <= 0) return 'dead'
  if (pid === process.pid) return 'alive'
  try {
    process.kill(pid, 0)
    return 'alive'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // Only ESRCH proves the process is gone.
    if (code === 'ESRCH') return 'dead'
    // POSIX EPERM = exists but not ours; Windows EPERM = cannot open, which may
    // mean "gone". Treat both as unknown and let the heartbeat arbitrate.
    return 'unknown'
  }
}

function isProcessAlive(pid: number): boolean {
  return liveness(pid) === 'alive'
}

function sameHost(host: string): boolean {
  // Hostnames are case-insensitive on Windows and DNS; a lock written elsewhere
  // cannot be a live writer on this machine.
  return host.toLowerCase() === hostname().toLowerCase()
}

function parseOwner(raw: string): LockOwner | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LockOwner>
    if (typeof parsed.pid !== 'number' || !Number.isInteger(parsed.pid) || parsed.pid <= 0) return null
    if (typeof parsed.heartbeatAt !== 'string' || Number.isNaN(Date.parse(parsed.heartbeatAt))) return null
    return {
      pid: parsed.pid,
      host: typeof parsed.host === 'string' ? parsed.host : 'unknown',
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : parsed.heartbeatAt,
      heartbeatAt: parsed.heartbeatAt,
      token: typeof parsed.token === 'string' && parsed.token !== '' ? parsed.token : null,
    }
  } catch {
    return null
  }
}

/**
 * Read one snapshot of the lock file. A missing file and an unreadable file are
 * different states: the first can be claimed directly, the second is only
 * reclaimed after its lease.
 */
async function readSnapshot(path: string): Promise<LockSnapshot> {
  let raw: string
  let mtimeMs: number
  try {
    const info = await stat(path)
    mtimeMs = info.mtimeMs
    raw = await readFile(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { kind: 'missing' }
    // Permission or transient I/O failures look like a lock we cannot judge:
    // treat it as corrupt with a fresh timestamp so it is not stolen blindly.
    return { kind: 'corrupt', mtimeMs: Date.now() }
  }
  const owner = parseOwner(raw)
  return owner === null ? { kind: 'corrupt', mtimeMs } : { kind: 'ok', owner, mtimeMs }
}

/**
 * The holder's last proof of life. The heartbeat is the contract: a writer
 * rewrites `heartbeatAt` every {@link LOCK_HEARTBEAT_MS}, so an old heartbeat
 * means the writer stopped running its timer (frozen, stopped, or blocked).
 * File mtime is deliberately *not* used here: a copied, synced, or checked-out
 * lock file has a fresh mtime but is not a live writer.
 */
function lastSignalMs(owner: LockOwner): number {
  return Date.parse(owner.heartbeatAt)
}

function decideReclaim(snapshot: LockSnapshot, staleMs: number, now: number): ReclaimCause | null {
  if (snapshot.kind === 'missing') return null
  if (snapshot.kind === 'corrupt') return now - snapshot.mtimeMs > staleMs ? 'corrupt' : null
  if (!sameHost(snapshot.owner.host)) return 'foreign-host'
  // A pid that provably does not exist cannot be writing; no need to wait out
  // the lease. This is what turns a crashed writer into an immediate recovery.
  const state = liveness(snapshot.owner.pid)
  if (state === 'dead') return 'dead-process'
  const age = now - lastSignalMs(snapshot.owner)
  if (state === 'alive') {
    // Same-machine pid reuse is indistinguishable from a suspended writer, so the
    // lease is the only safe tie-breaker. Ownership is fenced on every write, so a
    // resumed writer that lost its lease degrades to read-only instead of
    // double-writing.
    return age > staleMs ? 'stale-heartbeat' : null
  }
  // Unknown liveness (Windows cannot open the pid, or the process belongs to
  // another user). A healthy writer of any owner keeps its heartbeat fresh, so a
  // short grace is enough to tell "dead but unprobable" apart from "alive".
  return age > Math.min(staleMs, UNKNOWN_LIVENESS_GRACE_MS) ? 'stale-heartbeat' : null
}

function ownerExpiresAt(snapshot: LockSnapshot, staleMs: number): number | null {
  if (snapshot.kind === 'missing') return null
  if (snapshot.kind === 'corrupt') return snapshot.mtimeMs + staleMs
  return lastSignalMs(snapshot.owner) + staleMs
}

function describeSnapshot(snapshot: LockSnapshot): LockOwner | null {
  return snapshot.kind === 'ok' ? snapshot.owner : null
}

/**
 * Steal a lock with compare-and-swap semantics: rename it aside, re-read the
 * renamed copy, and only delete it when it is still the exact stale lock we
 * judged. If another writer refreshed or replaced it in the meantime, put it
 * back. Rename is atomic, so two reclaimers cannot both win the same file.
 */
async function reclaim(path: string, expected: LockSnapshot): Promise<boolean> {
  const temp = join(dirname(path), `.${basename(path)}.reclaim.${process.pid}.${randomHex(4)}`)
  try {
    await rename(path, temp)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    return false
  }

  const renamed = await readSnapshot(temp)
  const unchanged =
    expected.kind === 'corrupt'
      ? renamed.kind === 'corrupt'
      : expected.kind === 'ok' &&
        renamed.kind === 'ok' &&
        renamed.owner.token === expected.owner.token &&
        renamed.owner.heartbeatAt === expected.owner.heartbeatAt

  if (!unchanged) {
    // Someone refreshed or replaced the lock while we were judging it. Put our
    // copy back only if the path is still free: `rename` would silently
    // overwrite a new writer's lock, so create it exclusively instead.
    try {
      const raw = await readFile(temp, 'utf8')
      const handle = await open(path, 'wx')
      try {
        await handle.writeFile(raw, 'utf8')
      } finally {
        await handle.close()
      }
    } catch {
      // The path is taken again (or unreadable): our copy is the older duplicate.
    }
    await rm(temp, { force: true }).catch(() => {})
    return false
  }

  await rm(temp, { force: true }).catch(() => {})
  return true
}

/** Locks currently held by this process; the exit hook releases them synchronously. */
const activeLocks = new Set<WriterLock>()
let exitHookInstalled = false

function installExitHook(): void {
  if (exitHookInstalled) return
  exitHookInstalled = true
  // A normal shutdown (including `process.exit`) should not leave a lock behind.
  // A hard crash still cannot run this, which is what the lease is for.
  process.once('exit', () => {
    for (const lock of [...activeLocks]) lock.releaseSync()
  })
}

/**
 * Single-writer lock for one hub root. A second writer degrades *that root* to
 * read-only instead of racing the first; every other hub keeps writing.
 *
 * The lock is a **lease**, not a permanent ownership flag. A holder refreshes
 * `heartbeatAt` every {@link LOCK_HEARTBEAT_MS}; other writers may take the lock
 * over once the lease (`storage.lock_stale_ms`) has expired, or immediately when
 * the recorded process is gone. Because stealing is possible, ownership is
 * *fenced*: every write re-checks that the lock file still carries this
 * writer's token, and a writer whose lease was stolen degrades to read-only
 * rather than writing alongside the new owner.
 */
export class WriterLock {
  private timer: NodeJS.Timeout | null = null
  private lost = false
  private releasing = false
  private onLostCallback: ((reason: LostReason) => void) | null = null

  private constructor(
    private readonly path: string,
    private readonly info: LockOwner,
    private readonly staleMs: number,
    private readonly heartbeatMs: number,
  ) {
    activeLocks.add(this)
    installExitHook()
    this.startHeartbeat()
  }

  static async acquire(
    path: string,
    staleMs: number,
    options: { heartbeatMs?: number } = {},
  ): Promise<LockAttempt> {
    await ensureDir(dirname(path))
    // Beat at least four times per lease: a user who lowers
    // `storage.lock_stale_ms` below the default heartbeat interval must not
    // create a lock that expires between its own beats.
    const heartbeatMs = options.heartbeatMs ?? Math.min(LOCK_HEARTBEAT_MS, Math.max(250, Math.floor(staleMs / 4)))

    let reclaimed: ReclaimCause | null = null
    // Bounded retry: a lost race means someone else created or refreshed the
    // lock; re-read and report it instead of spinning.
    for (let round = 0; round < 4; round += 1) {
      const snapshot = await readSnapshot(path)
      if (snapshot.kind === 'missing') {
        const created = await WriterLock.create(path, staleMs, heartbeatMs, reclaimed)
        if (created !== null) return created
        continue
      }

      const cause = decideReclaim(snapshot, staleMs, Date.now())
      if (cause === null) {
        return {
          lock: null,
          owner: describeSnapshot(snapshot),
          reclaimed,
          ownerExpiresAt: ownerExpiresAt(snapshot, staleMs),
        }
      }
      if (!(await reclaim(path, snapshot))) continue
      reclaimed = cause
    }

    const final = await readSnapshot(path)
    return {
      lock: null,
      owner: describeSnapshot(final),
      reclaimed,
      ownerExpiresAt: ownerExpiresAt(final, staleMs),
    }
  }

  private static async create(
    path: string,
    staleMs: number,
    heartbeatMs: number,
    reclaimed: ReclaimCause | null,
  ): Promise<LockAttempt | null> {
    const now = nowIso()
    const info: LockOwner = {
      pid: process.pid,
      host: hostname(),
      startedAt: now,
      heartbeatAt: now,
      token: randomHex(8),
    }

    let handle: FileHandle
    try {
      handle = await open(path, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null
      throw new MemoryError('STORAGE_ERROR', `cannot create writer lock ${path}: ${(error as Error).message}`)
    }

    try {
      await handle.writeFile(serialize(info), 'utf8')
    } finally {
      await handle.close()
    }

    // Close the "two processes both created it" window: only the writer whose
    // token is actually in the file may keep the lock.
    const check = await readSnapshot(path)
    if (check.kind !== 'ok' || check.owner.token !== info.token) return null

    const lock = new WriterLock(path, info, staleMs, heartbeatMs)
    return { lock, owner: null, reclaimed, ownerExpiresAt: lock.expiresAt }
  }

  /** 租约到期时间（epoch ms）；超过它，其他写者可以接管。 */
  get expiresAt(): number {
    return Date.parse(this.info.heartbeatAt) + this.staleMs
  }

  get owner(): Readonly<LockOwner> {
    return this.info
  }

  /** 锁是否已丢失（被其他写者按租约接管，或文件被删除）。 */
  get isLost(): boolean {
    return this.lost
  }

  /** 注册“锁已丢失”回调；`reason` 区分“被别人接管”和“文件被删”。 */
  onLost(callback: (reason: LostReason) => void): void {
    this.onLostCallback = callback
  }

  /**
   * Current relationship between this writer and the lock file.
   *
   * `missing` is deliberately separate from `foreign`: a lock file that was
   * deleted (manual cleanup, or the old owner released it) leaves the root free,
   * so this process may take it again; a `foreign` file means somebody else is
   * the writer now and this process must not write.
   */
  state(): 'owned' | 'missing' | 'foreign' | 'corrupt' {
    if (this.lost) return 'missing'
    return observeLock(this.path, this.staleMs, this.info.token).state
  }

  /**
   * Fencing check: the lock file must still carry this writer's token. Called
   * before every write, so a writer that lost its lease stops writing instead
   * of racing the new owner.
   */
  async verifyOwnership(): Promise<boolean> {
    return this.state() === 'owned'
  }

  private startHeartbeat(): void {
    this.timer = setInterval(() => {
      void this.beat()
    }, this.heartbeatMs)
    this.timer.unref?.()
  }

  private async beat(): Promise<void> {
    if (this.lost || this.releasing) return
    try {
      const state = this.state()
      if (state === 'foreign' || state === 'corrupt') {
        // Never refresh someone else's lock: a stolen lock means we are no
        // longer the writer, and overwriting it would flip ownership silently.
        this.markLost('foreign')
        return
      }
      if (state === 'missing') {
        // The file vanished. Rewriting it would be a blind overwrite if another
        // writer created one in the meantime, so stop and let the next write
        // re-acquire through the normal compare-and-set path.
        this.markLost('missing')
        return
      }
      this.info.heartbeatAt = nowIso()
      await writeAtomic(this.path, serialize(this.info))
    } catch {
      // A transient write failure is not proof that the lock was lost; the next
      // beat retries, and the lease keeps the window bounded.
    }
  }

  private markLost(reason: LostReason): void {
    if (this.lost) return
    this.lost = true
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    activeLocks.delete(this)
    try {
      this.onLostCallback?.(reason)
    } catch {
      // A broken callback must not turn a lost lock into a crashing process.
    }
  }

  /**
   * Stop tracking this handle without deciding who owns the file.
   *
   * Used when a caller has already observed the lock file and knows this handle
   * is stale: keeping the heartbeat timer alive would let a dead handle keep
   * refreshing a file it no longer owns (or would have refreshed).
   */
  detach(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.lost = true
    activeLocks.delete(this)
  }

  async release(): Promise<void> {
    this.releasing = true
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    activeLocks.delete(this)
    if (this.lost) return
    // Only delete the lock while it is still ours: a lease that was already
    // taken over belongs to the new writer.
    if (!(await this.verifyOwnership())) return
    await rm(this.path, { force: true }).catch(() => {})
  }

  /** Synchronous best-effort release for the process exit hook. */
  releaseSync(): void {
    if (this.lost) return
    try {
      const owner = parseOwner(readFileSync(this.path, 'utf8'))
      if (owner === null || owner.token !== this.info.token || owner.pid !== this.info.pid) return
      rmSync(this.path, { force: true })
    } catch {
      // Missing or unreadable lock: nothing safe to remove.
    }
  }
}

function serialize(info: LockOwner): string {
  return JSON.stringify({ v: LOCK_FORMAT_VERSION, ...info })
}
