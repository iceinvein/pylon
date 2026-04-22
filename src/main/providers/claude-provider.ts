/**
 * Claude Agent SDK provider.
 *
 * Wraps @anthropic-ai/claude-agent-sdk's query() function and maps its
 * message stream into NormalizedEvents that the SessionManager consumes.
 *
 * This file is the ONLY place in the codebase that imports from the Claude SDK.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'
import {
  type CanUseTool,
  query,
  type SDKResultMessage,
  type Options as SdkOptions,
} from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import { log } from '../../shared/logger'
import { resolveContextWindow, resolveMaxOutputTokens } from '../../shared/model-context'
import type { Attachment, EffortLevel } from '../../shared/types'
import { getClaudeCodeSdkRuntimeOptions } from '../claude-code-executable'
import type {
  AgentProvider,
  AgentSession,
  NormalizedEvent,
  ProviderCapabilities,
  ProviderModel,
  ProviderSessionConfig,
} from './types'

const logger = log.child('claude-provider')

// ── Model Catalog ────────────────────────────────

const CLAUDE_MODELS: ProviderModel[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    provider: 'claude',
    contextWindow: 1_000_000,
    supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    provider: 'claude',
    contextWindow: 1_000_000,
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    provider: 'claude',
    contextWindow: 200_000,
    supportsEffort: ['low', 'medium', 'high'],
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    provider: 'claude',
    contextWindow: 200_000,
    supportsEffort: ['low', 'medium', 'high'],
  },
]

const CLAUDE_CAPABILITIES: ProviderCapabilities = {
  interactivePermissions: true,
  askUserQuestion: true,
  reportsCostUsd: true,
  subagents: true,
  sessionResume: true,
  midSessionModelSwitch: false,
  fileCheckpointing: true,
  planMode: true,
}

// ── Provider ─────────────────────────────────────

export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude' as const
  readonly models = CLAUDE_MODELS
  readonly capabilities = CLAUDE_CAPABILITIES

  createSession(config: ProviderSessionConfig): AgentSession {
    return new ClaudeSession(config)
  }

  /**
   * Discover available models by creating a lightweight SDK query and
   * calling supportedModels(). The query is aborted immediately after —
   * no prompt is sent, no tokens consumed.
   */
  async discoverModels(): Promise<ProviderModel[]> {
    const ac = new AbortController()
    try {
      const q = query({
        prompt: '',
        options: {
          maxTurns: 0,
          abortController: ac,
          ...getClaudeCodeSdkRuntimeOptions(),
        },
      })
      const modelInfos = await q.supportedModels()
      ac.abort()

      logger.info(`SDK returned ${modelInfos.length} models:`)
      for (const m of modelInfos) {
        logger.info(
          `  → value="${m.value}" displayName="${m.displayName}" effort=${JSON.stringify(m.supportedEffortLevels)}`,
        )
      }

      const mapped = modelInfos.map((m) => mapModelInfo(m))
      logger.info(`Mapped to ${mapped.length} ProviderModels:`)
      for (const m of mapped) {
        logger.info(`  → id="${m.id}" label="${m.label}" ctx=${m.contextWindow}`)
      }

      return mapped
    } catch (err) {
      logger.error('Discovery failed, using static catalog:', err)
      return CLAUDE_MODELS
    }
  }
}

/**
 * SDK shorthand → canonical model ID.
 *
 * The Claude Agent SDK's supportedModels() returns short aliases like
 * "default", "sonnet", "haiku" — but the rest of Pylon (effort logic,
 * settings, fallback models) uses full canonical IDs. This map bridges
 * the gap so discovery doesn't break the dropdown or selection logic.
 */
const SDK_ID_MAP: Record<string, string> = {
  default: 'claude-opus-4-7',
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
}

/** Resolve an SDK model value to our canonical ID */
function resolveModelId(sdkValue: string): string {
  // 1. Direct alias match
  if (SDK_ID_MAP[sdkValue]) return SDK_ID_MAP[sdkValue]
  // 2. Already a canonical ID in our static catalog
  if (CLAUDE_MODELS.some((m) => m.id === sdkValue)) return sdkValue
  // 3. Unknown model — pass through as-is
  return sdkValue
}

