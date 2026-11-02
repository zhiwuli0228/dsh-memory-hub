import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Hub, resolveHubRoot } from '../src/hub.js'

function liveLock(host: string): string {
  const now = new Date().toISOString()
  return JSON.stringify({ pid: process.pid, host, startedAt: now, heartbeatAt: now })
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

  it('keeps a live lock from this host even when its heartbeat looks old', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-live-lock-'))
    await mkdir(join(root, 'records'), { recursive: true })
    const stale = JSON.stringify({
      pid: process.pid,
      host: hostname(),
      startedAt: '2020-01-01T00:00:00.000Z',
      heartbeatAt: '2020-01-01T00:00:00.000Z',
    })
    await writeFile(join(root, 'records', '.writer.lock'), stale, 'utf8')
    const hub = await Hub.open({ root })
    try {
      expect(hub.readOnly).toBe(true)
      expect(hub.readOnlyReason).toContain('another writer')
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
