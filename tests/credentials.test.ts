import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { dshCredentialPath, readDshCredential, resolveApiKeyEnv } from '../src/credentials.js'

let root = ''

afterEach(async () => {
  if (root !== '') {
    await rm(root, { recursive: true, force: true })
    root = ''
  }
})

async function makeEnv(): Promise<NodeJS.ProcessEnv> {
  root = await mkdtemp(join(process.cwd(), '.cred-test-'))
  return { DSH_HOME: root } as NodeJS.ProcessEnv
}

describe('dsh credentials', () => {
  it('resolves a ref from the credential store', async () => {
    const env = await makeEnv()
    await writeFile(join(root, '.credentials.yaml'), `version: 1\nrefs:\n  PROXY_USER_KEY: sk-mem-test\n`, 'utf8')
    expect(dshCredentialPath(env)).toBe(join(root, '.credentials.yaml'))
    expect(readDshCredential('PROXY_USER_KEY', env)).toBe('sk-mem-test')
  })

  it('returns null when the file is missing or unreadable', async () => {
    const env = await makeEnv()
    expect(readDshCredential('ANY', env)).toBeNull()
  })

  it('returns null when the ref is absent or empty', async () => {
    const env = await makeEnv()
    await writeFile(join(root, '.credentials.yaml'), `version: 1\nrefs:\n  OTHER: ''\n`, 'utf8')
    expect(readDshCredential('OTHER', env)).toBeNull()
    expect(readDshCredential('MISSING', env)).toBeNull()
  })

  it('prefers process.env over the credential store', async () => {
    const env = await makeEnv()
    await writeFile(join(root, '.credentials.yaml'), `version: 1\nrefs:\n  KEY_A: from-store\n`, 'utf8')
    expect(resolveApiKeyEnv('KEY_A', { ...env, KEY_A: 'from-env' })).toBe('from-env')
    expect(resolveApiKeyEnv('KEY_A', env)).toBe('from-store')
    expect(resolveApiKeyEnv('KEY_B', env)).toBeNull()
  })

  it('ignores malformed yaml instead of throwing', async () => {
    const env = await makeEnv()
    await writeFile(join(root, '.credentials.yaml'), 'refs: [not-a-map\n', 'utf8')
    expect(readDshCredential('ANY', env)).toBeNull()
    expect(resolveApiKeyEnv('ANY', env)).toBeNull()
  })
})
