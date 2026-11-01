import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomHex } from './ids.js'
import { sleep } from './time.js'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/**
 * Write one file atomically: temp file in the same directory, fsync, rename.
 * Windows may briefly report EPERM/EBUSY while an indexer or scanner holds the
 * target; retry with backoff instead of leaving a half-written file.
 */
export async function writeAtomic(path: string, content: string): Promise<void> {
  const dir = dirname(path)
  await ensureDir(dir)
  const temp = join(dir, `.${basename(path)}.${process.pid}.${randomHex(4)}.tmp`)
  const handle = await open(temp, 'w')
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }

  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temp, path)
      return
    } catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break
      await sleep(50 * 2 ** attempt)
    }
  }
  await rm(temp, { force: true }).catch(() => {})
  throw new Error(`cannot replace ${path}: ${(lastError as Error)?.message ?? 'unknown error'}`)
}

export async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true })
}
