/**
 * OpenAI Codex SDK provider.
 *
 * Wraps @openai/codex-sdk's Codex/Thread classes and maps ThreadEvents into
 * NormalizedEvents that the SessionManager consumes.
 *
 * This file is the ONLY place in the codebase that imports from the Codex SDK.
 *
 * Key differences from ClaudeProvider:
 *  - No interactive per-tool permission callback (uses approvalPolicy enum)
 *  - No cost-in-USD reporting (only token counts)
 *  - item.updated carries full accumulated text, not deltas — we synthesize
 *    deltas by diffing against the previous snapshot.
 *  - Thread persistence via threadId (resumable sessions)
 *  - File modifications come as FileChangeItem (not Edit/Write tool calls)
 *  - Commands come as CommandExecutionItem (not Bash tool calls)
 */

import type {
  ApprovalMode,
  Codex,
  Input,
  ModelReasoningEffort,
  ThreadEvent,
  ThreadItem,
  ThreadOptions,
} from '@openai/codex-sdk'

// Lazy-load the ESM-only @openai/codex-sdk via dynamic import().
// Static imports are transpiled to require() by electron-vite's CJS output,
// which fails because the package only exports ESM ("import" condition).
// Dynamic import() is preserved as-is by Rollup 4 and can load ESM from CJS.
let _sdkModule: typeof import('@openai/codex-sdk') | null = null
async function loadCodexSdk() {
  if (!_sdkModule) {
    _sdkModule = await import('@openai/codex-sdk')
  }
  return _sdkModule
}

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { log } from '../../shared/logger'
import type { Attachment, ImageAttachment, PermissionMode } from '../../shared/types'
import type {
  AgentProvider,
  AgentSession,
  NormalizedEvent,
  ProviderCapabilities,
  ProviderModel,
  ProviderSessionConfig,
} from './types'
import { mapEffortToNative } from './types'

const logger = log.child('codex-provider')

// ── Model Catalog ────────────────────────────────
//
// Codex accepts any OpenAI model string. We register the common choices here
// so the UI can show a model picker. Users can also type custom model strings.

const CODEX_MODELS: ProviderModel[] = [
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'codex',
    contextWindow: 1_000_000,
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    provider: 'codex',
    contextWindow: 400_000,
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    provider: 'codex',
    contextWindow: 200_000,
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3 Codex Spark',
    provider: 'codex',
    contextWindow: 200_000,
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
]

const CODEX_CAPABILITIES: ProviderCapabilities = {
  interactivePermissions: false,
  askUserQuestion: false,
  reportsCostUsd: false,
  subagents: false,
  sessionResume: true,
  midSessionModelSwitch: false,
  fileCheckpointing: false,
}

// ── Approval Mode Mapping ────────────────────────
//
// Pylon's PermissionMode → Codex's ApprovalMode.
// Codex-native modes pass through directly; Claude modes map to closest equivalent.

function mapPermissionToApproval(mode: PermissionMode): ApprovalMode {
  switch (mode) {
    // Codex-native modes — pass through directly
    case 'never':
    case 'on-request':
    case 'on-failure':
    case 'untrusted':
      return mode
    // Claude modes — map to closest Codex equivalent
    case 'auto-approve':
      return 'never'
    case 'default':
      return 'on-failure'
    default:
      return 'on-failure'
  }
}

// ── Provider ─────────────────────────────────────

export class CodexProvider implements AgentProvider {
  readonly id = 'codex' as const
  readonly models = CODEX_MODELS
  readonly capabilities = CODEX_CAPABILITIES

  createSession(config: ProviderSessionConfig): AgentSession {
    return new CodexSession(config)
  }
}

// ── Session ──────────────────────────────────────

class CodexSession implements AgentSession {
  private config: ProviderSessionConfig
  private codex: Codex | null = null
  private aborted = false
  private _nativeSessionId: string | null = null

  /**
   * Tracks the last-seen accumulated text for each item so we can compute
   * deltas. Keyed by item.id → previous text string.
   *
   * This is necessary because Codex's `item.updated` events carry the full
   * accumulated text (not incremental deltas), while the renderer expects
   * `text_delta` stream events with only the new characters.
   */
  private previousTexts = new Map<string, string>()

  constructor(config: ProviderSessionConfig) {
    this.config = config
    this._nativeSessionId = config.resumeSessionId ?? null
    // Codex instance created lazily in ensureCodex() — the SDK is ESM-only
    // and must be loaded via dynamic import() in Electron's CJS main process.
  }