/** Map SDK's ModelInfo to our ProviderModel shape */
function mapModelInfo(info: ModelInfo): ProviderModel {
  const canonicalId = resolveModelId(info.value)
  const staticMatch = CLAUDE_MODELS.find((m) => m.id === canonicalId)

  if (info.value !== canonicalId) {
    logger.info(`  Resolved SDK alias "${info.value}" → "${canonicalId}"`)
  }

  return {
    id: canonicalId,
    label: staticMatch?.label || info.displayName || canonicalId,
    provider: 'claude',
    contextWindow: staticMatch?.contextWindow ?? 200_000,
    supportsEffort: info.supportedEffortLevels?.filter(
      (e): e is EffortLevel =>
        e === 'low' || e === 'medium' || e === 'high' || e === 'xhigh' || e === 'max',
    ) ??
      staticMatch?.supportsEffort ?? ['low', 'medium', 'high'],
  }
}

// ── Session ──────────────────────────────────────

class ClaudeSession implements AgentSession {
  private config: ProviderSessionConfig
  private queryInstance: ReturnType<typeof query> | null = null
  private _nativeSessionId: string | null = null

  constructor(config: ProviderSessionConfig) {
    this.config = config
    this._nativeSessionId = config.resumeSessionId ?? null
  }

  get nativeSessionId(): string | null {
    return this._nativeSessionId
  }

  async *send(prompt: string, attachments?: Attachment[]): AsyncIterable<NormalizedEvent> {
    const { processedPrompt } = await this.processAttachments(prompt, attachments)

    const options = this.buildOptions()
    if (this._nativeSessionId) {
      ;(options as Record<string, unknown>).resume = this._nativeSessionId
    }

    const q = query({ prompt: processedPrompt, options })
    this.queryInstance = q

    try {
      yield* this.consumeStream(q)
    } finally {
      this.queryInstance = null
    }
  }

  async *sendTextOnly(prompt: string): AsyncIterable<NormalizedEvent> {
    const options: SdkOptions & Record<string, unknown> = {
      cwd: this.config.cwd,
      model: this.config.model,
      abortController: new AbortController(),
      tools: [],
      permissionMode: 'acceptEdits' as const,
      ...getClaudeCodeSdkRuntimeOptions(),
    }

    const q = query({ prompt, options })
    let responseText = ''

    for await (const message of q) {
      const msg = message as { type?: string; content?: unknown; message?: { content?: unknown } }
      if (msg.type === 'assistant' || msg.type === 'result') {
        const content = msg.message?.content ?? msg.content
        if (typeof content === 'string') {
          responseText = content
        } else if (Array.isArray(content)) {
          const text = (content as { type?: string; text?: string }[])
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text ?? '')
            .join('')
          if (text) responseText = text
        }
      }
    }

