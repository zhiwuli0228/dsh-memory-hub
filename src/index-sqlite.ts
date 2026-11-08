import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  bm25Term,
  indexEntryOf,
  queryTokensOf,
  rankScored,
  searchSetup,
  type IndexEntry,
  type SearchFilters,
  type SearchIndex,
} from './search.js'
import { nowIso } from './time.js'
import type { KnowledgeHit, KnowledgeRecord, KnowledgeStatus } from './types.js'

/** 索引结构版本：改表结构或分词口径时必须 +1，启动时对不上就重建。 */
export const SQLITE_INDEX_FORMAT = 1

/** 默认每轮最多取多少个 FTS5 候选进入精确打分（可用 storage.index_candidate_limit 覆盖）。 */
export const DEFAULT_CANDIDATE_LIMIT = 5000

interface SqliteStatement {
  run(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
}

interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

export interface SqliteIndexOptions {
  /** 数据库文件路径（`<hub>/records/index.sqlite`）。 */
  path: string
  /** 文档元数据在内存里仍是权威：正文与作用域从 `docs` 取，索引只存词元与长度。 */
  recordOf: (id: string) => KnowledgeRecord | undefined
  /**
   * 启动时观测到的数据指纹（条目数 + 目录最近 mtime）。与库里记录不一致说明
   * 文件被外部改动过，索引需要重建。
   */
  fingerprint: string
  /** 每轮进入精确打分的候选上限。小 Hub 全量打分，结果与内存索引逐位一致。 */
  candidateLimit?: number
}

export type SqliteOpenOutcome =
  | { index: SqliteIndex; rebuilt: boolean }
  | { reason: string }

/**
 * `docs_fts` 是 contentless FTS5：只存倒排，不存正文。
 * 查询先由 FTS5 取候选（C 实现），再由 `rankScored` 用与内存索引完全相同的
 * BM25-lite + 加成/时效公式精排——排序逻辑只有一份。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  length INTEGER NOT NULL,
  tokens TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_ms INTEGER,
  valid_from_ms INTEGER,
  expires_at_ms INTEGER,
  last_verified_ms INTEGER,
  title_norm TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS terms (
  token TEXT PRIMARY KEY,
  df INTEGER NOT NULL
) WITHOUT ROWID;
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  tokens,
  content='',
  tokenize='unicode61'
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS docs_status ON docs(status);
`

/** 统计 `needle` 在 `haystack` 中的出现次数（needle 已带词元边界空格）。 */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let position = haystack.indexOf(needle)
  while (position !== -1) {
    count += 1
    position = haystack.indexOf(needle, position + needle.length - 1)
  }
  return count
}

/** 把 token→tf 展开成空格分隔的词元串：既给 FTS5 建倒排，也用于还原 tf。 */
function tokenTextOf(tokens: Map<string, number>): string {
  const parts: string[] = []
  for (const [token, count] of tokens) {
    for (let index = 0; index < count; index += 1) parts.push(token)
  }
  return parts.join(' ')
}

export class SqliteIndex implements SearchIndex {
  private entryCount = 0
  private totalLength = 0
  private inTransaction = false
  /** 最近一次检索实际取到的候选数，用于诊断与基准。 */
  lastCandidateCount = 0
  private readonly candidateLimit: number
  private readonly stmts: {
    insertDoc: SqliteStatement
    insertFts: SqliteStatement
    deleteFts: SqliteStatement
    deleteDoc: SqliteStatement
    docByRowid: SqliteStatement
    docById: SqliteStatement
    lastRowid: SqliteStatement
    termDf: SqliteStatement
    termInc: SqliteStatement
    termDec: SqliteStatement
    termPrune: SqliteStatement
    metaGet: SqliteStatement
    metaSet: SqliteStatement
    deleteAllDocs: SqliteStatement
    deleteAllTerms: SqliteStatement
  }