  /**
   * Lazily creates the Codex instance on first use. No explicit apiKey needed —
   * the SDK spawns the Codex CLI binary which inherits process.env and uses its
   * own stored auth (from `codex login`).
   */
  private async ensureCodex(): Promise<Codex> {
    if (!this.codex) {
      const sdk = await loadCodexSdk()
      this.codex = new sdk.Codex()
    }
    return this.codex
  }

  get nativeSessionId(): string | null {
    return this._nativeSessionId
  }

  async *send(prompt: string, attachments?: Attachment[]): AsyncIterable<NormalizedEvent> {
    const input = this.processAttachments(prompt, attachments)

    const codex = await this.ensureCodex()
    const threadOptions = this.buildThreadOptions()
    const thread = this._nativeSessionId
      ? codex.resumeThread(this._nativeSessionId, threadOptions)
      : codex.startThread(threadOptions)

    try {
      const { events } = await thread.runStreamed(input, {
        signal: this.config.abortController.signal,
      })

      yield* this.consumeStream(events)
    } catch (error: unknown) {
      if (this.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Codex stream error:', message)
      yield { type: 'error', message, recoverable: false }
    }
  }

  async *sendTextOnly(prompt: string): AsyncIterable<NormalizedEvent> {
    const codex = await this.ensureCodex()
    const threadOptions = this.buildThreadOptions()
    const thread = codex.startThread(threadOptions)

    try {
      const turn = await thread.run(prompt, {
        signal: this.config.abortController.signal,
      })

      yield {
        type: 'message_complete',
        role: 'assistant',
        content: [{ type: 'text', text: turn.finalResponse }],
        raw: null,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Codex text-only error:', message)
      yield { type: 'error', message, recoverable: false }
    }
  }

  stop(): void {
    this.aborted = true
    this.config.abortController.abort()
  }

  // ── Private: Stream Consumer ─────────────────

  private async *consumeStream(
    events: AsyncGenerator<ThreadEvent>,
  ): AsyncGenerator<NormalizedEvent> {
    for await (const event of events) {
      yield* this.mapEvent(event)
    }
  }

  /**
   * Translate a single Codex ThreadEvent into NormalizedEvents.
   *
   * Strategy: yield raw_passthrough events containing Claude-shaped messages
   * so the renderer works unchanged, PLUS normalized events for session manager
   * bookkeeping.
   */
  private *mapEvent(event: ThreadEvent): Generator<NormalizedEvent> {
    switch (event.type) {
      // ── Thread identity ──
      case 'thread.started': {
        this._nativeSessionId = event.thread_id
        yield { type: 'session_init', sessionId: event.thread_id }

        // Synthesize a Claude-compatible system init message for the renderer
        yield {
          type: 'raw_passthrough',
          persist: true,
          message: {
            type: 'system',
            subtype: 'init',
            tools: ['command_execution', 'file_change', 'web_search', 'mcp_tool_call'],
            skills: [],
            slash_commands: [],
            plugins: [],
            mcp_servers: [],
            model: this.config.model,
            permissionMode: this.config.permissionMode,
            claude_code_version: '',
          },
        }
        break
      }

      case 'turn.started':
        // No action needed — status already set to 'running' by session manager
        break

      // ── Item lifecycle ──
      case 'item.started':
        yield* this.mapItemStarted(event.item)
        break

      case 'item.updated':
        yield* this.mapItemUpdated(event.item)
        break

      case 'item.completed':
        yield* this.mapItemCompleted(event.item)
        break

      // ── Turn lifecycle ──
      case 'turn.completed':
        yield {
          type: 'turn_complete',
          costUsd: undefined,
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
        }

        // Synthesize a Claude-compatible result message for the renderer
        yield {
          type: 'raw_passthrough',
          persist: true,
          message: {
            type: 'result',
            model: this.config.model,
            usage: {
              input_tokens: event.usage.input_tokens,
              output_tokens: event.usage.output_tokens,
            },
          },
        }
        break

      case 'turn.failed':
        yield { type: 'error', message: event.error.message, recoverable: false }
        break

      case 'error':
        yield { type: 'error', message: event.message, recoverable: false }
        break
    }
  }

  // ── Item Mapping: Started ──────────────────────

  private *mapItemStarted(item: ThreadItem): Generator<NormalizedEvent> {
    switch (item.type) {
      case 'command_execution': {
        // Notify session manager a tool is about to run (for git baseline)
        this.config.onBeforeToolUse?.('Bash', { command: item.command })

        // Synthesize a Claude-compatible assistant message with a tool_use block
        yield {
          type: 'raw_passthrough',
          persist: true,
          message: {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: item.id,
                  name: 'Bash',
                  input: { command: item.command, description: '' },
                },
              ],
            },
          },
        }
        break
      }

      case 'file_change': {
        // Notify session manager for git baseline capture
        const firstChange = item.changes[0]
        if (firstChange) {
          const toolName = firstChange.kind === 'add' ? 'Write' : 'Edit'
          this.config.onBeforeToolUse?.(toolName, { file_path: firstChange.path })
        }

        // Synthesize tool_use blocks for each file change
        for (const change of item.changes) {
          const toolName = change.kind === 'add' ? 'Write' : 'Edit'
          yield {
            type: 'raw_passthrough',
            persist: true,
            message: {
              type: 'assistant',
              message: {
                content: [
                  {
                    type: 'tool_use',
                    id: `${item.id}-${change.path}`,
                    name: toolName,
                    input: { file_path: change.path },
                  },
                ],
              },
            },
          }
          yield { type: 'file_changed', path: change.path, kind: change.kind }
        }
        break
      }

      case 'mcp_tool_call': {
        this.config.onBeforeToolUse?.(item.tool, item.arguments as Record<string, unknown>)

        yield {
          type: 'raw_passthrough',
          persist: true,
          message: {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: item.id,
                  name: item.tool,
                  input: item.arguments,
                },
              ],
            },
          },
        }
        break
      }

      case 'todo_list': {
        const tasks = item.items.map((t) => ({
          content: t.text,
          status: t.completed ? 'completed' : 'in_progress',
        }))
        yield { type: 'tasks_updated', tasks }
        break
      }

      // agent_message, reasoning, web_search, error — no action on start
      default:
        break
    }
  }

  // ── Item Mapping: Updated (Delta Synthesis) ────

  private *mapItemUpdated(item: ThreadItem): Generator<NormalizedEvent> {
    switch (item.type) {
      case 'agent_message': {
        const delta = this.synthesizeDelta(item.id, item.text)
        if (delta) {
          // Synthesize Claude-compatible stream event for the renderer's delta batcher
          yield {
            type: 'raw_passthrough',
            persist: false,
            message: {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: delta },
              },
            },
          }
          yield { type: 'text_delta', text: delta }
        }
        break
      }

      case 'reasoning': {
        const delta = this.synthesizeDelta(item.id, item.text)
        if (delta) {
          yield {
            type: 'raw_passthrough',
            persist: false,
            message: {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                delta: { type: 'thinking_delta', thinking: delta },
              },
            },
          }
          yield { type: 'thinking_delta', text: delta }
        }
        break
      }

      case 'command_execution': {
        const delta = this.synthesizeDelta(item.id, item.aggregated_output)
        if (delta) {
          // Stream command output — renderer will pick up via delta batcher
          // We tag it as belonging to the command's tool_use ID
          yield {
            type: 'raw_passthrough',
            persist: false,
            message: {
              type: 'stream_event',
              parent_tool_use_id: item.id,
              event: {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: delta },
              },
            },
          }
        }
        break
      }

      case 'todo_list': {
        const tasks = item.items.map((t) => ({
          content: t.text,
          status: t.completed ? 'completed' : 'in_progress',
        }))
        yield { type: 'tasks_updated', tasks }
        break
      }

      default:
        break
    }
  }

  // ── Item Mapping: Completed ────────────────────

  private *mapItemCompleted(item: ThreadItem): Generator<NormalizedEvent> {
    // Clean up delta tracking
    this.previousTexts.delete(item.id)

    switch (item.type) {
      case 'agent_message': {
        // Synthesize Claude-compatible assistant message for the renderer
        yield {
          type: 'raw_passthrough',
          persist: true,
          message: {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: item.text }],
            },
          },
        }
        yield {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: item.text }],
          raw: null,
        }
        break
      }

      case 'command_execution': {
        this.previousTexts.delete(item.id) // Clean output tracking too

        // Synthesize a result message for the command output
        yield {
          type: 'raw_passthrough',
          persist: true,
          message: this.synthesizeToolResult(
            item.id,
            item.aggregated_output,
            item.status === 'failed',
          ),
        }
        yield {
          type: 'tool_result',
          toolId: item.id,
          toolName: 'Bash',
          output: item.aggregated_output,
          isError: item.status === 'failed',
          exitCode: item.exit_code,
        }
        break
      }

      case 'file_change': {
        // Synthesize result messages for each file change
        for (const change of item.changes) {
          const toolId = `${item.id}-${change.path}`
          const toolName = change.kind === 'add' ? 'Write' : 'Edit'
          const output = `${change.kind}: ${change.path}`

          yield {
            type: 'raw_passthrough',
            persist: true,
            message: this.synthesizeToolResult(toolId, output, item.status === 'failed'),
          }
          yield {
            type: 'tool_result',
            toolId,
            toolName,
            output,
            isError: item.status === 'failed',
          }
        }
        break
      }

      case 'mcp_tool_call': {
        const output = item.error
          ? `Error: ${item.error.message}`
          : JSON.stringify(item.result ?? {})

        yield {
          type: 'raw_passthrough',
          persist: true,
          message: this.synthesizeToolResult(item.id, output, item.status === 'failed'),
        }
        yield {
          type: 'tool_result',
          toolId: item.id,
          toolName: item.tool,
          output,
          isError: item.status === 'failed',
        }
        break
      }

      case 'reasoning': {
        // Reasoning is already streamed via item.updated — just clean up
        break
      }

      case 'error': {
        yield { type: 'error', message: item.message, recoverable: true }
        break
      }

      case 'todo_list': {
        const tasks = item.items.map((t) => ({
          content: t.text,
          status: t.completed ? 'completed' : 'in_progress',
        }))
        yield { type: 'tasks_updated', tasks }
        break
      }

      default:
        break
    }
  }

  // ── Delta Synthesis ────────────────────────────
  //
  // Codex item.updated events carry the full accumulated text.
  // The renderer expects incremental text_delta events.
  // We track previous text per item and slice to get the new portion.

  private synthesizeDelta(itemId: string, currentText: string): string | null {
    const prev = this.previousTexts.get(itemId) ?? ''
    if (currentText.length <= prev.length) return null

    const delta = currentText.slice(prev.length)
    this.previousTexts.set(itemId, currentText)
    return delta
  }

  // ── Claude-Compatible Message Synthesis ────────
  //
  // The renderer understands Claude SDK message shapes. We synthesize
  // compatible structures from Codex events so the renderer works unchanged.

  private synthesizeToolResult(
    toolUseId: string,
    output: string,
    isError: boolean,
  ): Record<string, unknown> {
    return {
      type: 'result',
      subtype: 'tool_result',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: output,
          is_error: isError,
        },
      ],
    }
  }

  // ── Thread Options Builder ─────────────────────

  private buildThreadOptions(): ThreadOptions {
    return {
      model: this.config.model,
      workingDirectory: this.config.cwd,
      approvalPolicy: mapPermissionToApproval(this.config.permissionMode),
      sandboxMode: 'workspace-write',
      modelReasoningEffort: mapEffortToNative('codex', this.config.effort) as ModelReasoningEffort,
      skipGitRepoCheck: true,
    }
  }

  // ── Attachment Processing ──────────────────────
  //
  // Codex supports text and local_image inputs via the UserInput[] format.
  // When images are present we return UserInput[]; otherwise a plain string.
  //
  // ImageAttachment arrives as base64 (from clipboard paste / drag-drop).
  // The Codex SDK expects { type: "local_image", path: string }, so we
  // decode → write to a temp file → pass the path.

  private processAttachments(text: string, attachments?: Attachment[]): Input {
    const files = (attachments ?? []).filter(
      (a): a is Attachment & { type: 'file' } => a.type === 'file' && 'content' in a && !!a.content,
    )
    const images = (attachments ?? []).filter((a): a is ImageAttachment => a.type === 'image')

    // No images — return plain string (text + inlined file contents)
    if (images.length === 0) {
      const parts: string[] = []
      for (const att of files) {
        parts.push(`<attached_file name="${att.name}">\n${att.content}\n</attached_file>`)
      }
      if (text) parts.push(text)
      return parts.join('\n\n')
    }

    // Images present — build UserInput[] so we can include local_image entries
    const inputs: Array<{ type: 'text'; text: string } | { type: 'local_image'; path: string }> = []

    // Inline file contents as text blocks
    for (const att of files) {
      inputs.push({
        type: 'text',
        text: `<attached_file name="${att.name}">\n${att.content}\n</attached_file>`,
      })
    }

    // Write images to temp files for the SDK
    for (const img of images) {
      const tempPath = this.writeTempImage(img)
      inputs.push({ type: 'local_image', path: tempPath })
    }

    // Main text prompt
    if (text) {
      inputs.push({ type: 'text', text })
    }

    return inputs
  }

  /**
   * Writes a base64-encoded image to a temp file and returns the path.
   * The Codex SDK requires a local file path for image inputs.
   * Files are written to the OS temp directory under pylon-codex-images/.
   */
  private writeTempImage(img: ImageAttachment): string {
    const dir = path.join(tmpdir(), 'pylon-codex-images')
    mkdirSync(dir, { recursive: true })

    const ext = img.mediaType.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    const safeName = (img.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${Date.now()}-${safeName}.${ext}`
    const filepath = path.join(dir, filename)

    writeFileSync(filepath, Buffer.from(img.base64, 'base64'))
    logger.debug('Wrote temp image for Codex:', filepath)

    return filepath
  }
}
