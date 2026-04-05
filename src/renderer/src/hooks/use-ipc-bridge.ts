import { useEffect } from 'react'
import { resolveContextWindow, resolveMaxOutputTokens } from '../../../shared/model-context'
import type {
  PermissionRequest,
  QuestionRequest,
  SdkMessage,
  SessionInitInfo,
  SessionStatus,
} from '../../../shared/types'
import { accumulateDelta, flushPendingDeltas } from '../lib/delta-batcher'
import { extractTasks } from '../lib/extract-tasks'
import { isPlanPath, toRelativePath } from '../lib/parse-plan'
import { useSessionStore } from '../store/session-store'

type SessionMessageEvent = {
  sessionId: string
  message: unknown
}

type SessionStatusEvent = {
  sessionId: string
  status?: SessionStatus
  model?: string
}

type SessionPermissionEvent = PermissionRequest

type StreamEventMessage = {
  type: 'stream_event'
  parent_tool_use_id?: string | null
  event?: {
    type?: string
    delta?: {
      type?: string
      text?: string
      thinking?: string
    }
    // message_start events carry per-API-call usage
    message?: {
      usage?: {
        input_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
    }
  }
}

type ResultMessage = {
  type: 'result'
  model?: string
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  modelUsage?: Record<
    string,
    { inputTokens?: number; contextWindow?: number; maxOutputTokens?: number }
  >
  duration_ms?: number
  num_turns?: number
}

export function useIpcBridge(): void {
  // Use getState() instead of reactive hooks to avoid re-rendering App on every store update.
  // The IPC callbacks only need to call store actions, not read reactive state.
  useEffect(() => {
    const store = () => useSessionStore.getState()

    const unsubMessage = window.api.onSessionMessage((raw) => {
      const { sessionId, message } = raw as SessionMessageEvent
      const msg = message as SdkMessage

      if (msg.type === 'stream_event') {
        const streamMsg = msg as StreamEventMessage
        const delta = streamMsg.event?.delta
        const parentToolUseId = streamMsg.parent_tool_use_id

        if (delta?.type === 'text_delta' && delta.text) {
          if (parentToolUseId) {
            accumulateDelta(`subagent:${parentToolUseId}`, delta.text)
          } else {
            accumulateDelta(sessionId, delta.text)
          }
        } else if (delta?.type === 'thinking_delta' && delta.thinking && !parentToolUseId) {
          accumulateDelta(`${sessionId}:thinking`, delta.thinking)
        }

        // Capture context size from message_start events (main agent only).
        // The full context size = input_tokens + cache_read + cache_creation,
        // since input_tokens alone excludes cached tokens.
        if (
          streamMsg.event?.type === 'message_start' &&
          !parentToolUseId &&
          streamMsg.event.message?.usage
        ) {
          const usage = streamMsg.event.message.usage as Record<string, number>
          const contextInputTokens =
            (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0)
          const session = store().sessions.get(sessionId)
          if (session && contextInputTokens > 0) {
            store().updateSession(sessionId, {
              cost: {
                ...session.cost,
                contextInputTokens,
              },
            })
          }
        }
        return
      }

      const parentToolUseId = msg.parent_tool_use_id

      if (msg.type === 'assistant' || msg.type === 'user') {
        if (parentToolUseId) {
          const s = store()
          const streamedText = s.subagentStreaming.get(parentToolUseId)
          if (streamedText) {
            flushPendingDeltas()
            s.appendSubagentMessage(parentToolUseId, {
              type: 'subagent_text',
              text: streamedText,
            })
            s.clearSubagentStream(parentToolUseId)
          }
          s.appendSubagentMessage(parentToolUseId, msg)
          return
        }
        flushPendingDeltas()
        store().clearStreamingText(sessionId)
        store().clearStreamingText(`${sessionId}:thinking`)
      }

      if (msg.type === 'result') {
        const resultMsg = msg as ResultMessage
        flushPendingDeltas()
        store().clearStreamingText(sessionId)
        store().clearStreamingText(`${sessionId}:thinking`)

        // Extract contextWindow and maxOutputTokens from modelUsage (keyed by model name).
        // Use resolveContextWindow/resolveMaxOutputTokens to take max(SDK-reported, known floor) —
        // the SDK may under-report (e.g. 200K for Opus when it actually supports 1M).
        // contextInputTokens is set live by message_start stream events — preserve it here.
        const modelUsageKeys = Object.keys(resultMsg.modelUsage ?? {})
        const modelUsageEntries = Object.values(resultMsg.modelUsage ?? {})
        const sdkContextWindow = modelUsageEntries[0]?.contextWindow ?? 0
        const sdkMaxOutput = modelUsageEntries[0]?.maxOutputTokens ?? 0
        const modelName = modelUsageKeys[0] ?? ''
        const contextWindow = modelName
          ? resolveContextWindow(modelName, sdkContextWindow)
          : sdkContextWindow
        const maxOutputTokens = modelName
          ? resolveMaxOutputTokens(modelName, sdkMaxOutput)
          : sdkMaxOutput
        const existingSession = store().sessions.get(sessionId)

        const updates: Record<string, unknown> = {
          cost: {
            totalUsd: resultMsg.total_cost_usd ?? existingSession?.cost.totalUsd ?? 0,
            inputTokens: resultMsg.usage?.input_tokens ?? 0,
            outputTokens: resultMsg.usage?.output_tokens ?? 0,
            contextWindow,
            // Preserve the live contextInputTokens from message_start events
            contextInputTokens: existingSession?.cost.contextInputTokens ?? 0,
            maxOutputTokens,
          },
        }
        if (resultMsg.model) {
          updates.model = resultMsg.model
        }
        store().updateSession(sessionId, updates)
      }

      // Track SDK status (e.g. 'compacting')
      if (msg.type === 'system' && msg.subtype === 'status') {
        store().setSdkStatus(sessionId, (msg as { status?: string | null }).status ?? null)
      }

      // Extract session init info (tools, skills, plugins, MCP servers)
      if (msg.type === 'system' && msg.subtype === 'init') {
        const init = msg as Record<string, unknown>
        const initInfo: SessionInitInfo = {
          tools: (init.tools as string[]) ?? [],
          skills: (init.skills as string[]) ?? [],
          slashCommands: (init.slash_commands as string[]) ?? [],
          plugins: (init.plugins as Array<{ name: string; path: string }>) ?? [],
          mcpServers: (init.mcp_servers as Array<{ name: string; status: string }>) ?? [],
          model: (init.model as string) ?? '',
          permissionMode: (init.permissionMode as string) ?? 'default',
          claudeCodeVersion: (init.claude_code_version as string) ?? '',
        }
        store().setInitInfo(sessionId, initInfo)
      }

      store().appendMessage(sessionId, msg)

      // Extract task state from assistant messages containing TodoWrite tool calls
      if (msg.type === 'assistant') {
        const tasks = extractTasks(message)
        for (const task of tasks) {
          store().upsertTask(sessionId, task)
        }

        // Track changed files from Edit/Write tool calls
        const messageObj = msg.message as
          | {
              content?: Array<{
                type: string
                id?: string
                name?: string
                input?: Record<string, unknown>
              }>
            }
          | undefined
        const content =
          messageObj?.content ??
          (msg.content as
            | Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }>
            | undefined)
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type !== 'tool_use' || !block.input) continue
            const blockName = (block.name ?? '').toLowerCase()
            if (
              blockName.includes('edit') ||
              (blockName.includes('write') && blockName !== 'todowrite')
            ) {
              const filePath = block.input?.file_path ?? block.input?.path
              if (typeof filePath === 'string' && filePath) {
                store().addChangedFile(sessionId, filePath)

                // Detect plan/design files
                if (isPlanPath(filePath) && block.id) {
                  store().addDetectedPlan(sessionId, {
                    filePath,
                    relativePath: toRelativePath(filePath),
                    toolUseId: block.id,
                    status: 'pending',
                    comments: [],
                  })
                }
              }
            }
          }
        }
      }
    })

    const unsubStatus = window.api.onSessionStatus((raw) => {
      const { sessionId, status, model } = raw as SessionStatusEvent
      const updates: Partial<{ status: SessionStatus; model: string }> = {}
      if (status !== undefined) updates.status = status
      if (model !== undefined) updates.model = model
      store().updateSession(sessionId, updates)
      const { mode } = raw as { mode?: string }
      if (mode === 'normal' || mode === 'plan') {
        store().setSessionMode(sessionId, mode)
      }
    })

    const unsubPermission = window.api.onSessionPermission((raw) => {
      const permission = raw as SessionPermissionEvent
      store().addPermission(permission)
    })

    const unsubQuestion = window.api.onSessionQuestion((raw) => {
      const question = raw as QuestionRequest
      store().addQuestion(question)
    })

    const unsubTitle = window.api.onSessionTitleUpdated((raw) => {
      const { sessionId, title } = raw as { sessionId: string; title: string }
      store().updateSession(sessionId, { title })
    })

    const unsubPlanApproval = window.api.onPlanApproval((raw) => {
      const approval = raw as { requestId: string; sessionId: string; allowedPrompts?: Array<{ tool: string; prompt: string }> }
      store().setPendingPlanApproval(approval.sessionId, approval)
    })

    return () => {
      unsubMessage()
      unsubStatus()
      unsubPermission()
      unsubQuestion()
      unsubTitle()
      unsubPlanApproval()
    }
  }, [])
}