    yield {
      type: 'message_complete',
      role: 'assistant',
      content: [{ type: 'text', text: responseText }],
      raw: null,
    }
  }

  stop(): void {
    this.config.abortController.abort()
    if (this.queryInstance) {
      this.queryInstance.close()
      this.queryInstance = null
    }
  }

  // ── Private: Stream Consumer ─────────────────

  private async *consumeStream(q: ReturnType<typeof query>): AsyncGenerator<NormalizedEvent> {
    for await (const message of q) {
      const msg = message as Record<string, unknown>

      // Yield raw passthrough FIRST so session manager can persist + send to IPC
      // before processing normalized events for bookkeeping.
      // stream_event messages are not persisted to DB (matches existing behavior).
      yield {
        type: 'raw_passthrough' as const,
        message,
        persist: msg.type !== 'stream_event',
      }

      // Then yield normalized events for structured bookkeeping
      yield* this.mapMessage(message)
    }
  }

  /**
   * Map a single Claude SDK message into one or more NormalizedEvents.
   * This is the core translation layer — every SDK message type is handled here.
   */
  private *mapMessage(message: unknown): Generator<NormalizedEvent> {
    const msg = message as Record<string, unknown>

    // ── System message with session ID
    if (msg.type === 'system' && 'session_id' in msg) {
      this._nativeSessionId = msg.session_id as string
      yield { type: 'session_init', sessionId: this._nativeSessionId }
    }

    // ── System message with init info (tools, model, version)
    if (msg.type === 'system' && msg.subtype === 'init') {
      yield {
        type: 'session_init',
        sessionId: this._nativeSessionId ?? '',
        info: {
          tools: (msg.tools as string[]) ?? [],
          skills: (msg.skills as string[]) ?? [],
          slashCommands: (msg.slash_commands as string[]) ?? [],
          plugins: (msg.plugins as Array<{ name: string; path: string }>) ?? [],
          mcpServers: (msg.mcp_servers as Array<{ name: string; status: string }>) ?? [],
          model: (msg.model as string) ?? '',
          permissionMode: (msg.permission_mode as string) ?? '',
          claudeCodeVersion: (msg.claude_code_version as string) ?? '',
        },
      }
    }

    // ── System status (compacting, etc.)
    if (msg.type === 'system' && msg.subtype === 'status') {
      yield { type: 'status', status: String(msg.status ?? msg.message ?? '') }
    }

    // ── Stream events (deltas, usage)
    if (msg.type === 'stream_event') {
      yield* this.mapStreamEvent(msg)
    }

    // ── Assistant message (complete turn)
    if (msg.type === 'assistant') {
      yield {
        type: 'message_complete',
        role: 'assistant',
        content: this.extractContentBlocks(msg),
        raw: message,
        parentToolUseId: (msg.parent_tool_use_id as string) ?? undefined,
      }
    }

    // ── User message echo
    if (msg.type === 'user') {
      yield {
        type: 'message_complete',
        role: 'user',
        content: this.extractContentBlocks(msg),
        raw: message,
      }
    }

    // ── Result message (turn complete with cost/usage)
    if (msg.type === 'result') {
      yield* this.mapResultMessage(msg as unknown as SDKResultMessage, message)
    }
  }

  private *mapStreamEvent(msg: Record<string, unknown>): Generator<NormalizedEvent> {
    const evt = msg.event as Record<string, unknown> | undefined
    if (!evt) return

    const parentToolUseId = (msg.parent_tool_use_id as string) ?? undefined

    // ── Text/thinking deltas
    if (evt.type === 'content_block_delta') {
      const delta = evt.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        yield { type: 'text_delta', text: delta.text, parentToolUseId }
      }
      if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        yield { type: 'thinking_delta', text: delta.thinking, parentToolUseId }
      }
    }

    // ── Usage from message_start
    if (evt.type === 'message_start') {
      const msgObj = evt.message as Record<string, unknown> | undefined
      const usage = msgObj?.usage as Record<string, number> | undefined
      if (usage) {
        yield {
          type: 'usage_update',
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cachedInputTokens: usage.cache_read_input_tokens,
          cacheCreationTokens: usage.cache_creation_input_tokens,
        }
      }
    }
  }

  private *mapResultMessage(result: SDKResultMessage, raw: unknown): Generator<NormalizedEvent> {
    // Extract per-model context windows and max output tokens
    const modelContextWindows: Record<string, number> = {}
    const modelMaxOutputTokens: Record<string, number> = {}
    if (result.modelUsage) {
      for (const [model, usage] of Object.entries(result.modelUsage)) {
        if (usage.contextWindow > 0) {
          modelContextWindows[model] = resolveContextWindow(model, usage.contextWindow)
        }
        if (usage.maxOutputTokens > 0) {
          modelMaxOutputTokens[model] = resolveMaxOutputTokens(model, usage.maxOutputTokens)
        }
      }
    }

    yield {
      type: 'turn_complete',
      costUsd: result.total_cost_usd,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      modelContextWindows:
        Object.keys(modelContextWindows).length > 0 ? modelContextWindows : undefined,
      modelMaxOutputTokens:
        Object.keys(modelMaxOutputTokens).length > 0 ? modelMaxOutputTokens : undefined,
    }

    // Also emit as a complete message so the renderer has the raw result
    yield {
      type: 'message_complete',
      role: 'assistant',
      content: this.extractContentBlocks(result as unknown as Record<string, unknown>),
      raw,
    }
  }

  // ── Private: Content Block Extraction ────────

  private extractContentBlocks(
    msg: Record<string, unknown>,
  ): Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; toolId: string; toolName: string; input: unknown }
  > {
    const content = (msg.message as Record<string, unknown>)?.content ?? msg.content
    if (!content) return []

    if (typeof content === 'string') {
      return [{ type: 'text', text: content }]
    }

    if (!Array.isArray(content)) return []

    const blocks: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; toolId: string; toolName: string; input: unknown }
    > = []

    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === 'text' && typeof block.text === 'string') {
        blocks.push({ type: 'text', text: block.text })
      }
      if (block.type === 'tool_use') {
        blocks.push({
          type: 'tool_use',
          toolId: (block.id as string) ?? '',
          toolName: (block.name as string) ?? '',
          input: block.input,
        })
      }
    }

    return blocks
  }

  // ── Private: Options Builder ─────────────────

  private buildOptions(): SdkOptions {
    const config = this.config

    const canUseTool: CanUseTool = async (toolName, input, opts) => {
      // Notify session manager of tool use (for git baseline capture, etc.)
      config.onBeforeToolUse?.(toolName, input)

      // Intercept AskUserQuestion — route to question UI
      if (toolName === 'AskUserQuestion') {
        const answers = await config.onQuestionRequest(input)
        return {
          behavior: 'allow' as const,
          updatedInput: { ...input, answers },
        }
      }

      // Intercept ExitPlanMode — route to plan approval UI
      if (toolName === 'ExitPlanMode') {
        if (config.onPlanApprovalRequest) {
          const result = await config.onPlanApprovalRequest(input)
          if (result.approved) {
            return { behavior: 'allow' as const, updatedInput: input }
          }
          return { behavior: 'deny' as const, message: 'User rejected the plan' }
        }
        // If no handler configured, allow by default
        return { behavior: 'allow' as const, updatedInput: input }
      }

      // Auto-approve mode: skip permission prompt
      if (config.permissionMode === 'auto-approve') {
        return { behavior: 'allow' as const, updatedInput: input }
      }

      // Interactive permission: delegate to callback
      const result = await config.onPermissionRequest(toolName, input, opts.suggestions)
      if (result.behavior === 'allow') {
        return { behavior: 'allow' as const, updatedInput: input }
      }
      return { behavior: 'deny' as const, message: result.message ?? 'User denied' }
    }

    const base: SdkOptions & Record<string, unknown> = {
      cwd: config.cwd,
      model: config.model,
      abortController: config.abortController,
      includePartialMessages: true,
      promptSuggestions: true,
      enableFileCheckpointing: true,
      settingSources: ['user', 'project', 'local'],
      effort: config.effort,
      permissionMode: config.permissionMode === 'plan' ? ('plan' as const) : undefined,
      betas: config.betas as SdkOptions['betas'],
      canUseTool,
      ...getClaudeCodeSdkRuntimeOptions(),
    }

    if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      base.mcpServers = config.mcpServers
    }

    return base
  }

  // ── Private: Attachment Processing ───────────

  private async processAttachments(
    text: string,
    attachments?: Attachment[],
  ): Promise<{
    processedPrompt: string
    userContentBlocks: Array<Record<string, unknown>>
  }> {
    const imageAttachments = (attachments ?? []).filter(
      (a): a is Attachment & { type: 'image' } =>
        a.type === 'image' && 'base64' in a && !!a.base64 && 'mediaType' in a && !!a.mediaType,
    )
    const fileAttachments = (attachments ?? []).filter(
      (a): a is Attachment & { type: 'file' } => a.type === 'file' && 'content' in a && !!a.content,
    )

    const promptParts: string[] = []

    // Save images to temp files and reference by path
    if (imageAttachments.length > 0) {
      const tmpDir = join(app.getPath('temp'), 'pylon-images')
      await mkdir(tmpDir, { recursive: true })

      for (const att of imageAttachments) {
        const ext = att.mediaType?.split('/')[1] ?? 'png'
        const filename = `${randomUUID()}.${ext}`
        const filepath = join(tmpDir, filename)
        await writeFile(filepath, Buffer.from(att.base64, 'base64'))
        promptParts.push(`[Attached image: ${filepath}]`)
      }
    }

    // Inline text/data file contents directly in the prompt
    for (const att of fileAttachments) {
      promptParts.push(`<attached_file name="${att.name}">\n${att.content}\n</attached_file>`)
    }

    if (text) {
      promptParts.push(text)
    }

    // Build user content blocks for persistence
    const userContentBlocks: Array<Record<string, unknown>> = []
    for (const att of imageAttachments) {
      userContentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mediaType,
          data: att.base64,
        },
      })
    }
    if (text) {
      userContentBlocks.push({ type: 'text', text })
    }

    return {
      processedPrompt: promptParts.join('\n\n'),
      userContentBlocks,
    }
  }
}
