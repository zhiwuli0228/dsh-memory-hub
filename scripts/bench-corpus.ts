/**
 * 检索基准的确定性语料（Zipf 词频 + 中英混排），供 bench-search 与临时探测脚本共用。
 * 不参与插件运行时代码。
 */
import type { KnowledgeRecord } from '../src/types.js'

const HAN =
  '预检记忆作用域索引检索插件宿主会话蒸馏回顾审批候选账本面板配置工作区核心权限上传超时缓存并发重试限流日志排障部署发布数据库查询倒排分词相似度合并时效过期降权证据接口协议版本迁移测试用例回归性能压测内存'

export const TERMS: string[] = []
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

export function pickTerm(random: () => number): string {
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

/** 确定性 PRNG，保证不同规模/不同引擎看到同一批文本。 */
export function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sentence(random: () => number, terms: number): string {
  const parts: string[] = []
  for (let index = 0; index < terms; index += 1) parts.push(pickTerm(random))
  return `${parts.join('，')}。`
}

export function makeRecord(index: number, random: () => number): KnowledgeRecord {
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
    scope:
      index % 3 === 0
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

export function corpus(size: number): KnowledgeRecord[] {
  const random = mulberry32(42)
  return Array.from({ length: size }, (_, index) => makeRecord(index, random))
}
