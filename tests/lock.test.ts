import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.js'
import { LOCK_HEARTBEAT_MS, WriterLock } from '../src/lock.js'
import { sleep } from '../src/time.js'

const STALE_MS = 60_000
const roots: string[] = []

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-lock-unit-'))
  roots.push(root)
  await mkdir(join(root, 'records'), { recursive: true })
  return join(root, 'records', '.writer.lock')
}

/** A pid that is guaranteed not to be running: `kill(pid, 0)` reports ESRCH. */
function deadPid(): number {
  for (let pid = 900_000_000; pid > 900_000_000 - 1_000; pid -= 1) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      // Only ESRCH proves absence. Windows can answer EPERM for a pid that no
      // longer exists, and that case must not be used as the "dead pid" fixture.
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return pid
    }
  }
  throw new Error('cannot find a free pid for the dead-writer test')
}

/**
 * A pid whose liveness cannot be determined (`EPERM`): a system/other-user
 * process that exists but cannot be opened. Returns null when this platform and
 * user can probe everything.
 */
function unknownLivenessPid(): number | null {
  for (const pid of [4, 8, 1, 2]) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return pid
    }
  }
  return null
}

interface LockFileShape {
  pid: number
  host: string
  startedAt: string
  heartbeatAt: string
  token?: string
}

function lockJson(overrides: Partial<LockFileShape> = {}): string {
  const now = new Date().toISOString()
  return JSON.stringify({
    pid: process.pid,
    host: hostname(),
    startedAt: now,
    heartbeatAt: now,
    ...overrides,
  })
}

async function readLockFile(path: string): Promise<LockFileShape> {
  return JSON.parse(await readFile(path, 'utf8')) as LockFileShape
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  }
})

