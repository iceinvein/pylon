/**
 * Provider abstraction layer for multi-SDK support.
 *
 * Both the Claude Agent SDK and OpenAI Codex SDK are normalized into these
 * shared types. The SessionManager consumes only these interfaces — never
 * SDK-specific imports — keeping the orchestration layer provider-agnostic.
 *
 * Design: Option C (Hybrid) — normalized events carry structured data for
 * the common path, plus an optional `raw` field for provider-specific
 * rendering when the renderer needs full fidelity.
 */

import type { Attachment, EffortLevel, PermissionMode, SessionInitInfo } from '../../shared/types'

// ── Provider Identity ────────────────────────────

export type ProviderId = 'claude' | 'codex'

export type ProviderModel = {
  id: string
  label: string
  provider: ProviderId
  contextWindow: number
  /** Which effort levels are valid for this model */
  supportsEffort: EffortLevel[]
}

// ── Provider Capabilities ────────────────────────

/** Declares what a provider supports so the UI can adapt */
export type ProviderCapabilities = {
  /** Whether the provider supports interactive per-tool permission prompts */
  interactivePermissions: boolean
  /** Whether the provider supports the AskUserQuestion tool */
  askUserQuestion: boolean
  /** Whether the provider reports cost in USD */
  reportsCostUsd: boolean
  /** Whether the provider supports subagent/nested-agent messages */
  subagents: boolean
  /** Whether the provider supports session resume */
  sessionResume: boolean
  /** Whether the provider supports mid-session model switching */
  midSessionModelSwitch: boolean
  /** Whether the provider exposes file checkpointing / rewind */
  fileCheckpointing: boolean
  /** Whether the provider supports plan mode (read-only planning before execution) */
  planMode: boolean
}

// ── Session Configuration ────────────────────────

export type ProviderSessionConfig = {
  cwd: string
  model: string
  effort: EffortLevel
  permissionMode: PermissionMode
  abortController: AbortController
  /** Called when the provider needs user permission for a tool.
   *  Providers that don't support interactive permissions never call this. */
  onPermissionRequest: (
    toolName: string,
    input: Record<string, unknown>,
    suggestions?: unknown[],
  ) => Promise<{ behavior: 'allow' | 'deny'; message?: string }>
  /** Called when the provider needs to ask the user a question (e.g. AskUserQuestion tool). */
  onQuestionRequest: (input: Record<string, unknown>) => Promise<Record<string, string>>
  /** Called before any tool execution, regardless of permission mode.
   *  Used by session manager for git baseline capture, etc. */
  onBeforeToolUse?: (toolName: string, input: Record<string, unknown>) => void
  /** Called when the provider intercepts an ExitPlanMode tool call and needs user approval. */
  onPlanApprovalRequest?: (input: Record<string, unknown>) => Promise<{ approved: boolean }>
  /** SDK-specific session/thread ID for resuming a prior conversation */
  resumeSessionId?: string
  /** Betas/experimental flags to enable */
  betas?: string[]
}

// ── Normalized Event Stream ──────────────────────
//
// Every provider maps its native events into this union. The SessionManager
// consumes these via `for await (const event of session.send(...))` — the
// exact same loop regardless of whether it's Claude or Codex underneath.

export type NormalizedEvent =
  | SessionInitEvent
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | MessageCompleteEvent
  | ToolUseEvent
  | ToolResultEvent
  | FileChangedEvent
  | TasksUpdatedEvent
  | UsageUpdateEvent
  | TurnCompleteEvent
  | StatusEvent
  | ErrorEvent
  | RawPassthroughEvent

/** Provider has started and assigned a session/thread ID */
export type SessionInitEvent = {
  type: 'session_init'
  sessionId: string
  info?: SessionInitInfo
}

/** Incremental text from the assistant (streaming) */
export type TextDeltaEvent = {
  type: 'text_delta'
  text: string
  /** Non-null when this delta belongs to a subagent/nested tool */
  parentToolUseId?: string
}

/** Incremental thinking/reasoning text */
export type ThinkingDeltaEvent = {
  type: 'thinking_delta'
  text: string
  parentToolUseId?: string
}

/** A complete message (assistant turn, user echo, system message).
 *  The `raw` field carries the original SDK message for Option C rendering. */
export type MessageCompleteEvent = {
  type: 'message_complete'
  role: 'assistant' | 'user' | 'system'
  /** Provider-agnostic content blocks */
  content: NormalizedContentBlock[]
  /** Original SDK message for provider-specific rendering (Option C) */
  raw: unknown
  parentToolUseId?: string
}

