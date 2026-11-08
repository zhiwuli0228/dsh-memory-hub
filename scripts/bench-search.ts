/**
 * 检索规模基准：内存倒排（现状）vs SQLite FTS5（候选方案）。
 *
 * 运行：
 *   npx vite-node scripts/bench-search.ts
 *   npx vite-node scripts/bench-search.ts --sizes 1000,5000 --queries 5
 *
 * 只读、临时目录，不碰真实 Hub。数字用于 docs/04-development/search-performance.md。
 */
import { performance } from 'node:perf_hooks'
import { KnowledgeIndex, tokenize } from '../src/search.js'
import type { KnowledgeRecord } from '../src/types.js'

interface BenchOptions {
  sizes: number[]
  queriesPerSize: number
}

function parseArgs(argv: string[]): BenchOptions {
  const options: BenchOptions = { sizes: [1000, 5000, 20000, 50000], queriesPerSize: 20 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--sizes' && argv[index + 1] !== undefined) {
      options.sizes = argv[index + 1]!.split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isFinite)
      index += 1
    } else if (arg === '--queries' && argv[index + 1] !== undefined) {
      options.queriesPerSize = Number.parseInt(argv[index + 1]!, 10)
      index += 1
    }
  }
  return options
}

const HAN = '预检记忆作用域索引检索插件宿主会话蒸馏回顾审批候选账本面板配置工作区核心权限上传超时缓存并发重试限流日志排障部署发布数据库查询倒排分词相似度合并时效过期降权证据接口协议版本迁移测试用例回归性能压测内存'
const TERMS: string[] = []
for (let left = 0; left < HAN.length; left += 4) {
  for (let right = 1; right < 12; right += 1) {
    TERMS.push(`${HAN[left]}${HAN[(left + right * 7 + 3) % HAN.length]}`)
  }
}
/** Zipf 权重：前几名覆盖大量文档，长尾只出现少数几次，接近真实语料。 */
const TERM_CUMULATIVE: number[] = []
{
  let total = 0
  for (let rank = 0; rank < TERMS.length; rank += 1) {
    total += 1 / Math.pow(rank + 1, 0.9)
    TERM_CUMULATIVE.push(total)
  }
}

function pickTerm(random: () => number): string {
  const target = random() * TERM_CUMULATIVE[TERM_CUMULATIVE.length - 1]!
  let low = 0
  let high = TERM_CUMULATIVE.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (TERM_CUMULATIVE[middle]! < target) low = middle + 1
    else high = middle
  }
  return TERMS[low]!
}

const QUERIES: string[] = Array.from({ length: 20 }, (_, index) =>
  `${TERMS[(index * 5) % 30]!} ${TERMS[(index * 11 + 3) % 30]!}`) as const

/** 确定性 PRNG，保证不同规模/不同引擎看到同一批文本。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sentence(random: () => number, terms: number): string {
  const parts: string[] = []
  for (let index = 0; index < terms; index += 1) {
    parts.push(pickTerm(random))
  }
  return `${parts.join('，')}。`
}

function makeRecord(index: number, random: () => number): KnowledgeRecord {
  const titleTerms = 2 + Math.floor(random() * 2)
  const title = Array.from({ length: titleTerms }, () => pickTerm(random)).join('')
  const summary = sentence(random, 6 + Math.floor(random() * 4))
  const paragraphs = 3 + Math.floor(random() * 4)
  const body = [
    '## 结论',
    summary,
    '## 证据',
    ...Array.from({ length: paragraphs }, () => sentence(random, 8 + Math.floor(random() * 8))),
    '## 适用与限制',
    sentence(random, 5),
  ].join('\n\n')
  return {
    id: `KNO-${String(index + 1).padStart(6, '0')}`,
    type: (['decision', 'constraint', 'knowledge', 'process', 'api-catalog'] as const)[index % 5]!,
    scope: index % 3 === 0
      ? { level: 'project', workspaceId: 'backend' }
      : index % 3 === 1
        ? { level: 'domain', id: 'dsh' }
        : { level: 'global' },
    status: 'accepted',
    version: 1,
    title,
    summary,
    tags: [pickTerm(random)],
    sourceRefs: ['note:bench'],
    related: [],
    supersedes: [],
    promotedFrom: null,
    appliesTo: { branches: [], versions: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    supersededBy: null,
    format: 1,
    body,
    path: `knowledge/knowledge/KNO-${String(index + 1).padStart(6, '0')}.md`,
    extra: {},
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[position]!
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface EngineResult {
  name: string
  size: number
  buildMs: number
  heapDelta: number | null
  diskBytes: number | null
  p50: number
  p95: number
  avgHits: number
  /** 第一名分数的均值，用来观察 min_score 的绝对阈值是否随规模漂移。 */
  avgTopScore: number
  /** 查询平均触碰的候选数（postings 行数之和 / 过滤候选数）。 */
  avgCandidates: number
}