describe('writer lock lease', () => {
  it('creates a lock with an owner token and releases it', async () => {
    const path = await makeRoot()
    const attempt = await WriterLock.acquire(path, STALE_MS)
    expect(attempt.lock).not.toBeNull()
    expect(attempt.reclaimed).toBeNull()
    const lock = attempt.lock!
    try {
      const stored = await readLockFile(path)
      expect(stored.pid).toBe(process.pid)
      expect(stored.token).toBe(lock.owner.token)
      expect(await lock.verifyOwnership()).toBe(true)
    } finally {
      await lock.release()
    }
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps a fresh live lock and reports the blocking owner and lease', async () => {
    const path = await makeRoot()
    const token = 'deadbeefdeadbeef'
    await writeFile(path, lockJson({ token }), 'utf8')
    const attempt = await WriterLock.acquire(path, STALE_MS)
    expect(attempt.lock).toBeNull()
    expect(attempt.reclaimed).toBeNull()
    expect(attempt.owner?.pid).toBe(process.pid)
    expect(attempt.ownerExpiresAt).toBeGreaterThan(Date.now())
    // Still the other writer's file: a blocked acquisition never touches it.
    expect((await readLockFile(path)).token).toBe(token)
  })

  it('reclaims a dead writer immediately without waiting for the lease', async () => {
    const path = await makeRoot()
    // Fresh heartbeat: only the dead pid can justify the takeover.
    await writeFile(path, lockJson({ pid: deadPid(), token: 'deadcafe' }), 'utf8')
    const attempt = await WriterLock.acquire(path, STALE_MS)
    try {
      expect(attempt.reclaimed).toBe('dead-process')
      expect(attempt.lock).not.toBeNull()
    } finally {
      await attempt.lock?.release()
    }
  })

  it('reclaims a hung writer once its heartbeat lease expires', async () => {
    const path = await makeRoot()
    const before = new Date('2020-01-01T00:00:00.000Z').toISOString()
    // pid alive (our own process stands in for the hung DSH process), heartbeat old.
    await writeFile(path, lockJson({ pid: process.pid, startedAt: before, heartbeatAt: before }), 'utf8')
    const attempt = await WriterLock.acquire(path, STALE_MS)
    try {
      expect(attempt.reclaimed).toBe('stale-heartbeat')
      expect(attempt.lock).not.toBeNull()
      expect((await readLockFile(path)).token).toBe(attempt.lock!.owner.token)
    } finally {
      await attempt.lock?.release()
    }
  })

  it('reclaims a lock file written on another host even when the heartbeat is fresh', async () => {
    const path = await makeRoot()
    await writeFile(path, lockJson({ host: 'some-otter-machine' }), 'utf8')
    const attempt = await WriterLock.acquire(path, STALE_MS)
    try {
      expect(attempt.reclaimed).toBe('foreign-host')
      expect(attempt.lock).not.toBeNull()
    } finally {
      await attempt.lock?.release()
    }
  })

  it('treats a version 1 lock without a token as a normal holder', async () => {
    const path = await makeRoot()
    // v0.7 lock files have no token field; a fresh one must still block.
    await writeFile(path, lockJson(), 'utf8')
    const blocked = await WriterLock.acquire(path, STALE_MS)
    expect(blocked.lock).toBeNull()
    expect(blocked.owner?.token).toBeNull()

    // ...and an old one is reclaimable by the lease.
    const old = new Date('2020-01-01T00:00:00.000Z').toISOString()
    await writeFile(path, lockJson({ startedAt: old, heartbeatAt: old }), 'utf8')
    const stolen = await WriterLock.acquire(path, STALE_MS)
    try {
      expect(stolen.reclaimed).toBe('stale-heartbeat')
      expect(stolen.lock?.owner.token).not.toBeNull()
    } finally {
      await stolen.lock?.release()
    }
  })

  it('reclaims a corrupt lock only after its lease', async () => {
    const path = await makeRoot()
    await writeFile(path, 'not json at all', 'utf8')
    const blocked = await WriterLock.acquire(path, STALE_MS)
    expect(blocked.lock).toBeNull()
    expect(blocked.owner).toBeNull()
    expect(blocked.ownerExpiresAt).toBeGreaterThan(Date.now())

    const old = (Date.now() - 10 * STALE_MS) / 1000
    await utimes(path, old, old)
    const stolen = await WriterLock.acquire(path, STALE_MS)
    try {
      expect(stolen.reclaimed).toBe('corrupt')
      expect(stolen.lock).not.toBeNull()
    } finally {
      await stolen.lock?.release()
    }
  })

  it('lets exactly one of two concurrent acquisitions win', async () => {
    const path = await makeRoot()
    const [first, second] = await Promise.all([
      WriterLock.acquire(path, STALE_MS),
      WriterLock.acquire(path, STALE_MS),
    ])
    const winners = [first, second].filter((attempt) => attempt.lock !== null)
    try {
      expect(winners).toHaveLength(1)
      const loser = [first, second].find((attempt) => attempt.lock === null)
      expect(loser?.owner?.token).toBe(winners[0]?.lock?.owner.token)
    } finally {
      await first.lock?.release()
      await second.lock?.release()
    }
  })

  it('refreshes the heartbeat and keeps the same token', async () => {
    const path = await makeRoot()
    const attempt = await WriterLock.acquire(path, STALE_MS, { heartbeatMs: 20 })
    const lock = attempt.lock!
    try {
      const first = await readLockFile(path)
      await sleep(90)
      const second = await readLockFile(path)
      expect(second.heartbeatAt).not.toBe(first.heartbeatAt)
      expect(second.token).toBe(first.token)
      expect(lock.isLost).toBe(false)
    } finally {
      await lock.release()
    }
  })

  it('degrades a writer whose lease was taken over instead of writing over it', async () => {
    const path = await makeRoot()
    const attempt = await WriterLock.acquire(path, STALE_MS, { heartbeatMs: 20 })
    const lock = attempt.lock!
    const intruder = 'a'.repeat(16)
    await writeFile(path, lockJson({ pid: process.pid, token: intruder }), 'utf8')
    try {
      expect(await lock.verifyOwnership()).toBe(false)
      // The next heartbeat notices the takeover and stops refreshing.
      await sleep(120)
      expect(lock.isLost).toBe(true)
      // release() must not delete the new owner's lock.
      await lock.release()
      expect((await readLockFile(path)).token).toBe(intruder)
    } finally {
      await rm(path, { force: true })
    }
  })

  it('keeps a healthy writer alive even with a very short lease', async () => {
    const path = await makeRoot()
    // 1s lease: the heartbeat must scale down with it instead of beating every 15s.
    const attempt = await WriterLock.acquire(path, 1_000)
    const lock = attempt.lock!
    try {
      await sleep(1_800)
      expect(lock.isLost).toBe(false)
      expect(await lock.verifyOwnership()).toBe(true)
      // A rival still cannot take a lease that the owner keeps refreshing.
      const rival = await WriterLock.acquire(path, 1_000)
      expect(rival.lock).toBeNull()
      expect(rival.owner?.token).toBe(lock.owner.token)
    } finally {
      await lock.release()
    }
  })

  it('keeps the default lease many heartbeats long', async () => {
    // A healthy writer must survive a slow disk or a long GC pause: the shipped
    // `storage.lock_stale_ms` has to be far longer than one heartbeat.
    const defaults = defaultConfig()
    expect(defaults.storage.lock_stale_ms / LOCK_HEARTBEAT_MS).toBeGreaterThan(10)
  })

  it('reclaims an unprobeable pid after the short grace, not the full lease', async () => {
    // Windows reports EPERM for some pids that no longer exist, so a crashed
    // writer can be "unknown" rather than provably dead. It must still be
    // recovered in about a minute instead of waiting out a 10-minute lease, while
    // a healthy writer of that shape (fresh heartbeat) keeps its lock.
    const pid = unknownLivenessPid()
    if (pid === null) return
    const path = await makeRoot()
    const staleMs = 10 * 60_000

    await writeFile(
      path,
      lockJson({ pid, heartbeatAt: new Date(Date.now() - 90_000).toISOString() }),
      'utf8',
    )
    const reclaimed = await WriterLock.acquire(path, staleMs)
    expect(reclaimed.reclaimed).toBe('stale-heartbeat')
    expect(reclaimed.lock).not.toBeNull()
    await reclaimed.lock?.release()

    // Fresh heartbeat, same unprobeable pid: still a live writer, do not steal.
    await writeFile(path, lockJson({ pid }), 'utf8')
    const blocked = await WriterLock.acquire(path, staleMs)
    expect(blocked.lock).toBeNull()
    expect(blocked.reclaimed).toBeNull()
    expect(blocked.owner?.pid).toBe(pid)
  })
})
