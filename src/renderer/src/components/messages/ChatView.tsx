import { useEffect, useRef } from 'react'
import { useSessionStore } from '../../store/session-store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { SystemMessage } from './SystemMessage'
import { ResultMessage } from './ResultMessage'
import { PermissionPrompt } from './PermissionPrompt'
import { TextBlock } from './TextBlock'

type SdkMessage = {
  type: string
  role?: string
  content?: unknown
  subtype?: string
  session_id?: string
  [key: string]: unknown
}

type UserContentBlock = {
  type: string
  text?: string
  source?: {
    type: string
    media_type: string
    data: string
  }
}

type AssistantContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

type ChatViewProps = {
  sessionId: string
}

export function ChatView({ sessionId }: ChatViewProps) {
  const { messages, pendingPermissions, streamingText } = useSessionStore()
  const sessionMessages = messages.get(sessionId) ?? []
  const streaming = streamingText.get(sessionId)
  const sessionPermissions = pendingPermissions.filter((p) => p.sessionId === sessionId)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages.length, streaming])

  async function handlePermissionRespond(requestId: string, behavior: 'allow' | 'deny') {
    await window.api.respondToPermission(requestId, behavior)
    useSessionStore.getState().removePermission(requestId)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
      {sessionMessages.map((rawMsg, idx) => {
        const msg = rawMsg as SdkMessage

        if (msg.type === 'user') {
          const content = msg.content as string | UserContentBlock[]
          return <UserMessage key={idx} content={content} />
        }

        if (msg.type === 'assistant') {
          const content = (msg.content ?? []) as AssistantContentBlock[]
          return <AssistantMessage key={idx} content={content} sessionId={sessionId} />
        }

        if (msg.type === 'system') {
          const subtype = msg.subtype ?? msg.session_id ? 'session' : undefined
          const content = msg.session_id
            ? `Session: ${String(msg.session_id)}`
            : String(msg.content ?? msg.subtype ?? 'System message')
          return <SystemMessage key={idx} content={content} subtype={subtype} />
        }

        if (msg.type === 'result') {
          return (
            <ResultMessage
              key={idx}
              isError={msg.is_error === true}
              totalCostUsd={msg.total_cost_usd as number | undefined}
              durationMs={msg.duration_ms as number | undefined}
              numTurns={msg.num_turns as number | undefined}
              inputTokens={(msg.usage as { input_tokens?: number } | undefined)?.input_tokens}
              outputTokens={(msg.usage as { output_tokens?: number } | undefined)?.output_tokens}
              errorMessage={msg.error as string | undefined}
            />
          )
        }

        if (msg.type === 'error') {
          return (
            <ResultMessage
              key={idx}
              isError={true}
              errorMessage={msg.error as string | undefined}
            />
          )
        }

        return null
      })}

      {streaming && (
        <div className="px-4 py-2">
          <div className="max-w-[85%]">
            <TextBlock text={streaming} />
            <span className="inline-block h-4 w-0.5 animate-pulse bg-zinc-400 align-text-bottom" />
          </div>
        </div>
      )}

      {sessionPermissions.map((perm) => (
        <PermissionPrompt
          key={perm.requestId}
          permission={perm}
          onRespond={handlePermissionRespond}
        />
      ))}

      <div ref={bottomRef} />
    </div>
  )
}
