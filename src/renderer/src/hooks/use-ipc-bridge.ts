import { useEffect } from 'react'
import { useSessionStore } from '../store/session-store'
import type { PermissionRequest, QuestionRequest, SessionStatus } from '../../../shared/types'

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

type SdkMessage = {
  type: string
  parent_tool_use_id?: string | null
  [key: string]: unknown
}

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
            store().appendSubagentStreamText(parentToolUseId, delta.text)
          } else {
            useSessionStore.setState((state) => {
              const current = state.streamingText.get(sessionId) ?? ''
              const next = new Map(state.streamingText)
              next.set(sessionId, current + delta.text)
              return { streamingText: next }
            })
          }
        } else if (delta?.type === 'thinking_delta' && delta.thinking && !parentToolUseId) {
          useSessionStore.setState((state) => {
            const current = state.streamingText.get(`${sessionId}:thinking`) ?? ''
            const next = new Map(state.streamingText)
            next.set(`${sessionId}:thinking`, current + delta.thinking)
            return { streamingText: next }
          })
        }
        return
      }

      const parentToolUseId = msg.parent_tool_use_id

      if (msg.type === 'assistant' || msg.type === 'user') {
        if (parentToolUseId) {
          const s = store()
          const streamedText = s.subagentStreaming.get(parentToolUseId)
          if (streamedText) {
            s.appendSubagentMessage(parentToolUseId, {
              type: 'subagent_text',
              text: streamedText,
            })
            s.clearSubagentStream(parentToolUseId)
          }
          s.appendSubagentMessage(parentToolUseId, message)
          return
        }
        store().clearStreamingText(sessionId)
        store().clearStreamingText(`${sessionId}:thinking`)
      }

      if (msg.type === 'result') {
        const resultMsg = msg as ResultMessage
        store().clearStreamingText(sessionId)
        store().clearStreamingText(`${sessionId}:thinking`)

        const updates: Record<string, unknown> = {
          cost: {
            totalUsd: resultMsg.total_cost_usd ?? 0,
            inputTokens: resultMsg.usage?.input_tokens ?? 0,
            outputTokens: resultMsg.usage?.output_tokens ?? 0,
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

      store().appendMessage(sessionId, message)

      // Extract task state from assistant messages containing TodoWrite tool calls
      if (msg.type === 'assistant') {
        const messageObj = msg.message as { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> } | undefined
        const content = messageObj?.content ?? (msg.content as Array<{ type: string; name?: string; input?: Record<string, unknown> }> | undefined)
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type !== 'tool_use' || !block.input) continue

            // TodoWrite sends the full todo list as input.todos
            if (block.name === 'TodoWrite') {
              const todos = block.input.todos as Array<{ content: string; status: string; activeForm?: string }> | undefined
              if (Array.isArray(todos)) {
                for (let i = 0; i < todos.length; i++) {
                  const todo = todos[i]
                  const status = todo.status as 'pending' | 'in_progress' | 'completed'
                  if (['pending', 'in_progress', 'completed'].includes(status)) {
                    store().upsertTask(sessionId, {
                      id: String(i + 1),
                      subject: todo.content,
                      status,
                      activeForm: todo.activeForm,
                    })
                  }
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
    })

    const unsubPermission = window.api.onSessionPermission((raw) => {
      const permission = raw as SessionPermissionEvent
      store().addPermission(permission)
    })

    const unsubQuestion = window.api.onSessionQuestion((raw) => {
      const question = raw as QuestionRequest
      store().addQuestion(question)
    })

    return () => {
      unsubMessage()
      unsubStatus()
      unsubPermission()
      unsubQuestion()
    }
  }, [])
}
