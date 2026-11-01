import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { ensureDir, pathExists, writeAtomic } from './atomic.js'
import {
  DEFAULT_CONFIG_YAML,
  defaultConfig,
  readConfigFile,
  type MemoryConfig,
} from './config.js'
import { MemoryError } from './errors.js'
import { WriterLock } from './lock.js'
import { KNOWLEDGE_TYPES, TYPE_PREFIX, type KnowledgeType } from './types.js'

export interface HubOptions {
  root?: string
  readOnly?: boolean
  lock?: boolean
}

export function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

export function resolveHubRoot(configured?: string): string {
  const trimmed = configured?.trim()
  if (trimmed !== undefined && trimmed !== '') return resolve(expandHome(trimmed))
  const dshHome = process.env.DSH_HOME?.trim()
  const base = dshHome !== undefined && dshHome !== '' ? resolve(expandHome(dshHome)) : join(homedir(), '.dsh')
  return join(base, 'memory-hub')
}

export class Hub {
  readonly root: string
  config: MemoryConfig
  configError: string | null = null
  readOnly: boolean
  readOnlyReason: string | null = null

  private lock: WriterLock | null = null

  private constructor(
    root: string,
    config: MemoryConfig,
    readOnly: boolean,
    readOnlyReason: string | null,
  ) {
    this.root = root
    this.config = config
    this.readOnly = readOnly
    this.readOnlyReason = readOnlyReason
  }

  static async open(options: HubOptions = {}): Promise<Hub> {
    const root = resolveHubRoot(options.root)
    const configPath = join(root, 'config.yaml')
    let config = defaultConfig()
    let configError: string | null = null
    let readOnly = options.readOnly === true
    let readOnlyReason: string | null = readOnly ? 'configured read-only' : null

    await ensureLayout(root)

    if (!(await pathExists(configPath))) {
      try {
        await writeAtomic(configPath, DEFAULT_CONFIG_YAML)
      } catch (error) {
        configError = `cannot create config.yaml: ${(error as Error).message}`
        readOnly = true
        readOnlyReason = configError
      }
    }

    try {
      const loaded = await readConfigFile(configPath)
      if (loaded !== null) config = loaded
    } catch (error) {
      configError = (error as Error).message
      readOnly = true
      readOnlyReason = configError
    }

    const hub = new Hub(root, config, readOnly, readOnlyReason)
    hub.configError = configError

    if (!readOnly && options.lock !== false) {
      const lock = await WriterLock.acquire(hub.lockPath(), config.storage.lock_stale_ms)
      if (lock === null) {
        hub.readOnly = true
        hub.readOnlyReason = 'another writer holds records/.writer.lock'
      } else {
        hub.lock = lock
      }
    }

    return hub
  }

  async reloadConfig(): Promise<void> {
    try {
      const loaded = await readConfigFile(this.configPath())
      if (loaded === null) {
        this.configError = 'config.yaml is missing'
        return
      }
      this.config = loaded
      this.configError = null
    } catch (error) {
      this.configError = (error as Error).message
    }
  }

  async close(): Promise<void> {
    if (this.lock !== null) {
      await this.lock.release()
      this.lock = null
    }
  }

  configPath(): string {
    return join(this.root, 'config.yaml')
  }

  lockPath(): string {
    return join(this.root, 'records', '.writer.lock')
  }

  ledgerPath(): string {
    return join(this.root, 'records', 'ledger.jsonl')
  }

  sequencesPath(): string {
    return join(this.root, 'records', 'sequences.json')
  }

  pendingDir(): string {
    return join(this.root, 'pending')
  }

  pendingArchiveDir(): string {
    return join(this.root, 'pending', 'archive')
  }

  pendingPath(id: string): string {
    return join(this.pendingDir(), `${id}.md`)
  }

  pendingArchivePath(id: string): string {
    return join(this.pendingArchiveDir(), `${id}.md`)
  }

  knowledgeDir(type: KnowledgeType): string {
    return join(this.root, 'knowledge', type)
  }

  knowledgePath(type: KnowledgeType, id: string): string {
    return join(this.knowledgeDir(type), `${id}.md`)
  }

  historyPath(type: KnowledgeType, id: string, version: number): string {
    return join(this.root, 'history', type, `${id}@v${version}.md`)
  }

  displayRoot(): string {
    const home = homedir()
    if (this.root === home) return '~'
    if (this.root.startsWith(home)) {
      const suffix = this.root.slice(home.length).replace(/^[/\\]/, '')
      return `~/${suffix.replace(/\\/g, '/')}`
    }
    return this.root
  }

  prefixFor(type: KnowledgeType): string {
    return TYPE_PREFIX[type]
  }
}

async function ensureLayout(root: string): Promise<void> {
  try {
    await ensureDir(root)
    for (const type of KNOWLEDGE_TYPES) {
      await ensureDir(join(root, 'knowledge', type))
    }
    await ensureDir(join(root, 'pending', 'archive'))
    await ensureDir(join(root, 'history'))
    await ensureDir(join(root, 'records'))
    await ensureDir(join(root, 'index'))
  } catch (error) {
    throw new MemoryError('STORAGE_ERROR', `cannot initialize memory hub at ${root}: ${(error as Error).message}`)
  }
}
