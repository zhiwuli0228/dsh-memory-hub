/**
 * DSH credential store 读取：apiKeyEnv 语义 = 先从 process.env 找，找不到再回退到
 * `$DSH_HOME/.credentials.yaml`（默认 `~/.dsh/.credentials.yaml`）的 `refs[<name>]`。
 *
 * DSH 的 LLM 等内置服务正是这样解析 apiKeyEnv 的（credentials 不入 process.env，
 * 只在服务需要时按 ref 解析），腾讯桥沿用同一机制，让部署在 DSH 上的配置不用
 * 把 key 明文写进 config.yaml。文件不可读/无该 ref 时返回 null，绝不抛。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** 返回 credential store 文件路径（$DSH_HOME/.credentials.yaml，默认 ~/.dsh/.credentials.yaml）。 */
export function dshCredentialPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, '.credentials.yaml')
}

/** 从 credential store 解析一个具名 secret；找不到、文件不可读或值非法时返回 null。 */
export function readDshCredential(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const raw = readFileSync(dshCredentialPath(env), 'utf8')
    const doc = parseYaml(raw) as { refs?: Record<string, unknown> } | null
    const value = doc?.refs?.[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  } catch {
    return null
  }
}

/**
 * 解析 apiKeyEnv：process.env 优先，其次 credential store。两者皆空返回 null。
 * 该函数保证不抛（不可读的 credentials 文件等价于没有）。
 */
export function resolveApiKeyEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const direct = env[name]?.trim()
  if (direct !== undefined && direct !== '') return direct
  return readDshCredential(name, env)
}
