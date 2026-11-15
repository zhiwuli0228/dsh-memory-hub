/**
 * Golden set 评测基线（V0.8：改检索之前先有尺子）。
 *
 * 数据集从账本引用数据反推：被 memory_cite 引用最多的前 N 条 accepted 知识
 * 构成 golden 集合；每条用其标题构造查询（乐观上界——标题天然在正文与索引里；
 * golden 集人工化后替换此查询构造器）；期望该条目出现在 top-K。
 *
 * 可见性语义：project:* 条目只对自己的工作区可见（金字塔回退另算）。每条
 * golden 条目以**它自己的作用域身份**检索——project:dsh-x 的条目用 cwd=合成
 * 目录 `<hubRoot>/dsh-x` 的身份检索，global 条目用任一身份。
 *
 * 量化目标：改 BM25/CJK 调参、加向量派生层、注入分级之前后各跑一次，
 * 对比 hit@1 / hit@K，避免"感觉更好"式的检索改动。
 *
 * 只读：不写 pending、不 commit、不联网。用法：
 *   memory-hub eval-golden --root <hubRoot> [--top 20] [--k 5] [--json out.json] [--markdown out.md]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { PACKAGE_VERSION } from '../version.js'
import { openMemoryHubForTransport, type TransportHandle } from '../transport/hub-handle.js'

export interface GoldenSetOptions {
  root: string
  top: number
  k: number
  json?: string | null
  markdown?: string | null
}

export interface GoldenSetRow {
  knowledgeId: string
  citations: number
  title: string
  query: string
  /** 检索身份（cwd basename）：project 条目用自身工作区，global 条目用任一身份。 */
  identity: string
  /** 目标条目在 top-K 中的名次（1 起）；未进 top-K 为 null。 */
  hit: number | null
}

export interface IdentityBreakdown {
  identity: string
  rows: number
  hitAt1: number
  hitAtK: number
}

export interface GoldenSetReport {
  generatedAt: string
  packageVersion: string
  root: string
  top: number
  k: number
  goldenCount: number
  skipped: number
  hitAt1: number
  hitAtK: number
  hitAt1Rate: number
  hitAtKRate: number
  identities: IdentityBreakdown[]
  note: string
  rows: GoldenSetRow[]
}

function citationCounts(events: Array<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const event of events) {
    if (event.type === 'citation.added' && typeof event.knowledgeId === 'string') {
      counts.set(event.knowledgeId, (counts.get(event.knowledgeId) ?? 0) + 1)
    }
  }
  return counts
}

