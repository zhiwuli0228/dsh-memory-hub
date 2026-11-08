import { isScopeVisible } from './scope.js'
import {
  DEFAULT_TEMPORAL_POLICY,
  temporalDecay,
  temporalStateFromTimes,
  temporalTimesOf,
  type TemporalPolicy,
  type TemporalTimes,
} from './temporal.js'
import type { KnowledgeHit, KnowledgeRecord, KnowledgeStatus, KnowledgeType, TemporalState, Visibility } from './types.js'

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

export interface IndexEntry {
  record: KnowledgeRecord
  length: number
  tokens: Map<string, number>
  /** 建索引时解析一次，避免每个候选再 `Date.parse`。 */
  times: TemporalTimes
  titleNormalized: string
}

/** 检索后端的公共接口：内存索引与 SQLite 派生索引都实现它。 */
export interface SearchIndex {
  readonly size: number
  add(record: KnowledgeRecord): void
  remove(id: string): void
  clear(): void
  search(query: string, filters: SearchFilters): KnowledgeHit[]
}

/** 打分只依赖这四样；SQLite 后端按需从库里取，内存后端直接查 Map。 */
export interface ScoringSource {
  entryCount: number
  totalLength: number
  postings(token: string): Map<string, number> | undefined
  entry(id: string): IndexEntry | undefined
}

/** 与字段顺序无关的索引条目构造：两个后端必须用同一份分词与长度定义。 */
export function indexEntryOf(record: KnowledgeRecord): IndexEntry {
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
  return {
    record,
    length: [...tokens.values()].reduce((sum, value) => sum + value, 0),
    tokens,
    times: temporalTimesOf(record),
    titleNormalized: normalizeText(record.title),
  }
}

export interface SearchFilters {
  statuses?: ReadonlySet<KnowledgeStatus>
  visibility: Visibility
  types?: ReadonlySet<KnowledgeType>
  limit?: number
  /** Drop hits whose final score is below this value. */
  minScore?: number
  /** Multiplier applied to project:<preferProject> entries. */
  localBoost?: number
  /** The current workspace id; its project scope is boosted over the core. */
  preferProject?: string
  /** 命中来源的核心 Hub 标注（跨 Hub 检索时由调用方传入）。 */
  coreTag?: string | null
  /** 时效降权策略；缺省用 90 天 / 0.85 / 0.6 / 0.3 的默认值。 */
  temporal?: TemporalPolicy
  /** 完全不返回这些时效状态的条目（预检用它排除尚未生效的条目）。 */
  excludeTemporal?: ReadonlySet<TemporalState>
  /** 固定「现在」以便测试；缺省用系统时间。 */
  nowMs?: number
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

export class KnowledgeIndex implements SearchIndex {
  private readonly entries = new Map<string, IndexEntry>()
  private readonly postings = new Map<string, Map<string, number>>()
  private totalLength = 0

  get size(): number {
    return this.entries.size
  }

