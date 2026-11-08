/**
 * 候选写入风险标记：只提示，不阻断。
 *
 * Memory Hub 的闸门是「人」——模型只能写 `pending/` 候选，提交必须经 DSH 审批或面板人工点击。
 * 因此这里不做静默拒绝或自动改写，只把可疑形态标出来，交给审批的人判断。
 *
 * 规则刻意保守：宁可在示例文本上误报，也不要漏掉真正的注入/凭据。
 */

export type RiskLevel = 'none' | 'review'

export type RiskCode =
  | 'invisible-characters'
  | 'prompt-injection'
  | 'credential-material'
  | 'override-phrase'

export interface RiskSignal {
  code: RiskCode
  /** 面向人的一句话说明（中文）。 */
  label: string
  /** 命中的片段（截断、脱敏后），便于人在面板里定位。 */
  sample: string
}

export interface ProposalRisk {
  level: RiskLevel
  signals: RiskSignal[]
}

export interface RiskInput {
  title?: string
  summary?: string
  content?: string
  sourceRefs?: readonly string[]
}

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu
const INVISIBLE_NAMES: Record<string, string> = {
  '\u200B': '零宽空格',
  '\u200C': '零宽非连接符',
  '\u200D': '零宽连接符',
  '\u200E': '从左到右标记',
  '\u200F': '从右到左标记',
  '\u202A': '左到右嵌入',
  '\u202B': '右到左嵌入',
  '\u202C': '方向格式结束',
  '\u202D': '左到右覆盖',
  '\u202E': '右到左覆盖',
  '\u2060': '词连接符',
  '\u2061': '函数应用',
  '\u2062': '不可见乘号',
  '\u2063': '不可见分隔符',
  '\u2064': '不可见加号',
  '\uFEFF': 'BOM/零宽不换行空格',
}

/** 中英文注入短语；大小写不敏感。 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /忽略(?:以上|之前|前面|上述|此前)?.{0,6}(?:指令|提示|规则|要求)/u, label: '要求忽略既有指令' },
  { pattern: /(?:无视|跳过).{0,6}(?:系统|安全|审批).{0,4}(?:指令|提示|规则)/u, label: '要求绕过系统/审批规则' },
  { pattern: /(?:你现在是|从现在开始你(?:是|要)|你的新(?:身份|角色)是)/u, label: '试图改写模型身份' },
  { pattern: /(?:system\s*prompt|系统提示词?|开发者指令)/iu, label: '提及系统提示词' },
  { pattern: /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)/i, label: 'asks to ignore earlier instructions' },
  { pattern: /disregard\s+(?:the\s+)?(?:system|previous|prior|above)/i, label: 'asks to disregard system/previous context' },
  { pattern: /you\s+are\s+now\s+(?:a|an|the|in)\b/i, label: 'rewrites the model identity' },
  { pattern: /<\|(?:im_start|im_end|system|assistant)\|>/i, label: '聊天模板控制符' },
]

/** 行首角色伪造：候选正文伪装成新一轮对话。 */
const OVERRIDE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^\s*(?:system|assistant|developer)\s*[:：]/im, label: '行首伪造 system/assistant 角色' },
  { pattern: /^\s*<\/?(?:instructions?|system|prompt)>/im, label: '伪造指令闭合标签' },
  { pattern: /\[\/?(?:INST|SYS)\]|<<\/?SYS>>/i, label: 'Llama 风格指令标记' },
]

const CREDENTIAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/, label: 'OpenAI 风格密钥（sk-…）' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, label: 'GitHub token' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key id' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '私钥块' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/, label: 'JWT' },
  {
    pattern: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|private[_-]?token)\s*[:=]\s*\S{6,}/i,
    label: '形如 password=/token= 的凭据赋值',
  },
]

function clip(value: string, max = 60): string {
  const flat = value.replace(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

function firstMatch(patterns: Array<{ pattern: RegExp; label: string }>, text: string): RiskSignal[] {
  const signals: RiskSignal[] = []
  for (const { pattern, label } of patterns) {
    const match = pattern.exec(text)
    if (match !== null) signals.push({ code: 'prompt-injection', label, sample: clip(match[0]) })
  }
  return signals
}

function scanInvisible(text: string): RiskSignal | null {
  INVISIBLE.lastIndex = 0
  const chars = new Set<string>()
  for (const match of text.matchAll(INVISIBLE)) {
    const char = match[0]
    chars.add(INVISIBLE_NAMES[char] ?? '不可见字符')
    if (chars.size >= 3) break
  }
  if (chars.size === 0) return null
  return {
    code: 'invisible-characters',
    label: `包含不可见/方向控制字符（${[...chars].join('、')}）`,
    sample: `${chars.size} 类`,
  }
}

/**
 * 评估一条候选的风险。`level` 只区分「无」与「需人工确认」：
 * 所有命中都值得人看一眼，但不该自动拒绝，也不该降级成静默丢弃。
 */
export function assessProposalRisk(input: RiskInput): ProposalRisk {
  const text = [input.title ?? '', input.summary ?? '', input.content ?? '', ...(input.sourceRefs ?? [])].join('\n')
  if (text.trim() === '') return { level: 'none', signals: [] }

  const signals: RiskSignal[] = []
  const invisible = scanInvisible(text)
  if (invisible !== null) signals.push(invisible)

  for (const signal of firstMatch(INJECTION_PATTERNS, text)) signals.push(signal)

  const credentialSignals: RiskSignal[] = []
  for (const { pattern, label } of CREDENTIAL_PATTERNS) {
    const match = pattern.exec(text)
    if (match !== null) credentialSignals.push({ code: 'credential-material', label, sample: clip(match[0], 24) })
  }
  signals.push(...credentialSignals)

  for (const { pattern, label } of OVERRIDE_PATTERNS) {
    const match = pattern.exec(text)
    if (match !== null) signals.push({ code: 'override-phrase', label, sample: clip(match[0]) })
  }

  // 同一类里同一 label 只留一条，避免长正文重复刷屏。
  const seen = new Set<string>()
  const unique = signals.filter((signal) => {
    const key = `${signal.code}:${signal.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { level: unique.length === 0 ? 'none' : 'review', signals: unique }
}

/** 工具/账本用的紧凑描述。 */
export function describeRisk(risk: ProposalRisk): string | null {
  if (risk.level === 'none') return null
  return risk.signals.map((signal) => signal.label).join('；')
}