export async function runGoldenSet(options: GoldenSetOptions): Promise<GoldenSetReport> {
  const root = resolve(options.root)
  const hubIdentity = basename(root)

  // 第一遍：收集 golden 行（id / 引用数 / 标题 / 作用域），用 hub 身份读详情。
  const seed = await openMemoryHubForTransport({ root })
  interface Draft { knowledgeId: string; citations: number; title: string; scope: string }
  const drafts: Draft[] = []
  let skipped = 0
  try {
    const ledgerText = await readFile(resolve(root, 'records', 'ledger.jsonl'), 'utf8')
    const events = ledgerText
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    const counts = citationCounts(events)
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, options.top)
    for (const [knowledgeId, citations] of ranked) {
      let title: string | null = null
      let scope = 'global'
      try {
        const detail = seed.service.knowledgeDetail(knowledgeId)
        if (detail !== null) {
          title = (detail.metadata as { title?: string }).title ?? null
          scope = (detail.metadata as { scope?: string }).scope ?? 'global'
        }
      } catch {
        title = null
      }
      if (title === null) {
        skipped += 1 // 已 supersede / 跨 hub 不可达：跳过
        continue
      }
      drafts.push({ knowledgeId, citations, title, scope })
    }
  } finally {
    await seed.dispose()
  }

  // 检索身份：project:<ws> 条目用 ws 身份；global 条目借第一个身份（global 处处可见）。
  const identities: string[] = []
  for (const draft of drafts) {
    if (draft.scope.startsWith('project:')) {
      const id = draft.scope.slice('project:'.length)
      if (!identities.includes(id)) identities.push(id)
    }
  }
  const globalIdentity = identities[0] ?? hubIdentity

  const handles = new Map<string, TransportHandle>()
  const handleFor = async (identity: string): Promise<TransportHandle> => {
    const existing = handles.get(identity)
    if (existing !== undefined) return existing
    // 合成身份：cwd 目录名 = 工作区 id（hub-handle 按 DSH runtime 语义合成工作区）。
    const cwd = identity === hubIdentity ? root : join(root, '_ws', identity)
    const handle = await openMemoryHubForTransport({ root, cwd })
    handles.set(identity, handle)
    return handle
  }

  try {
    const rows: GoldenSetRow[] = []
    for (const draft of drafts) {
      const identity = draft.scope.startsWith('project:')
        ? draft.scope.slice('project:'.length)
        : globalIdentity
      const handle = await handleFor(identity)
      const result = await handle.service.search(handle.agent, { query: draft.title, limit: options.k, statuses: ['accepted'] })
      const hitIndex = result.hits.findIndex((hit) => hit.id === draft.knowledgeId)
      rows.push({
        knowledgeId: draft.knowledgeId,
        citations: draft.citations,
        title: draft.title,
        query: draft.title,
        identity,
        hit: hitIndex === -1 ? null : hitIndex + 1,
      })
    }

    const hitAt1 = rows.filter((row) => row.hit === 1).length
    const hitAtK = rows.filter((row) => row.hit !== null && row.hit <= options.k).length
    const identitiesBreakdown: IdentityBreakdown[] = identities.map((identity) => {
      const identityRows = rows.filter((row) => row.identity === identity)
      return {
        identity,
        rows: identityRows.length,
        hitAt1: identityRows.filter((row) => row.hit === 1).length,
        hitAtK: identityRows.filter((row) => row.hit !== null && row.hit <= options.k).length,
      }
    })

    const report: GoldenSetReport = {
      generatedAt: new Date().toISOString(),
      packageVersion: PACKAGE_VERSION,
      root,
      top: options.top,
      k: options.k,
      goldenCount: rows.length,
      skipped,
      hitAt1,
      hitAtK,
      hitAt1Rate: rows.length === 0 ? 0 : Number((hitAt1 / rows.length).toFixed(4)),
      hitAtKRate: rows.length === 0 ? 0 : Number((hitAtK / rows.length).toFixed(4)),
      identities: identitiesBreakdown,
      note: `query 由标题反推，属乐观上界；每条以自身作用域身份检索（project:<ws> 用 ws，global 借第一个身份）。命中定义：目标条目出现在 top-K。`,
      rows,
    }

    if (options.json !== undefined && options.json !== null) {
      await mkdir(dirname(resolve(options.json)), { recursive: true })
      await writeFile(resolve(options.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    }
    if (options.markdown !== undefined && options.markdown !== null) {
      const lines = [
        `# Golden set 基线（${report.generatedAt.slice(0, 10)}）`,
        '',
        `- hub: \`${root}\` · golden 条目 ${report.goldenCount}（跳过 ${report.skipped}）· K=${options.k} · memory-hub@${PACKAGE_VERSION}`,
        `- **hit@1 = ${report.hitAt1}/${report.goldenCount}（${(report.hitAt1Rate * 100).toFixed(1)}%）** · hit@${options.k} = ${report.hitAtK}/${report.goldenCount}（${(report.hitAtKRate * 100).toFixed(1)}%）`,
        ...identitiesBreakdown.map(
          (identity) => `  - 身份 ${identity.identity}：${identity.hitAt1}/${identity.rows} @1 · ${identity.hitAtK}/${identity.rows} @${options.k}`,
        ),
        '',
        '| 引用 | ID | 身份 | hit | 标题 |',
        '| ---: | --- | --- | --- | --- |',
        ...rows.map((row) => `| ${row.citations} | ${row.knowledgeId} | ${row.identity} | ${row.hit === null ? '✗' : row.hit} | ${row.title.replace(/\|/g, '/')} |`),
        '',
        '> query 由标题反推（乐观上界）。改检索前后各跑一次对比；golden 集人工化后此上界会下修。',
      ]
      await mkdir(dirname(resolve(options.markdown)), { recursive: true })
      await writeFile(resolve(options.markdown), `${lines.join('\n')}\n`, 'utf8')
    }
    return report
  } finally {
    for (const handle of handles.values()) await handle.dispose()
  }
}