function benchMemoryIndex(records: KnowledgeRecord[], queries: readonly string[]): EngineResult {
  const heapBefore = process.memoryUsage().heapUsed
  const index = new KnowledgeIndex()
  const buildStart = performance.now()
  for (const record of records) index.add(record)
  const buildMs = performance.now() - buildStart
  const heapDelta = process.memoryUsage().heapUsed - heapBefore
  const postings = (index as unknown as { postings: Map<string, Map<string, number>> }).postings

  const latencies: number[] = []
  let hitTotal = 0
  let candidateTotal = 0
  let topScoreTotal = 0
  for (let round = 0; round < 3; round += 1) {
    for (const query of queries) {
      const start = performance.now()
      const hits = index.search(query, {
        visibility: { global: true, domains: new Set(['dsh']), projects: new Set(['backend']) },
        limit: 8,
      })
      latencies.push(performance.now() - start)
      if (round === 2) {
        hitTotal += hits.length
        topScoreTotal += hits[0]?.score ?? 0
        const tokens = [...new Set(tokenize(query))]
        candidateTotal += records.length + tokens.reduce((sum, token) => sum + (postings.get(token)?.size ?? 0), 0)
      }
    }
  }
  // 丢掉第一轮（冷启动）以观察稳态。
  const steady = latencies.slice(queries.length)
  return {
    name: 'memory BM25-lite',
    size: records.length,
    buildMs,
    heapDelta,
    diskBytes: null,
    p50: percentile(steady, 0.5),
    p95: percentile(steady, 0.95),
    avgHits: hitTotal / queries.length,
    avgTopScore: topScoreTotal / queries.length,
    avgCandidates: candidateTotal / queries.length,
  }
}

function ftsQuery(tokens: readonly string[]): string {
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' AND ')
}

async function benchSqlite(records: KnowledgeRecord[], queries: readonly string[]): Promise<EngineResult | null> {
  let sqlite: typeof import('node:sqlite')
  try {
    sqlite = await import('node:sqlite')
  } catch {
    return null
  }
  const db = new sqlite.DatabaseSync(':memory:')
  db.exec('PRAGMA journal_mode = OFF')
  db.exec('CREATE VIRTUAL TABLE docs USING fts5(id UNINDEXED, tokens, tokenize = "unicode61")')
  const insert = db.prepare('INSERT INTO docs (id, tokens) VALUES (?, ?)')

  const buildStart = performance.now()
  db.exec('BEGIN')
  for (const record of records) {
    const tokens = [
      ...tokenize(record.title), ...tokenize(record.title), ...tokenize(record.title),
      ...tokenize(record.tags.join(' ')), ...tokenize(record.tags.join(' ')),
      ...tokenize(record.summary), ...tokenize(record.summary),
      ...tokenize(record.body),
    ]
    insert.run(record.id, tokens.join(' '))
  }
  db.exec('COMMIT')
  const buildMs = performance.now() - buildStart

  const pageCount = db.prepare('PRAGMA page_count').get() as { page_count: number }
  const pageSize = db.prepare('PRAGMA page_size').get() as { page_size: number }
  const diskBytes = pageCount.page_count * pageSize.page_size

  const select = db.prepare('SELECT id, bm25(docs) AS rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT 8')
  const latencies: number[] = []
  let hitTotal = 0
  for (let round = 0; round < 3; round += 1) {
    for (const query of queries) {
      const tokens = [...new Set(tokenize(query))].slice(0, 8)
      const start = performance.now()
      let rowCount = 0
      try {
        rowCount = select.all(ftsQuery(tokens)).length
      } catch {
        rowCount = 0
      }
      latencies.push(performance.now() - start)
      if (round === 2) hitTotal += rowCount
    }
  }
  db.close()
  const steady = latencies.slice(queries.length)
  return {
    name: 'sqlite FTS5',
    size: records.length,
    buildMs,
    heapDelta: null,
    diskBytes,
    p50: percentile(steady, 0.5),
    p95: percentile(steady, 0.95),
    avgHits: hitTotal / queries.length,
    avgTopScore: 0,
    avgCandidates: 0,
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const rows: EngineResult[] = []
  const queries = QUERIES.slice(0, options.queriesPerSize)

  for (const size of options.sizes) {
    const random = mulberry32(42)
    const records: KnowledgeRecord[] = Array.from({ length: size }, (_, index) => makeRecord(index, random))
    const avgBody = records.reduce((sum, record) => sum + record.body.length, 0) / records.length
    console.log(`\n=== ${size} docs (avg body ${avgBody.toFixed(0)} chars) ===`)

    const memory = benchMemoryIndex(records, queries)
    rows.push(memory)
    console.log(
      `memory : build ${memory.buildMs.toFixed(0)}ms  heap ~${memory.heapDelta === null ? 'n/a' : mb(memory.heapDelta)}` +
      `  p50 ${memory.p50.toFixed(2)}ms  p95 ${memory.p95.toFixed(2)}ms  candidates ~${Math.round(memory.avgCandidates)}` +
      `  top score ~${memory.avgTopScore.toFixed(2)}`,
    )

    const sqlite = await benchSqlite(records, queries)
    if (sqlite === null) {
      console.log('sqlite : node:sqlite unavailable')
    } else {
      rows.push(sqlite)
      console.log(
        `sqlite : build ${sqlite.buildMs.toFixed(0)}ms  db ~${sqlite.diskBytes === null ? 'n/a' : mb(sqlite.diskBytes)}` +
        `  p50 ${sqlite.p50.toFixed(2)}ms  p95 ${sqlite.p95.toFixed(2)}ms  hits ~${sqlite.avgHits.toFixed(1)}`,
      )
    }
  }

  console.log('\n| size | engine | build ms | memory/db | p50 ms | p95 ms | avg hits |')
  console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: |')
  for (const row of rows) {
    const footprint = row.heapDelta !== null ? mb(row.heapDelta) : row.diskBytes !== null ? mb(row.diskBytes) : 'n/a'
    console.log(
      `| ${row.size} | ${row.name} | ${row.buildMs.toFixed(0)} | ${footprint} | ${row.p50.toFixed(2)} | ${row.p95.toFixed(2)} | ${row.avgHits.toFixed(1)} |`,
    )
  }
}

await main()