  private constructor(
    private readonly db: SqliteDatabase,
    private readonly options: SqliteIndexOptions,
  ) {
    this.candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT
    this.stmts = {
      insertDoc: db.prepare(
        'INSERT INTO docs(id, length, tokens, type, status, updated_ms, valid_from_ms, expires_at_ms, last_verified_ms, title_norm)' +
          ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ),
      insertFts: db.prepare('INSERT INTO docs_fts(rowid, tokens) VALUES (?, ?)'),
      deleteFts: db.prepare("INSERT INTO docs_fts(docs_fts, rowid, tokens) VALUES ('delete', ?, ?)"),
      deleteDoc: db.prepare('DELETE FROM docs WHERE rowid = ?'),
      docByRowid: db.prepare(
        'SELECT rowid, id, length, tokens, updated_ms, valid_from_ms, expires_at_ms, last_verified_ms, title_norm FROM docs WHERE rowid = ?',
      ),
      docById: db.prepare(
        'SELECT rowid, id, length, tokens, updated_ms, valid_from_ms, expires_at_ms, last_verified_ms, title_norm FROM docs WHERE id = ?',
      ),
      lastRowid: db.prepare('SELECT last_insert_rowid() AS rowid'),
      termDf: db.prepare('SELECT df FROM terms WHERE token = ?'),
      termInc: db.prepare('INSERT INTO terms(token, df) VALUES (?, 1) ON CONFLICT(token) DO UPDATE SET df = df + 1'),
      termDec: db.prepare('UPDATE terms SET df = df - 1 WHERE token = ?'),
      termPrune: db.prepare('DELETE FROM terms WHERE token = ? AND df <= 0'),
      metaGet: db.prepare('SELECT value FROM meta WHERE key = ?'),
      metaSet: db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)'),
      deleteAllDocs: db.prepare('DELETE FROM docs'),
      deleteAllTerms: db.prepare('DELETE FROM terms'),
    }
  }

  get size(): number {
    return this.entryCount
  }

  /**
   * 打开（必要时重建）索引。`node:sqlite` 不可用的运行时直接返回原因，由调用方
   * 回退内存索引——这条路径不能影响启动。
   */
  static async open(options: SqliteIndexOptions): Promise<SqliteOpenOutcome> {
    let DatabaseSync: (new (path: string) => SqliteDatabase) | undefined
    try {
      // 动态导入：Node 20 没有 node:sqlite，静态 import 会让整个插件起不来。
      const module = (await import('node:sqlite')) as unknown as {
        DatabaseSync?: new (path: string) => SqliteDatabase
      }
      DatabaseSync = module.DatabaseSync
    } catch {
      return { reason: 'node:sqlite is not available in this Node.js runtime' }
    }
    if (DatabaseSync === undefined) return { reason: 'node:sqlite did not export DatabaseSync' }

    let db: SqliteDatabase | null = null
    try {
      await mkdir(dirname(options.path), { recursive: true })
      db = new DatabaseSync(options.path)
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA synchronous = NORMAL')
      db.exec(SCHEMA)
    } catch (error) {
      // 打开失败时也要关掉句柄，否则 Windows 上文件会被锁住。
      try {
        db?.close()
      } catch {
        // 已经关闭：忽略。
      }
      return { reason: `cannot open ${options.path}: ${(error as Error).message}` }
    }
    if (db === null) return { reason: `cannot open ${options.path}` }

    const index = new SqliteIndex(db, options)
    try {
      const format = index.getMeta('format_version')
      const fingerprint = index.getMeta('fingerprint')
      const count = Number(index.getMeta('entry_count') ?? '0')
      const totalLength = Number(index.getMeta('total_length') ?? '0')
      const reusable =
        format === String(SQLITE_INDEX_FORMAT) &&
        fingerprint === options.fingerprint &&
        Number.isFinite(count) &&
        Number.isFinite(totalLength)
      if (reusable) {
        index.entryCount = count
        index.totalLength = totalLength
        return { index, rebuilt: false }
      }
      index.reset()
      return { index, rebuilt: true }
    } catch (error) {
      // 结构损坏（半截文件、旧表结构）：清空重建，不让坏索引挡住启动。
      try {
        db.exec('DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS terms; DROP TABLE IF EXISTS docs_fts; DROP TABLE IF EXISTS meta')
        db.exec(SCHEMA)
        index.reset()
        return { index, rebuilt: true }
      } catch {
        return { reason: `index is unusable and cannot be rebuilt: ${(error as Error).message}` }
      }
    }
  }

  add(record: KnowledgeRecord): void {
    const entry = indexEntryOf(record)
    this.transaction(() => this.insertEntry(record, entry, true))
  }

  remove(id: string): void {
    const row = this.stmts.docById.get(id) as DocRow | undefined
    if (row === undefined) return
    this.transaction(() => this.deleteEntry(row, true))
  }

  clear(): void {
    this.transaction(() => {
      // FTS5 的 contentless 表要逐行发 delete 命令，否则倒排会残留。
      const rows = this.db.prepare('SELECT rowid, tokens FROM docs').all() as Array<{ rowid: number; tokens: string }>
      for (const row of rows) this.stmts.deleteFts.run(row.rowid, row.tokens)
      this.stmts.deleteAllDocs.run()
      this.stmts.deleteAllTerms.run()
      this.entryCount = 0
      this.totalLength = 0
      this.writeCounters()
    })
  }

  /** 重建时把整批写入包在一个事务里：df 在内存累计后一次性写入。 */
  async rebuild(records: AsyncIterable<KnowledgeRecord>): Promise<void> {
    this.reset()
    const df = new Map<string, number>()
    this.db.exec('BEGIN')
    this.inTransaction = true
    try {
      for await (const record of records) {
        const entry = indexEntryOf(record)
        this.insertEntry(record, entry, false)
        for (const token of entry.tokens.keys()) df.set(token, (df.get(token) ?? 0) + 1)
      }
      this.writeDf(df)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    } finally {
      this.inTransaction = false
    }
  }

  /** 启动加载完成后写入本次观测到的指纹，供下次启动判断是否需要重建。 */
  setFingerprint(fingerprint: string): void {
    this.transaction(() => {
      this.writeMeta('fingerprint', fingerprint)
      this.writeMeta('format_version', String(SQLITE_INDEX_FORMAT))
      this.writeMeta('built_at', nowIso())
      this.writeCounters()
    })
  }

  search(query: string, filters: SearchFilters): KnowledgeHit[] {
    const tokens = queryTokensOf(query)
    if (tokens.length === 0) return []
    const setup = searchSetup(query, filters, this.entryCount, this.totalLength)
    const df = new Map<string, number>()
    for (const token of tokens) df.set(token, this.termDf(token))
    const rows = this.candidates(tokens, filters)
    const needles = tokens.map((token) => ` ${token} `)
    const self = this
    return rankScored(
      filters,
      setup,
      tokens,
      (function* scored() {
        for (const row of rows) {
          const entry = self.entryOf(row)
          if (entry === undefined) continue
          // tokens 是空格分隔的词元串：按「词元边界」数出现次数，避免 split 出几十万个临时字符串。
          const padded = ` ${row.tokens} `
          let baseScore = 0
          for (const [position, token] of tokens.entries()) {
            const termDf = df.get(token) ?? 0
            if (termDf === 0) continue
            const tf = countOccurrences(padded, needles[position]!)
            if (tf === 0) continue
            baseScore += bm25Term(tf, termDf, self.entryCount, row.length, setup.avgLength)
          }
          yield { entry, baseScore }
        }
      })(),
    )
  }

  close(): void {
    this.db.close()
  }

  /** FTS5 只负责取候选：状态/类型过滤 + bm25 取前 N 条 rowid，再回表一次。 */
  private candidates(tokens: readonly string[], filters: SearchFilters): DocRow[] {
    const match = tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ')
    const statuses = [...(filters.statuses ?? new Set<KnowledgeStatus>(['accepted']))]
    const params: unknown[] = [match, this.candidateLimit]
    // 先只取 rowid 排序（FTS5 的 rank 列 = bm25），避免 ORDER BY 过程中拖动宽行。
    let sql =
      'SELECT d.rowid, d.id, d.length, d.tokens, d.updated_ms, d.valid_from_ms, d.expires_at_ms, d.last_verified_ms, d.title_norm' +
      ' FROM docs d JOIN (SELECT rowid FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?) m ON m.rowid = d.rowid' +
      ` WHERE d.status IN (${statuses.map(() => '?').join(', ')})`
    params.push(...statuses)
    if (filters.types !== undefined && filters.types.size > 0) {
      const types = [...filters.types]
      sql += ` AND d.type IN (${types.map(() => '?').join(', ')})`
      params.push(...types)
    }
    const rows = this.db.prepare(sql).all(...params) as DocRow[]
    this.lastCandidateCount = rows.length
    return rows
  }

  private insertEntry(record: KnowledgeRecord, entry: IndexEntry, trackDf: boolean): void {
    const previous = this.stmts.docById.get(record.id) as DocRow | undefined
    if (previous !== undefined) this.deleteEntry(previous, trackDf)
    const tokenText = tokenTextOf(entry.tokens)
    this.stmts.insertDoc.run(
      record.id,
      entry.length,
      tokenText,
      record.type,
      record.status,
      entry.times.updatedAt,
      entry.times.validFrom,
      entry.times.expiresAt,
      entry.times.lastVerified,
      entry.titleNormalized,
    )
    const rowid = Number((this.stmts.lastRowid.get() as { rowid: number }).rowid)
    this.stmts.insertFts.run(rowid, tokenText)
    if (trackDf) {
      for (const token of entry.tokens.keys()) this.stmts.termInc.run(token)
    }
    this.entryCount += 1
    this.totalLength += entry.length
    this.writeCounters()
  }

  private deleteEntry(row: DocRow, trackDf: boolean): void {
    this.stmts.deleteFts.run(row.rowid, row.tokens)
    this.stmts.deleteDoc.run(row.rowid)
    if (trackDf) {
      for (const token of new Set(row.tokens.split(' '))) {
        this.stmts.termDec.run(token)
        this.stmts.termPrune.run(token)
      }
    }
    this.entryCount = Math.max(0, this.entryCount - 1)
    this.totalLength = Math.max(0, this.totalLength - row.length)
    this.writeCounters()
  }

  private writeDf(df: Map<string, number>): void {
    const entries = [...df.entries()]
    for (let index = 0; index < entries.length; index += 500) {
      const chunk = entries.slice(index, index + 500)
      const placeholders = chunk.map(() => '(?, ?)').join(', ')
      this.db.prepare(`INSERT OR REPLACE INTO terms(token, df) VALUES ${placeholders}`).run(...chunk.flat())
    }
  }

  private entryOf(row: DocRow): IndexEntry | undefined {
    const record = this.options.recordOf(row.id)
    // 库里有、内存文档表里没有（例如文件刚被删）：跳过这条候选。
    if (record === undefined) return undefined
    return {
      record,
      length: row.length,
      tokens: new Map(),
      times: {
        updatedAt: row.updated_ms,
        validFrom: row.valid_from_ms,
        expiresAt: row.expires_at_ms,
        lastVerified: row.last_verified_ms,
      },
      titleNormalized: row.title_norm,
    }
  }

  private termDf(token: string): number {
    const row = this.stmts.termDf.get(token) as { df: number } | undefined
    return row?.df ?? 0
  }

  private transaction(fn: () => void): void {
    if (this.inTransaction) {
      fn()
      return
    }
    this.db.exec('BEGIN')
    this.inTransaction = true
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    } finally {
      this.inTransaction = false
    }
  }

  private reset(): void {
    this.stmts.deleteAllDocs.run()
    this.stmts.deleteAllTerms.run()
    // contentless FTS 的 delete 命令需要原 tokens；全量重建时直接重建虚表最省事。
    this.db.exec("INSERT INTO docs_fts(docs_fts) VALUES('delete-all')")
    this.entryCount = 0
    this.totalLength = 0
    this.writeMeta('format_version', String(SQLITE_INDEX_FORMAT))
    this.writeMeta('entry_count', '0')
    this.writeMeta('total_length', '0')
  }

  private writeCounters(): void {
    this.writeMeta('entry_count', String(this.entryCount))
    this.writeMeta('total_length', String(this.totalLength))
  }

  private getMeta(key: string): string | undefined {
    const row = this.stmts.metaGet.get(key) as { value: string } | undefined
    return row?.value
  }

  private writeMeta(key: string, value: string): void {
    this.stmts.metaSet.run(key, value)
  }
}

interface DocRow {
  rowid: number
  id: string
  length: number
  tokens: string
  updated_ms: number | null
  valid_from_ms: number | null
  expires_at_ms: number | null
  last_verified_ms: number | null
  title_norm: string
}