export type NormalizedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; toolId: string; toolName: string; input: unknown }
  | { type: 'tool_result'; toolId: string; output: string; isError?: boolean }

/** A tool is being invoked */
export type ToolUseEvent = {
  type: 'tool_use'
  toolId: string
  toolName: string
  input: unknown
  parentToolUseId?: string
}

/** A tool has produced output */
export type ToolResultEvent = {
  type: 'tool_result'
  toolId: string
  toolName: string
  output: string
  isError?: boolean
  exitCode?: number
}

/** A file was created, modified, or deleted */
export type FileChangedEvent = {
  type: 'file_changed'
  path: string
  kind: 'add' | 'update' | 'delete'
}

/** Agent's task/todo list was updated */
export type TasksUpdatedEvent = {
  type: 'tasks_updated'
  tasks: Array<{ content: string; status: string }>
}

/** Token usage update (emitted per API call, not per turn) */
export type UsageUpdateEvent = {
  type: 'usage_update'
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
}

/** A turn (query round-trip) has completed with final usage/cost */
export type TurnCompleteEvent = {
  type: 'turn_complete'
  costUsd?: number
  inputTokens: number
  outputTokens: number
  /** Per-model context window sizes reported by the SDK */
  modelContextWindows?: Record<string, number>
  /** Per-model max output token limits reported by the SDK */
  modelMaxOutputTokens?: Record<string, number>
}

/** Provider status change (e.g. 'compacting', 'reasoning') */
export type StatusEvent = {
  type: 'status'
  status: string
}

/** An error occurred */
export type ErrorEvent = {
  type: 'error'
  message: string
  recoverable?: boolean
}

/** Raw SDK message passed through for backward-compatible IPC to the renderer.
 *  During Phase 1 migration, the renderer still consumes raw SDK messages.
 *  Each provider yields these alongside normalized events so the session manager
 *  can forward them to the renderer unchanged while processing NormalizedEvents
 *  for its own bookkeeping. */
export type RawPassthroughEvent = {
  type: 'raw_passthrough'
  /** The original SDK message, forwarded to IPC as-is */
  message: unknown
  /** Whether this message should be persisted to the DB.
   *  stream_event messages are not persisted; all others are. */
  persist: boolean
}

// ── Provider Interface ───────────────────────────

export type AgentProvider = {
  readonly id: ProviderId
  /** Static model catalog — used as fallback when discovery hasn't run yet */
  readonly models: ProviderModel[]
  readonly capabilities: ProviderCapabilities

  /** Create a new agent session with the given configuration */
  createSession(config: ProviderSessionConfig): AgentSession

  /**
   * Discover models dynamically by querying the provider's API/CLI.
   * Returns the user's actually-available models (plan-gated, allowlisted).
   * Optional — providers without a discovery API return their static catalog.
   */
  discoverModels?(): Promise<ProviderModel[]>
}

export type AgentSession = {
  /** Send a message and receive normalized events.
   *  The returned async iterable completes when the turn is done. */
  send(prompt: string, attachments?: Attachment[]): AsyncIterable<NormalizedEvent>

  /** Send a text-only query with no tools (for git AI, summaries, etc.) */
  sendTextOnly(prompt: string): AsyncIterable<NormalizedEvent>

  /** Abort the current turn */
  stop(): void

  /** SDK-native session/thread ID (available after first session_init event) */
  readonly nativeSessionId: string | null
}

// ── Effort Mapping ───────────────────────────────
//
// Claude and Codex have different effort level vocabularies.
// This is where the mapping lives — each provider translates from our
// normalized EffortLevel to its native equivalent.
//
// Claude:  low | medium | high | xhigh | max  (xhigh is Opus 4.7+ only)
// Codex:   minimal | low | medium | high | xhigh
//
/**
 * Maps a Pylon EffortLevel to the provider's native effort string.
 *
 * Uses direct mapping (Option A): Claude effort levels pass through as-is,
 * Codex maps max→xhigh (Codex has no "max" above xhigh). Codex's "minimal"
 * is unreachable from Pylon's UI; acceptable since it's a niche "skip
 * reasoning" mode.
 */
const EFFORT_MAP: Record<ProviderId, Record<EffortLevel, string>> = {
  claude: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  codex: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'xhigh' },
}

export function mapEffortToNative(provider: ProviderId, effort: EffortLevel): string {
  return EFFORT_MAP[provider]?.[effort] ?? effort
}
