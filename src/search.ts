import { isScopeVisible } from './scope.js'
import { daysSince } from './time.js'
import type { KnowledgeHit, KnowledgeRecord, KnowledgeStatus, KnowledgeType, Visibility } from './types.js'

const HAN = /\p{Script=Han}/u
const WORD = /[\p{Script=Han}]+|[a-z0-9][a-z0-9_]*/gu

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'with',
  '的', '了', '是', '在', '和', '与', '及', '或', '把', '被', '对', '个', '这', '那',
])

export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  const tokens: string[] = []
  for (const match of normalized.matchAll(WORD)) {
    const chunk = match[0]
    if (chunk.length === 0) continue
    if (HAN.test(chunk)) {
      const chars = Array.from(chunk)
      for (const char of chars) {
        if (!STOPWORDS.has(char)) tokens.push(char)
      }
      for (let index = 0; index + 1 < chars.length; index += 1) {
        const bigram = `${chars[index]}${chars[index + 1]}`
        if (!STOPWORDS.has(bigram)) tokens.push(bigram)
      }
    } else if (!STOPWORDS.has(chunk)) {
      tokens.push(chunk)
    }
  }
  return tokens
}

function countTokens(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}

interface IndexEntry {
  record: KnowledgeRecord
  length: number
  tokens: Map<string, number>
}

export interface SearchFilters {
  statuses?: ReadonlySet<KnowledgeStatus>
  visibility: Visibility
  types?: ReadonlySet<KnowledgeType>
  limit?: number
}

const TYPE_BOOST: Record<KnowledgeType, number> = {
  constraint: 1.2,
  decision: 1.15,
  'runtime-base': 1.1,
  'api-catalog': 1.05,
  process: 1.05,
  knowledge: 1.0,
  playbooks: 0.95,
  'open-questions': 0.85,
  assets: 0.8,
}

const K1 = 1.2
const B = 0.75

export class KnowledgeIndex {
  private readonly entries = new Map<string, IndexEntry>()
  private readonly postings = new Map<string, Map<string, number>>()
  private totalLength = 0

  get size(): number {
    return this.entries.size
  }

  add(record: KnowledgeRecord): void {
    if (this.entries.has(record.id)) this.remove(record.id)
    const tokens = countTokens([
      ...tokenize(record.title),
      ...tokenize(record.title),
      ...tokenize(record.title),
      ...tokenize(record.tags.join(' ')),
      ...tokenize(record.tags.join(' ')),
      ...tokenize(record.summary),
      ...tokenize(record.summary),
      ...tokenize(record.body),
    ])
    const length = [...tokens.values()].reduce((sum, value) => sum + value, 0)
    this.entries.set(record.id, { record, length, tokens })
    this.totalLength += length
    for (const [token, count] of tokens) {
      let posting = this.postings.get(token)
      if (posting === undefined) {
        posting = new Map()
        this.postings.set(token, posting)
      }
      posting.set(record.id, count)
    }
  }

  remove(id: string): void {
    const entry = this.entries.get(id)
    if (entry === undefined) return
    this.totalLength -= entry.length
    for (const token of entry.tokens.keys()) {
      const posting = this.postings.get(token)
      if (posting === undefined) continue
      posting.delete(id)
      if (posting.size === 0) this.postings.delete(token)
    }
    this.entries.delete(id)
  }

  get(id: string): KnowledgeRecord | undefined {
    return this.entries.get(id)?.record
  }

  records(): KnowledgeRecord[] {
    return [...this.entries.values()].map((entry) => entry.record)
  }

  search(query: string, filters: SearchFilters): KnowledgeHit[] {
    const queryTokens = [...new Set(tokenize(query))]
    if (queryTokens.length === 0) return []

    const statuses = filters.statuses ?? new Set<KnowledgeStatus>(['accepted'])
    const allowed = new Set<string>()
    for (const [id, entry] of this.entries) {
      const record = entry.record
      if (!statuses.has(record.status)) continue
      if (!isScopeVisible(record.scope, filters.visibility)) continue
      if (filters.types !== undefined && !filters.types.has(record.type)) continue
      allowed.add(id)
    }
    if (allowed.size === 0) return []

    const avgLength = this.totalLength / Math.max(1, this.entries.size)
    const scores = new Map<string, number>()

    for (const token of queryTokens) {
      const posting = this.postings.get(token)
      if (posting === undefined) continue
      const df = posting.size
      const idf = Math.log(1 + (this.entries.size - df + 0.5) / (df + 0.5))
      for (const [id, tf] of posting) {
        if (!allowed.has(id)) continue
        const entry = this.entries.get(id)
        if (entry === undefined) continue
        const denominator = tf + K1 * (1 - B + B * (entry.length / Math.max(1, avgLength)))
        const score = (idf * (tf * (K1 + 1))) / Math.max(1e-6, denominator)
        scores.set(id, (scores.get(id) ?? 0) + score)
      }
    }

    const normalizedQuery = normalizeText(query).trim()
    const hits: KnowledgeHit[] = []
    for (const [id, baseScore] of scores) {
      const entry = this.entries.get(id)
      if (entry === undefined) continue
      const record = entry.record
      let score = baseScore * TYPE_BOOST[record.type] + Math.exp(-daysSince(record.updatedAt) / 180) * 0.3
      if (normalizedQuery.length >= 2 && normalizeText(record.title).includes(normalizedQuery)) {
        score *= 1.25
      }
      hits.push({
        id: record.id,
        version: record.version,
        type: record.type,
        status: record.status,
        scope: record.scope,
        title: record.title,
        summary: record.summary,
        path: record.path,
        snippet: makeSnippet(record, queryTokens),
        score,
      })
    }

    hits.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return right.id.localeCompare(left.id)
    })

    return hits.slice(0, Math.max(1, filters.limit ?? 8))
  }
}

function makeSnippet(record: KnowledgeRecord, queryTokens: readonly string[]): string {
  if (record.summary.trim().length > 0) return record.summary.trim()
  const lines = record.body.split('\n')
  for (const line of lines) {
    const normalized = normalizeText(line)
    if (queryTokens.some((token) => normalized.includes(token))) {
      return line.trim().slice(0, 240)
    }
  }
  return record.body.trim().slice(0, 240)
}
