import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Hub, resolveHubRoot } from '../src/hub.js'

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
      expect(second.readOnlyReason).toContain('another writer')
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

  it('resolves the configured root before DSH_HOME', () => {
    const explicit = resolveHubRoot('D:/custom/hub')
    expect(explicit.replace(/\\/g, '/')).toContain('D:/custom/hub')
  })
})