  add(record: KnowledgeRecord): void {
    if (this.entries.has(record.id)) this.remove(record.id)
    const entry = indexEntryOf(record)
    this.entries.set(record.id, entry)
    this.totalLength += entry.length
    for (const [token, count] of entry.tokens) {
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

  clear(): void {
    this.entries.clear()
    this.postings.clear()
    this.totalLength = 0
  }

  get(id: string): KnowledgeRecord | undefined {
    return this.entries.get(id)?.record
  }

  records(): KnowledgeRecord[] {
    return [...this.entries.values()].map((entry) => entry.record)
  }

  search(query: string, filters: SearchFilters): KnowledgeHit[] {
    return rankHits(query, filters, {
      entryCount: this.entries.size,
      totalLength: this.totalLength,
      postings: (token) => this.postings.get(token),
      entry: (id) => this.entries.get(id),
    })
  }
}

/** 去重后的查询词元；空查询直接返回空数组。 */
export function queryTokensOf(query: string): string[] {
  return [...new Set(tokenize(query))]
}

/** 一次检索的公共上下文：两个后端必须用同一份参数算分。 */
export interface SearchSetup {
  entryCount: number
  avgLength: number
  policy: TemporalPolicy
  nowMs: number
  normalizedQuery: string
  statuses: ReadonlySet<KnowledgeStatus>
}

export function searchSetup(
  query: string,
  filters: SearchFilters,
  entryCount: number,
  totalLength: number,
): SearchSetup {
  return {
    entryCount,
    avgLength: totalLength / Math.max(1, entryCount),
    policy: filters.temporal ?? DEFAULT_TEMPORAL_POLICY,
    nowMs: filters.nowMs ?? Date.now(),
    normalizedQuery: normalizeText(query).trim(),
    statuses: filters.statuses ?? new Set<KnowledgeStatus>(['accepted']),
  }
}

/** 单个词元的 BM25-lite 贡献。内存索引与 SQLite 索引用同一个实现，避免口径漂移。 */
export function bm25Term(tf: number, df: number, entryCount: number, length: number, avgLength: number): number {
  const idf = Math.log(1 + (entryCount - df + 0.5) / (df + 0.5))
  const denominator = tf + K1 * (1 - B + B * (length / Math.max(1, avgLength)))
  return (idf * (tf * (K1 + 1))) / Math.max(1e-6, denominator)
}

/** 状态 / 作用域 / 类型过滤：两个后端在进入精排前做同一组判断。 */
export function passesFilters(record: KnowledgeRecord, filters: SearchFilters, setup: SearchSetup): boolean {
  if (!setup.statuses.has(record.status)) return false
  if (!isScopeVisible(record.scope, filters.visibility)) return false
  if (filters.types !== undefined && !filters.types.has(record.type)) return false
  return true
}

/**
 * 唯一的排序实现：类型加成、时效降权、recency、local_boost、`min_score`，
 * 以及并列时按 id 倒序。内存索引与 SQLite 索引都把候选交给它。
 */
export function rankScored(
  filters: SearchFilters,
  setup: SearchSetup,
  queryTokens: readonly string[],
  scored: Iterable<{ entry: IndexEntry; baseScore: number }>,
): KnowledgeHit[] {
  const limit = Math.max(1, filters.limit ?? 8)
  // 只保留前 limit 名：候选可能上万，先做轻量选择，再为选中项生成 snippet 与命中对象。
  const best: ScoredCandidate[] = []
  for (const { entry, baseScore } of scored) {
    const record = entry.record
    if (!passesFilters(record, filters, setup)) continue
    const state = temporalStateFromTimes(entry.times, setup.nowMs, setup.policy)
    if (filters.excludeTemporal?.has(state) === true) continue
    const updatedAt = entry.times.updatedAt
    const ageDays = updatedAt === null ? 0 : Math.max(0, (setup.nowMs - updatedAt) / 86_400_000)
    let score = baseScore * TYPE_BOOST[record.type] + Math.exp(-ageDays / 180) * 0.3
    score *= temporalDecay(state, setup.policy)
    if (setup.normalizedQuery.length >= 2 && entry.titleNormalized.includes(setup.normalizedQuery)) {
      score *= 1.25
    }
    if (
      filters.preferProject !== undefined &&
      record.scope.level === 'project' &&
      record.scope.workspaceId === filters.preferProject
    ) {
      score *= filters.localBoost ?? 1
    }
    if (filters.minScore !== undefined && score < filters.minScore) continue
    offerTop(best, { id: record.id, score, temporal: state, entry }, limit)
  }

  best.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return right.id.localeCompare(left.id)
  })

  return best.map((candidate) => {
    const record = candidate.entry.record
    return {
      id: record.id,
      version: record.version,
      type: record.type,
      status: record.status,
      scope: record.scope,
      title: record.title,
      summary: record.summary,
      path: record.path,
      snippet: makeSnippet(record, queryTokens),
      score: candidate.score,
      temporal: candidate.temporal,
      core: filters.coreTag ?? null,
    }
  })
}

/**
 * 内存后端的候选生成：倒排表取并集，累加每个词元的 BM25 贡献，再交给 `rankScored`。
 */
export function rankHits(query: string, filters: SearchFilters, source: ScoringSource): KnowledgeHit[] {
  const queryTokens = queryTokensOf(query)
  if (queryTokens.length === 0) return []
  const setup = searchSetup(query, filters, source.entryCount, source.totalLength)

  const scores = new Map<string, number>()
  for (const token of queryTokens) {
    const posting = source.postings(token)
    if (posting === undefined) continue
    const df = posting.size
    for (const [id, tf] of posting) {
      const entry = source.entry(id)
      if (entry === undefined) continue
      if (!passesFilters(entry.record, filters, setup)) continue
      const term = bm25Term(tf, df, source.entryCount, entry.length, setup.avgLength)
      scores.set(id, (scores.get(id) ?? 0) + term)
    }
  }

  return rankScored(
    filters,
    setup,
    queryTokens,
    (function* scored() {
      for (const [id, baseScore] of scores) {
        const entry = source.entry(id)
        if (entry !== undefined) yield { entry, baseScore }
      }
    })(),
  )
}

interface ScoredCandidate {
  id: string
  score: number
  temporal: TemporalState
  entry: IndexEntry
}

/** 排序语义与全量排序一致：分数高者在前，平分时 id 大者在前。 */
function ranksBefore(left: ScoredCandidate, right: ScoredCandidate): boolean {
  if (left.score !== right.score) return left.score > right.score
  return left.id > right.id
}

/**
 * 维护「前 limit 名」的小数组：未满直接追加；满了就线性找出最差的一名替换。
 * limit 很小（预检 8、面板 20），比全量排序上百倍候选便宜得多。
 */
function offerTop(best: ScoredCandidate[], candidate: ScoredCandidate, limit: number): void {
  if (best.length < limit) {
    best.push(candidate)
    return
  }
  let worst = 0
  for (let index = 1; index < best.length; index += 1) {
    if (ranksBefore(best[worst]!, best[index]!)) worst = index
  }
  if (ranksBefore(candidate, best[worst]!)) best[worst] = candidate
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
