/**
 * 场景归纳（阶段三）：把 accepted 知识按主题聚合成场景索引文件。
 *
 * 这是**派生视图**，不是权威数据：
 * - 输出到 `<hub>/<layers.scenario_dir>/<topic>.md`（默认 scenario/），每次重建；
 * - 只读 knowledge/ 与 ledger，绝不修改、删除任何知识条目；
 * - 目录可随时删掉，下次重建即恢复；
 * - 每个场景文件是「索引 + 摘要」，正文细节仍由 memory_get 读取。
 *
 * 聚合规则（确定性、可复现）：
 * 1. 优先用显式 tag（`topic:<x>` / `domain:<x>` / `batch:<x>`）作为主题；
 * 2. 否则按知识类型分桶（decision / knowledge / …）；
 * 3. 每个主题下按更新时间倒序，最多 N 条；
 * 4. 主题条目少于 minEntries 的不单独建文件（避免碎文件）。
 */

import { basename, join } from 'node:path'
import { ensureDir, writeAtomic } from './atomic.js'
import type { KnowledgeRecord } from './types.js'

export interface ScenarioOptions {
  /** 场景目录（相对 hub root）。空字符串 = 关闭。 */
  scenarioDir: string
  /** 每个场景最多列出的条目数。 */
  maxEntriesPerScenario: number
  /** 主题至少多少条才建场景文件。 */
  minEntries: number
}

export interface ScenarioFile {
  topic: string
  path: string
  entries: number
  updatedAt: string
}

export interface ScenarioResult {
  scenarios: ScenarioFile[]
  skipped: number
}

const DEFAULT_MAX_PER_SCENARIO = 50
const DEFAULT_MIN_ENTRIES = 2

/** 提取主题：优先显式 tag，其次类型名。 */
function topicOf(record: KnowledgeRecord): { topic: string; ranked: boolean } {
  const preferred = ['topic:', 'domain:', 'batch:']
  for (const prefix of preferred) {
    const tag = record.tags.find((value) => value.startsWith(prefix))
    if (tag !== undefined) {
      const value = tag.slice(prefix.length).trim()
      if (value !== '') return { topic: value, ranked: true }
    }
  }
  return { topic: record.type, ranked: false }
}

function safeFileStem(topic: string): string {
  const stem = topic
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80)
  return stem === '' ? 'untitled' : stem
}

function renderScenario(topic: string, records: KnowledgeRecord[]): string {
  const lines: string[] = [
    `# 场景：${topic}`,
    '',
    '> 本文件由 Memory Hub 自动生成（派生视图，可随时删除重建）。',
    '> 它只是索引与摘要；正文细节请用 memory_get 读取对应条目。',
    '',
    `条目数：${records.length}`,
    '',
    '## 条目索引',
    '',
  ]
  for (const record of records) {
    lines.push(`- [${record.id}@${record.version}] ${record.type} · ${record.title}`)
    lines.push(`  ${record.summary}`)
  }
  lines.push('')
  return lines.join('\n')
}

export class ScenarioBuilder {
  private readonly options: ScenarioOptions

  constructor(options: Partial<ScenarioOptions> = {}) {
    this.options = {
      scenarioDir: options.scenarioDir ?? 'scenario',
      maxEntriesPerScenario: options.maxEntriesPerScenario ?? DEFAULT_MAX_PER_SCENARIO,
      minEntries: options.minEntries ?? DEFAULT_MIN_ENTRIES,
    }
  }

  get enabled(): boolean {
    return this.options.scenarioDir.trim() !== ''
  }

  /** 从知识记录构建/重建全部场景文件。只写 scenario 目录。 */
  async rebuild(root: string, records: KnowledgeRecord[]): Promise<ScenarioResult> {
    if (!this.enabled) return { scenarios: [], skipped: 0 }
    const accepted = records.filter((record) => record.status === 'accepted')
    const buckets = new Map<string, KnowledgeRecord[]>()
    for (const record of accepted) {
      const { topic } = topicOf(record)
      const list = buckets.get(topic) ?? []
      list.push(record)
      buckets.set(topic, list)
    }

    const scenarios: ScenarioFile[] = []
    let skipped = 0
    for (const [topic, list] of buckets) {
      if (list.length < this.options.minEntries) {
        skipped += 1
        continue
      }
      const sorted = [...list]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, this.options.maxEntriesPerScenario)
      const dir = join(root, this.options.scenarioDir)
      await ensureDir(dir)
      const path = join(dir, `${safeFileStem(topic)}.md`)
      await writeAtomic(path, renderScenario(topic, sorted))
      scenarios.push({ topic, path, entries: sorted.length, updatedAt: new Date().toISOString() })
    }

    // 删除已无对应条目的旧场景文件（仅限本目录、仅限 .md）。
    const { readdir } = await import('node:fs/promises')
    const dir = join(root, this.options.scenarioDir)
    const keep = new Set(scenarios.map((entry) => basename(entry.path)))
    try {
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.md')) continue
        if (keep.has(name)) continue
        const { rm } = await import('node:fs/promises')
        await rm(join(dir, name), { force: true })
      }
    } catch {
      // 目录尚不存在：无需清理。
    }

    return { scenarios, skipped }
  }

  /** 只读列出当前场景目录。 */
  async list(root: string): Promise<Array<{ name: string; path: string }>> {
    if (!this.enabled) return []
    const { readdir } = await import('node:fs/promises')
    const dir = join(root, this.options.scenarioDir)
    try {
      const names = await readdir(dir)
      return names
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => ({ name, path: join(dir, name) }))
    } catch {
      return []
    }
  }
}
