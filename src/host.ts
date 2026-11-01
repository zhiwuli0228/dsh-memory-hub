/**
 * Minimal structural types for the DeepSeek Harness host surface this plugin
 * uses. They are deliberately local (no imports from `@deepseek-ai/*`) so the
 * bundle stays portable and never pins a host package version at runtime.
 *
 * Verified against DSH Desktop Runtime 0.2.1-rc.5 on 2026-11-01.
 */

export interface ContentBlock {
  type: string
  text?: string
  [key: string]: unknown
}

export interface UserMessage {
  role: 'user'
  content: ContentBlock[]
  source?: { kind?: string; [key: string]: unknown }
  [key: string]: unknown
}

export interface SessionLike {
  readonly id: string
  readonly seq?: number
}

export interface AgentLike {
  readonly id: string
  readonly ctx: Context
  readonly session: SessionLike
}

export interface PromptContext {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: unknown) => string)
  readonly interpolate?: boolean
  readonly required?: boolean
}

export interface SystemPromptService {
  context(context: PromptContext): () => void
}

export interface ToolOutputDefinition {
  readonly schema: Record<string, unknown>
  render(args: unknown, value: unknown): ContentBlock[]
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  isConcurrencySafe?(args: unknown): boolean
  timeoutMs?: number
}

export interface ToolRegistry {
  register(definition: ToolDefinition): () => void
  get(name: string, scope?: unknown): ToolDefinition | undefined
}

export interface ToolRunContext {
  readonly callId?: string
  readonly name: string
  readonly arguments: unknown
  readonly agent?: AgentLike
  readonly signal?: AbortSignal
}

export type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string; info?: { name: string; code: string; reason?: string } }
  | { kind: 'cancel' }
  | { kind: 'ask'; reason?: string; displayReason?: { en: string; [locale: string]: string } }

export interface WorkingDirectoryService {
  readonly defaultDirectory?: string
  get(session: SessionLike): string
}

export interface WorkspaceLike {
  readonly id: string
  readonly path?: string
  readonly root?: string
}

export interface WorkspaceRegistryService {
  resolveByPath(path: string): Promise<WorkspaceLike | undefined>
  list?(): WorkspaceLike[]
}

export interface TokenMeterService {
  estimateMessage(message: unknown): number
}

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug?(...args: unknown[]): void
}

export interface Context {
  readonly tools: ToolRegistry
  readonly systemPrompt?: SystemPromptService
  readonly workingDirectory?: WorkingDirectoryService
  readonly workspaceRegistry?: WorkspaceRegistryService
  readonly tokenMeter?: TokenMeterService
  readonly logger: Logger
  get(name: string): unknown
  on(
    name: string,
    listener: (...args: any[]) => unknown,
    options?: { prepend?: boolean },
  ): () => void
  effect(execute: () => (() => void) | void, label?: string): () => void
  inject(deps: string[], callback: (ctx: Context) => void): void
}

export type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: true }

export interface PreStepPayload {
  readonly agent: AgentLike
  readonly messages: UserMessage[]
  readonly turn: number
  readonly step: number
  readonly signal?: AbortSignal
}

export interface TurnStoppingPayload {
  readonly agent: AgentLike
  readonly turn: number
  readonly signal?: AbortSignal
}

export interface CreatedPayload {
  readonly agent: AgentLike
  readonly source?: string
  readonly signal?: AbortSignal
}

export interface DisposedPayload {
  readonly agent: AgentLike
}

export interface PluginConfigShape {
  root?: string
  readOnly?: boolean
}

export interface HttpRequestLike {
  readonly method?: string
  readonly url?: string
  readonly socket?: { readonly remoteAddress?: string }
  on?(event: string, listener: (...args: any[]) => void): this
}

export interface HttpResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
  readonly writableEnded?: boolean
}

export interface WebServerService {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: HttpRequestLike, response: HttpResponseLike) => void | Promise<void>
  }): () => void
  getOrigin?(): string
}
