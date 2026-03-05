import { useEffect } from 'react'
import { useSessionStore } from '../store/session-store'
import type { PermissionRequest, SessionStatus } from '../../../shared/types'

type SessionMessageEvent = {
  sessionId: string
  message: unknown
}

type SessionStatusEvent = {
  sessionId: string
  status: SessionStatus
}

type SessionPermissionEvent = PermissionRequest

type SdkMessage = {
  type: string
  [key: string]: unknown
}

type StreamEventMessage = {
  type: 'stream_event'
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
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  duration_ms?: number
  num_turns?: number
}

export function useIpcBridge(): void {
  const { appendMessage, updateSession, addPermission, updateStreamingText, clearStreamingText } =
    useSessionStore()

  useEffect(() => {
    const unsubMessage = window.api.onSessionMessage((raw) => {
      const { sessionId, message } = raw as SessionMessageEvent
      const msg = message as SdkMessage

      if (msg.type === 'stream_event') {
        const streamMsg = msg as StreamEventMessage
        const delta = streamMsg.event?.delta
        if (delta?.type === 'text_delta' && delta.text) {
          useSessionStore.setState((state) => {
            const current = state.streamingText.get(sessionId) ?? ''
            const next = new Map(state.streamingText)
            next.set(sessionId, current + delta.text)
            return { streamingText: next }
          })
        } else if (delta?.type === 'thinking_delta' && delta.thinking) {
          // thinking deltas accumulate separately - we store under a key
          useSessionStore.setState((state) => {
            const current = state.streamingText.get(`${sessionId}:thinking`) ?? ''
            const next = new Map(state.streamingText)
            next.set(`${sessionId}:thinking`, current + delta.thinking)
            return { streamingText: next }
          })
        }
        return
      }

      // Non-streaming message: clear streaming text and append message
      if (msg.type === 'assistant' || msg.type === 'user') {
        clearStreamingText(sessionId)
        clearStreamingText(`${sessionId}:thinking`)
      }

      if (msg.type === 'result') {
        const resultMsg = msg as ResultMessage
        clearStreamingText(sessionId)
        clearStreamingText(`${sessionId}:thinking`)

        updateSession(sessionId, {
          cost: {
            totalUsd: resultMsg.total_cost_usd ?? 0,
            inputTokens: resultMsg.usage?.input_tokens ?? 0,
            outputTokens: resultMsg.usage?.output_tokens ?? 0,
          },
        })
      }

      appendMessage(sessionId, message)
    })

    const unsubStatus = window.api.onSessionStatus((raw) => {
      const { sessionId, status } = raw as SessionStatusEvent
      updateSession(sessionId, { status })
    })

    const unsubPermission = window.api.onSessionPermission((raw) => {
      const permission = raw as SessionPermissionEvent
      addPermission(permission)
    })

    return () => {
      unsubMessage()
      unsubStatus()
      unsubPermission()
    }
  }, [appendMessage, updateSession, addPermission, updateStreamingText, clearStreamingText])
}
