import { open, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { ensureDir } from './atomic.js'
import { MemoryError } from './errors.js'
import { nowIso } from './time.js'

export interface LockOwner {
  pid: number
  host: string
  startedAt: string
  heartbeatAt: string
}

export interface LockAttempt {
  /** Non-null when this process now owns the lock. */
  lock: WriterLock | null
  /** The holder that blocked the acquisition, for diagnostics. */
  owner: LockOwner | null
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function readLock(path: string): Promise<LockOwner | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<LockOwner>
    if (typeof parsed.pid !== 'number' || typeof parsed.heartbeatAt !== 'string') return null
    return {
      pid: parsed.pid,
      host: typeof parsed.host === 'string' ? parsed.host : 'unknown',
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : parsed.heartbeatAt,
      heartbeatAt: parsed.heartbeatAt,
    }
  } catch {
    return null
  }
}

function sameHost(host: string): boolean {
  // Hostnames are case-insensitive on Windows and DNS; a lock written elsewhere
  // cannot be a live writer on this machine.
  return host.toLowerCase() === hostname().toLowerCase()
}

/**
 * Single-writer lock for one hub root. A second writer degrades *that root* to
 * read-only instead of racing the first; every other hub keeps writing.
 *
 * A lock is only reclaimed when it demonstrably cannot belong to a live writer:
 * - it was written on another host (copied hub directory, shared/roaming profile), or
 * - the recorded process is gone and its heartbeat is older than `staleMs`.
 *
 * A live process keeps its lock even when suspended, by design: reclaiming it
 * would allow two writers on the same records.
 */
export class WriterLock {
  private timer: NodeJS.Timeout | null = null

  private constructor(
    private readonly path: string,
    private readonly info: LockOwner,
  ) {}

  static async acquire(path: string, staleMs: number): Promise<LockAttempt> {
    await ensureDir(dirname(path))
    const existing = await readLock(path)
    if (existing !== null) {
      const heartbeatAge = Date.now() - Date.parse(existing.heartbeatAt)
      const foreignHost = !sameHost(existing.host)
      const dead = !isProcessAlive(existing.pid)
      const reclaimable = foreignHost || (dead && heartbeatAge > staleMs)
      if (!reclaimable) return { lock: null, owner: existing }
      await rm(path, { force: true }).catch(() => {})
    }

    const now = nowIso()
    const info: LockOwner = {
      pid: process.pid,
      host: hostname(),
      startedAt: now,
      heartbeatAt: now,
    }

    let handle: Awaited<ReturnType<typeof open>>
    try {
      handle = await open(path, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return { lock: null, owner: await readLock(path) }
      }
      throw new MemoryError('STORAGE_ERROR', `cannot create writer lock ${path}: ${(error as Error).message}`)
    }

    try {
      await handle.writeFile(JSON.stringify(info), 'utf8')
    } finally {
      await handle.close()
    }

    const lock = new WriterLock(path, info)
    lock.startHeartbeat()
    return { lock, owner: null }
  }

  private startHeartbeat(): void {
    this.timer = setInterval(() => {
      this.info.heartbeatAt = nowIso()
      void writeFile(this.path, JSON.stringify(this.info), 'utf8').catch(() => {})
    }, 15_000)
    this.timer.unref?.()
  }

  async release(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    const current = await readLock(this.path)
    if (current?.pid !== this.info.pid) return
    await rm(this.path, { force: true }).catch(() => {})
  }
}
