/**
 * 检索规模基准：内存倒排（现状）vs SQLite FTS5 纯检索 vs 派生 SQLite 索引
 * （FTS5 取候选 + 同一份 JS 精确打分）。
 *
 * 运行：
 *   npx vite-node scripts/bench-search.ts
 *   npx vite-node scripts/bench-search.ts --sizes 1000,5000 --queries 5
 *
 * 只读、临时目录，不碰真实 Hub。数字用于 docs/04-development/search-performance.md。
 */
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { SqliteIndex } from '../src/index-sqlite.js'
import { KnowledgeIndex, tokenize } from '../src/search.js'
import type { KnowledgeRecord } from '../src/types.js'
import { TERMS, corpus } from './bench-corpus.js'

interface BenchOptions {
  sizes: number[]
  queriesPerSize: number
  candidateLimit: number
}

function parseArgs(argv: string[]): BenchOptions {
  const options: BenchOptions = { sizes: [1000, 5000, 20000, 50000], queriesPerSize: 20, candidateLimit: 2000 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--sizes' && argv[index + 1] !== undefined) {
      options.sizes = argv[index + 1]!.split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isFinite)
      index += 1
    } else if (arg === '--queries' && argv[index + 1] !== undefined) {
      options.queriesPerSize = Number.parseInt(argv[index + 1]!, 10)
      index += 1
    } else if (arg === '--candidates' && argv[index + 1] !== undefined) {
      options.candidateLimit = Number.parseInt(argv[index + 1]!, 10)
      index += 1
    }
  }
  return options
}

const QUERIES: string[] = Array.from({ length: 20 }, (_, index) =>
  `${TERMS[(index * 5) % 30]!} ${TERMS[(index * 11 + 3) % 30]!}`)

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
  /** 查询平均触碰的候选数（postings 行数之和 / FTS5 命中数）。 */
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
        candidateTotal += tokens.reduce((sum, token) => sum + (postings.get(token)?.size ?? 0), 0)
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

/** 纯 FTS5 检索（只算命中数，不做我们的打分），作为候选检索的成本下限。 */
async function benchFts5(records: KnowledgeRecord[], queries: readonly string[]): Promise<EngineResult | null> {
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
  for (const record of records) {
    insert.run(record.id, tokenize(`${record.title} ${record.title} ${record.title} ${record.tags.join(' ')} ${record.tags.join(' ')} ${record.summary} ${record.summary} ${record.body}`).join(' '))
  }
  const buildMs = performance.now() - buildStart
  const select = db.prepare('SELECT id FROM docs WHERE docs MATCH ?')
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
    name: 'sqlite FTS5 (matches only)',
    size: records.length,
    buildMs,
    heapDelta: null,
    diskBytes: null,
    p50: percentile(steady, 0.5),
    p95: percentile(steady, 0.95),
    avgHits: hitTotal / queries.length,
    avgTopScore: 0,
    avgCandidates: 0,
  }
}

async function benchSqliteIndex(
  records: KnowledgeRecord[],
  queries: readonly string[],
  candidateLimit: number,
): Promise<EngineResult | null> {
  const dir = await mkdtemp(join(tmpdir(), 'dmh-bench-index-'))
  const path = join(dir, 'index.sqlite')
  try {
    const byId = new Map(records.map((record) => [record.id, record]))
    const outcome = await SqliteIndex.open({
      path,
      fingerprint: 'bench:0',
      recordOf: (id) => byId.get(id),
      candidateLimit,
    })
    if (!('index' in outcome)) return null
    const index = outcome.index
    const buildStart = performance.now()
    await index.rebuild(
      (async function* iterate() {
        yield* records
      })(),
    )
    index.setFingerprint('bench:0')
    const buildMs = performance.now() - buildStart
    const diskBytes = (await stat(path)).size

    const latencies: number[] = []
    let hitTotal = 0
    let topScoreTotal = 0
    let candidateTotal = 0
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
          candidateTotal += (index as unknown as { lastCandidateCount: number }).lastCandidateCount ?? 0
        }
      }
    }
    index.close()
    const steady = latencies.slice(queries.length)
    return {
      name: 'sqlite index (FTS5 + JS score)',
      size: records.length,
      buildMs,
      heapDelta: null,
      diskBytes,
      p50: percentile(steady, 0.5),
      p95: percentile(steady, 0.95),
      avgHits: hitTotal / queries.length,
      avgTopScore: topScoreTotal / queries.length,
      avgCandidates: candidateTotal / queries.length,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const rows: EngineResult[] = []
  const queries = QUERIES.slice(0, options.queriesPerSize)

  for (const size of options.sizes) {
    const records = corpus(size)
    const avgBody = records.reduce((sum, record) => sum + record.body.length, 0) / records.length
    console.log(`\n=== ${size} docs (avg body ${avgBody.toFixed(0)} chars) ===`)

    const memory = benchMemoryIndex(records, queries)
    rows.push(memory)
    console.log(
      `memory : build ${memory.buildMs.toFixed(0)}ms  heap ~${memory.heapDelta === null ? 'n/a' : mb(memory.heapDelta)}` +
      `  p50 ${memory.p50.toFixed(2)}ms  p95 ${memory.p95.toFixed(2)}ms  candidates ~${Math.round(memory.avgCandidates)}` +
      `  top score ~${memory.avgTopScore.toFixed(2)}`,
    )

    const fts = await benchFts5(records, queries)
    if (fts === null) {
      console.log('fts5   : node:sqlite unavailable')
    } else {
      rows.push(fts)
      console.log(
        `fts5   : build ${fts.buildMs.toFixed(0)}ms  p50 ${fts.p50.toFixed(2)}ms  p95 ${fts.p95.toFixed(2)}ms  matches ~${fts.avgHits.toFixed(0)}`,
      )
    }

    const derived = await benchSqliteIndex(records, queries, options.candidateLimit)
    if (derived === null) {
      console.log('derived: node:sqlite unavailable')
    } else {
      rows.push(derived)
      console.log(
        `derived: build ${derived.buildMs.toFixed(0)}ms  db ~${derived.diskBytes === null ? 'n/a' : mb(derived.diskBytes)}` +
        `  p50 ${derived.p50.toFixed(2)}ms  p95 ${derived.p95.toFixed(2)}ms  hits ~${derived.avgHits.toFixed(1)}` +
        `  candidates ~${Math.round(derived.avgCandidates)}  top score ~${derived.avgTopScore.toFixed(2)}`,
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
