import { tokenize } from './search.js'
import { formatScope } from './scope.js'
import type { KnowledgeRecord } from './types.js'

/** 近重复检测的默认参数（与 `policy.dedupe` 的默认值一致）。 */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.72
export const DEFAULT_DUPLICATE_MAX_PAIRS = 20
/** 标题 bigram 的高置信阈值：命中即视为「几乎确定重复」。 */
export const HIGH_CONFIDENCE_TITLE_THRESHOLD = 0.82
/** 正文只取前 4KB 参与分片，避免长文拖慢成对比较。 */
const BODY_SAMPLE_BYTES = 4096

export interface DuplicatePair {
  /** keeper（建议保留项）与被合并项；keeper 由确定性规则选出。 */
  keeperId: string
  otherId: string
  /** 组合相似度 0.6 × 标题/摘要 + 0.4 × 正文。 */
  similarity: number
  /** 标题 bigram 相似度，用于「高置信」标记。 */
  titleSimilarity: number
  /** 标题单项 ≥ 0.82：几乎确定是重复。 */
  highConfidence: boolean
}

export interface FindDuplicatesOptions {
  threshold?: number
  maxPairs?: number
  /** 只看这些记录（默认调用方传入 accepted 列表）。 */
  records: readonly KnowledgeRecord[]
}

/**
 * 找出同类型、同作用域的近重复对。确定性：同一输入永远返回同样顺序的结果。
 * 复杂度 O(Σ bucket²)；按 `type + scope` 分桶，n 大时也不会全局两两比较。
 */
export function findNearDuplicates(options: FindDuplicatesOptions): DuplicatePair[] {
  const threshold = options.threshold ?? DEFAULT_DUPLICATE_THRESHOLD
  const maxPairs = options.maxPairs ?? DEFAULT_DUPLICATE_MAX_PAIRS
  const buckets = new Map<string, KnowledgeRecord[]>()
  for (const record of options.records) {
    if (record.status !== 'accepted') continue
    if (record.supersededBy !== null) continue
    const key = `${record.type}\u0000${formatScope(record.scope)}`
    const bucket = buckets.get(key) ?? []
    bucket.push(record)
    buckets.set(key, bucket)
  }

  const pairs: DuplicatePair[] = []
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue
    const profiles = bucket.map(profileOf)
    for (let left = 0; left < profiles.length; left += 1) {
      for (let right = left + 1; right < profiles.length; right += 1) {
        const pair = compare(profiles[left]!, profiles[right]!)
        if (pair.similarity < threshold) continue
        const keeper = keeperOf(profiles[left]!.record, profiles[right]!.record)
        const other = keeper.id === profiles[left]!.record.id ? profiles[right]!.record : profiles[left]!.record
        pairs.push({
          keeperId: keeper.id,
          otherId: other.id,
          similarity: round(pair.similarity),
          titleSimilarity: round(pair.titleSimilarity),
          highConfidence: pair.titleSimilarity >= HIGH_CONFIDENCE_TITLE_THRESHOLD,
        })
      }
    }
  }

  pairs.sort(
    (left, right) =>
      right.similarity - left.similarity ||
      left.keeperId.localeCompare(right.keeperId) ||
      left.otherId.localeCompare(right.otherId),
  )
  return pairs.slice(0, Math.max(1, maxPairs))
}

interface Profile {
  record: KnowledgeRecord
  lexical: string
  lexicalTokens: Set<string>
  bodyTokens: Set<string>
}

function profileOf(record: KnowledgeRecord): Profile {
  const lexicalText = `${record.title} ${record.summary}`
  return {
    record,
    lexical: lexicalText,
    lexicalTokens: new Set(tokenize(lexicalText)),
    bodyTokens: shingles(record.body.slice(0, BODY_SAMPLE_BYTES)),
  }
}

function compare(left: Profile, right: Profile): { similarity: number; titleSimilarity: number } {
  const lexical = jaccard(left.lexicalTokens, right.lexicalTokens)
  const body = jaccard(left.bodyTokens, right.bodyTokens)
  return {
    similarity: 0.6 * lexical + 0.4 * body,
    titleSimilarity: bigramJaccard(left.record.title, right.record.title),
  }
}

/** keeper 顺序：version 高 → updatedAt 新 → sourceRefs 多 → id 字典序小。 */
export function keeperOf(left: KnowledgeRecord, right: KnowledgeRecord): KnowledgeRecord {
  if (left.version !== right.version) return left.version > right.version ? left : right
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right
  if (left.sourceRefs.length !== right.sourceRefs.length) {
    return left.sourceRefs.length > right.sourceRefs.length ? left : right
  }
  return left.id <= right.id ? left : right
}

function shingles(text: string): Set<string> {
  const chars = Array.from(text.replace(/\s+/g, ' '))
  const grams = new Set<string>()
  if (chars.length <= 3) {
    if (chars.length > 0) grams.add(chars.join(''))
    return grams
  }
  for (let index = 0; index <= chars.length - 3; index += 1) {
    grams.add(`${chars[index]}${chars[index + 1]}${chars[index + 2]}`)
  }
  return grams
}

function bigramJaccard(left: string, right: string): number {
  return jaccard(bigrams(left), bigrams(right))
}

function bigrams(value: string): Set<string> {
  const chars = Array.from(value.trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''))
  const grams = new Set<string>()
  if (chars.length < 2) {
    if (chars.length === 1) grams.add(chars[0]!)
    return grams
  }
  for (let index = 0; index < chars.length - 1; index += 1) grams.add(`${chars[index]}${chars[index + 1]}`)
  return grams
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
