import { open, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { ensureDir } from './atomic.js'
import { MemoryError } from './errors.js'
import { nowIso } from './time.js'

interface LockFile {
  pid: number
  host: string
  startedAt: string
  heartbeatAt: string
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

async function readLock(path: string): Promise<LockFile | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<LockFile>
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

/**
 * Single-writer lock for the Hub. A second process degrades to read-only
 * instead of racing the first. Stale locks are only reclaimed when the owning
 * process is demonstrably gone; a live but suspended process keeps its lock.
 */
export class WriterLock {
  private timer: NodeJS.Timeout | null = null

  private constructor(
    private readonly path: string,
    private readonly info: LockFile,
  ) {}

  static async acquire(path: string, staleMs: number): Promise<WriterLock | null> {
    await ensureDir(dirname(path))
    const existing = await readLock(path)
    if (existing !== null) {
      const heartbeatAge = Date.now() - Date.parse(existing.heartbeatAt)
      const dead = !isProcessAlive(existing.pid)
      if (!(dead && heartbeatAge > staleMs)) return null
      await rm(path, { force: true }).catch(() => {})
    }

    const now = nowIso()
    const info: LockFile = {
      pid: process.pid,
      host: hostname(),
      startedAt: now,
      heartbeatAt: now,
    }

    let handle: Awaited<ReturnType<typeof open>>
    try {
      handle = await open(path, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null
      throw new MemoryError('STORAGE_ERROR', `cannot create writer lock ${path}: ${(error as Error).message}`)
    }

    try {
      await handle.writeFile(JSON.stringify(info), 'utf8')
    } finally {
      await handle.close()
    }

    const lock = new WriterLock(path, info)
    lock.startHeartbeat()
    return lock
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
