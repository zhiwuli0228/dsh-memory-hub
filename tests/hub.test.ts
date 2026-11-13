import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Hub, resolveHubRoot } from '../src/hub.js'

function liveLock(host: string): string {
  const now = new Date().toISOString()
  return JSON.stringify({ pid: process.pid, host, startedAt: now, heartbeatAt: now })
}

/** A pid that is guaranteed not to be running: `kill(pid, 0)` reports ESRCH. */
function deadPid(): number {
  for (let pid = 900_000_000; pid > 900_000_000 - 1_000; pid -= 1) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      // EPERM is not proof of absence (Windows reports it for some dead pids),
      // so only ESRCH may be used as the "this writer is gone" fixture.
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return pid
    }
  }
  throw new Error('cannot find a free pid for the dead-writer test')
}

describe('hub', () => {
  it('creates the layout and a default config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-layout-'))
    const hub = await Hub.open({ root, lock: false })
    try {
      const config = await readFile(join(root, 'config.yaml'), 'utf8')
      expect(config).toContain('version: 1')
      expect(config).toContain('workspaces: []')
      expect(hub.readOnly).toBe(false)
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('degrades a second writer to read-only and recovers after release', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-lock-'))
    const first = await Hub.open({ root })
    const second = await Hub.open({ root })
    try {
      expect(first.readOnly).toBe(false)
      expect(second.readOnly).toBe(true)
      expect(second.readOnlySource).toBe('lock')
      expect(second.readOnlyReason).toContain('another writer')
      expect(second.readOnlyReason).toContain('.writer.lock')
      expect(second.canWriteConfig()).toBe(true)
    } finally {
      await second.close()
      await first.close()
    }

    const third = await Hub.open({ root })
    try {
      expect(third.readOnly).toBe(false)
    } finally {
      await third.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reclaims a lock written on another host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-foreign-lock-'))
    await mkdir(join(root, 'records'), { recursive: true })
    await writeFile(join(root, 'records', '.writer.lock'), liveLock('some-otter-machine'), 'utf8')
    const hub = await Hub.open({ root })
    try {
      expect(hub.readOnly).toBe(false)
      expect(hub.readOnlySource).toBeNull()
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reclaims a lock whose heartbeat lease expired, even though its pid is alive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-live-lock-'))
    await mkdir(join(root, 'records'), { recursive: true })
    // A hung DSH process: the pid still exists, but nothing refreshes the
    // heartbeat any more. This used to keep the root read-only forever.
    const stale = JSON.stringify({
      pid: process.pid,
      host: hostname(),
      startedAt: '2020-01-01T00:00:00.000Z',
      heartbeatAt: '2020-01-01T00:00:00.000Z',
    })
    await writeFile(join(root, 'records', '.writer.lock'), stale, 'utf8')
    const hub = await Hub.open({ root })
    try {
      expect(hub.readOnly).toBe(false)
      expect(hub.lockInfo().reclaimed).toBe('stale-heartbeat')
      expect(hub.lockInfo().held).toBe(true)
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps a fresh live lock and shows the lease deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-fresh-lock-'))
    await mkdir(join(root, 'records'), { recursive: true })
    await writeFile(join(root, 'records', '.writer.lock'), liveLock(hostname()), 'utf8')
    const hub = await Hub.open({ root })
    try {
      expect(hub.readOnly).toBe(true)
      expect(hub.readOnlySource).toBe('lock')
      const info = hub.lockInfo()
      expect(info.held).toBe(false)
      expect(info.owner?.pid).toBe(process.pid)
      expect(info.expiresAt).toBeGreaterThan(Date.now())
      expect(hub.readOnlyReason).toContain('lease expires at')
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('recovers the writer lock on the next write instead of staying read-only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-lock-recover-'))
    const owner = await Hub.open({ root })
    const degraded = await Hub.open({ root })
    try {
      expect(degraded.readOnly).toBe(true)
      expect(degraded.readOnlySource).toBe('lock')

      await owner.close()
      // No restart: the blocked hub takes the freed lock itself.
      expect(await degraded.ensureWritable()).toBe(true)
      expect(degraded.readOnly).toBe(false)
      expect(degraded.readOnlySource).toBeNull()
      expect(degraded.lockInfo().held).toBe(true)
    } finally {
      await degraded.close()
      await owner.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('clears the cached read-only flag once the lock file is deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cache-stale-'))
    const owner = await Hub.open({ root })
    const degraded = await Hub.open({ root })
    try {
      expect(degraded.readOnly).toBe(true)
      expect(degraded.readOnlySource).toBe('lock')

      // The other process exits and its lock file is gone, but this Hub still has
      // the in-memory judgement from startup. Nothing re-reads it => "pid is gone,
      // lock file is gone, memory still says locked".
      await rm(owner.lockPath(), { force: true })
      expect(degraded.readOnly).toBe(true)

      degraded.revalidateLock()
      expect(degraded.readOnly).toBe(false)
      expect(degraded.readOnlyReason).toBeNull()
      expect(degraded.readOnlySource).toBeNull()
      expect(degraded.lockInfo().onDisk).toBe('missing')
      expect(degraded.lockInfo().held).toBe(false)

      // Still needs a real acquisition before writing, and it succeeds.
      expect(await degraded.ensureWritable()).toBe(true)
      expect(await readFile(degraded.lockPath(), 'utf8')).toContain('"token"')
    } finally {
      await degraded.close()
      await owner.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('clears the cached read-only flag when the blocker pid disappears', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cache-deadpid-'))
    const owner = await Hub.open({ root })
    const degraded = await Hub.open({ root })
    try {
      expect(degraded.readOnly).toBe(true)
      expect(degraded.readOnlySource).toBe('lock')

      // The owner is killed without releasing: its pid is gone, but the file is
      // still on disk with a fresh heartbeat, so only the dead pid can prove the
      // cached degradation is stale.
      await writeFile(
        owner.lockPath(),
        JSON.stringify({
          pid: deadPid(),
          host: hostname(),
          startedAt: new Date().toISOString(),
          heartbeatAt: new Date().toISOString(),
          token: 'a'.repeat(16),
        }),
        'utf8',
      )

      degraded.revalidateLock()
      expect(degraded.readOnly).toBe(false)
      expect(degraded.readOnlyReason).toBeNull()
      expect(degraded.lockInfo().onDisk).toBe('foreign')
      // And the reclaim actually works on the next write.
      expect(await degraded.ensureWritable()).toBe(true)
      expect(degraded.lockInfo().held).toBe(true)
    } finally {
      await degraded.close()
      await owner.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps a live blocker read-only across revalidation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cache-live-'))
    const owner = await Hub.open({ root })
    const degraded = await Hub.open({ root })
    try {
      degraded.revalidateLock()
      expect(degraded.readOnly).toBe(true)
      expect(degraded.readOnlySource).toBe('lock')
      expect(degraded.readOnlyReason).toContain('another writer')
      expect(degraded.lockInfo().owner?.pid).toBe(process.pid)
    } finally {
      await degraded.close()
      await owner.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats a held lock that is deleted on disk as reconstructible, not as stolen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-held-deleted-'))
    const hub = await Hub.open({ root })
    try {
      expect(hub.lockInfo().held).toBe(true)
      // The documented last-resort cleanup: someone deletes the lock file.
      await rm(hub.lockPath(), { force: true })

      hub.revalidateLock()
      expect(hub.readOnly).toBe(false)
      expect(hub.readOnlyReason).toBeNull()
      expect(hub.lockInfo().onDisk).toBe('missing')
      // A re-acquisition restores ownership; the old handle never revives itself.
      expect(await hub.ensureWritable()).toBe(true)
      expect(hub.lockInfo().held).toBe(true)
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('degrades when the lock file is taken over by another token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-lock-fence-'))
    const hub = await Hub.open({ root })
    try {
      expect(hub.readOnly).toBe(false)
      // Simulate a takeover: the lock file now belongs to a different writer.
      const intruder = JSON.stringify({
        pid: process.pid,
        host: hostname(),
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        token: 'ffffffffffffffff',
      })
      await writeFile(hub.lockPath(), intruder, 'utf8')

      expect(await hub.ensureWritable()).toBe(false)
      expect(hub.readOnly).toBe(true)
      expect(hub.readOnlySource).toBe('lock')
      expect(hub.readOnlyReason).toContain('lost')
      expect(hub.lockInfo().held).toBe(false)
      // The intruder's lock file is left alone.
      expect(JSON.parse(await readFile(hub.lockPath(), 'utf8'))).toMatchObject({ token: 'ffffffffffffffff' })
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('restores writes after a broken config.yaml is repaired', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-config-repair-'))
    await writeFile(join(root, 'config.yaml'), 'version: 2\n', 'utf8')
    const hub = await Hub.open({ root })
    try {
      expect(hub.readOnly).toBe(true)
      expect(hub.readOnlySource).toBe('config')
      expect(hub.canWriteConfig()).toBe(true)

      await writeFile(join(root, 'config.yaml'), 'version: 1\n', 'utf8')
      await hub.reloadConfig()
      expect(hub.configError).toBeNull()
      expect(hub.readOnly).toBe(false)

      // The recovered hub now holds the writer lock again.
      const rival = await Hub.open({ root })
      try {
        expect(rival.readOnly).toBe(true)
      } finally {
        await rival.close()
      }
    } finally {
      await hub.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resolves the configured root before DSH_HOME', () => {
    const explicit = resolveHubRoot('D:/custom/hub')
    expect(explicit.replace(/\\/g, '/')).toContain('D:/custom/hub')
  })
})
