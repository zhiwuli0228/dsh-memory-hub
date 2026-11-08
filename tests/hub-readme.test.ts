import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { Hub } from '../src/hub.js'
import { HUB_README_VERSION } from '../src/hub-readme.js'

const cleanups: Array<() => Promise<void>> = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dmh-hub-readme-'))
  cleanups.push(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return root
}

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.()
  }
})

describe('hub README', () => {
  it('explains every folder, the assets type and the write path', async () => {
    const root = await tempRoot()
    const hub = await Hub.open({ root, lock: false })
    try {
      const text = await readFile(join(root, 'README.md'), 'utf8')
      expect(text).toContain(`dsh-memory-hub:hub-readme ${HUB_README_VERSION}`)
      for (const path of ['knowledge/', 'pending/', 'records/ledger.jsonl', 'history/', 'reports/', 'index/']) {
        expect(text).toContain(path)
      }
      expect(text).toContain('`assets`')
      expect(text).toContain('不是**代码资产')
      expect(text).toContain('memory_propose')
      expect(text).toContain('memory_commit')
      expect(text).toContain('不要手改')
    } finally {
      await hub.close()
    }
  })

  it('preserves user edits on a later open and does not rewrite the same version', async () => {
    const root = await tempRoot()
    const first = await Hub.open({ root, lock: false })
    const original = await readFile(join(root, 'README.md'), 'utf8')
    await first.close()

    await writeFile(join(root, 'README.md'), `${original}\n\n## 我们团队的补充\n\n本地约定。\n`, 'utf8')

    const second = await Hub.open({ root, lock: false })
    try {
      const text = await readFile(join(root, 'README.md'), 'utf8')
      expect(text).toContain('我们团队的补充')
      expect(text).toContain('本地约定。')
    } finally {
      await second.close()
    }
  })

  it('rewrites an outdated generated README and leaves a hand-written one alone', async () => {
    const staleRoot = await tempRoot()
    await writeFile(
      join(staleRoot, 'README.md'),
      '# old\n\n<!-- dsh-memory-hub:hub-readme 0 -->\n\n过期的说明。\n',
      'utf8',
    )
    const stale = await Hub.open({ root: staleRoot, lock: false })
    try {
      const text = await readFile(join(staleRoot, 'README.md'), 'utf8')
      expect(text).toContain(`dsh-memory-hub:hub-readme ${HUB_README_VERSION}`)
      expect(text).not.toContain('过期的说明。')
    } finally {
      await stale.close()
    }

    const customRoot = await tempRoot()
    await writeFile(join(customRoot, 'README.md'), '# 我们自己的说明\n\n不自动覆盖。\n', 'utf8')
    const custom = await Hub.open({ root: customRoot, lock: false })
    try {
      const text = await readFile(join(customRoot, 'README.md'), 'utf8')
      expect(text).toBe('# 我们自己的说明\n\n不自动覆盖。\n')
      const fallback = await readFile(join(customRoot, 'MEMORY-HUB.md'), 'utf8')
      expect(fallback).toContain(`dsh-memory-hub:hub-readme ${HUB_README_VERSION}`)
      expect(fallback).toContain('MEMORY-HUB.md')
    } finally {
      await custom.close()
    }
  })

  it('does not write a README into a read-only hub', async () => {
    const root = await tempRoot()
    const hub = await Hub.open({ root, readOnly: true, lock: false })
    try {
      await expect(readFile(join(root, 'README.md'), 'utf8')).rejects.toThrow()
    } finally {
      await hub.close()
    }
  })
})
