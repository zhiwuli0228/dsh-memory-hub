import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProposalRecord } from '../src/types.js'
import { Hub } from '../src/hub.js'
import { Ledger } from '../src/ledger.js'
import { KnowledgeStore } from '../src/store.js'
import { serializeProposalFile } from '../src/frontmatter.js'

const count = Number(process.argv[2] ?? 3000)
const root = await mkdtemp(join(tmpdir(), 'dmh-pending-bench-'))
try {
  const hub = await Hub.open({ root, lock: false })
  await mkdir(hub.pendingDir(), { recursive: true })
  const now = new Date().toISOString()
  for (let index = 1; index <= count; index += 1) {
    const id = `PRO-${String(index).padStart(6, '0')}`
    const record: ProposalRecord = {
      id,
      status: 'pending',
      operation: 'create',
      type: 'knowledge',
      scope: { level: 'global' },
      title: `候选 ${index}`,
      summary: '批量萃取产生的候选。',
      tags: ['batch:bench', 'topic:ops'],
      sourceRefs: [`file:notes/${index}.md`],
      related: [],
      supersedes: [],
      appliesTo: { branches: [], versions: [] },
      promotedFrom: null,
      target: null,
      expectedVersion: null,
      reason: null,
      validFrom: null,
      expiresAt: null,
      lastVerified: null,
      mergedIds: [],
      taskId: 'TSK-1',
      createdAt: now,
      updatedAt: now,
      committedTo: null,
      body: '## 结论\n\n批量萃取正文。\n',
      path: '',
      extra: {},
    }
    await writeFile(join(hub.pendingDir(), `${id}.md`), serializeProposalFile(record))
  }

  const store = new KnowledgeStore(hub, new Ledger(hub.ledgerPath()))
  const started = performance.now()
  await store.load()
  const loadMs = performance.now() - started
  console.log(
    JSON.stringify({
      count,
      loadMs: Math.round(loadMs),
      proposals: store.proposals.size,
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
    }),
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
