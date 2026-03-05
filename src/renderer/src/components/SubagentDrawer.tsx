import { X, Bot } from 'lucide-react'
import { useUiStore } from '../store/ui-store'
import { useSessionStore } from '../store/session-store'
import { AssistantMessage } from './messages/AssistantMessage'
import { UserMessage } from './messages/UserMessage'

type SdkMessage = {
  type: string
  content?: unknown
  [key: string]: unknown
}

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
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

export function SubagentDrawer() {
  const { subagentDrawer, closeSubagentDrawer } = useUiStore()
  const { messages } = useSessionStore()

  if (!subagentDrawer.open || !subagentDrawer.sessionId) return null

  const sessionMessages = messages.get(subagentDrawer.sessionId) ?? []

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={closeSubagentDrawer}
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[500px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <Bot size={16} className="text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-200">
              {subagentDrawer.agentType ?? 'Subagent'}
            </p>
            <p className="text-xs text-zinc-500">Session: {subagentDrawer.sessionId.slice(0, 8)}...</p>
          </div>
          <button
            onClick={closeSubagentDrawer}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {sessionMessages.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-zinc-600">
              No messages yet
            </div>
          )}
          {sessionMessages.map((rawMsg, idx) => {
            const msg = rawMsg as SdkMessage
            if (msg.type === 'user') {
              return <UserMessage key={idx} content={msg.content as string | UserContentBlock[]} />
            }
            if (msg.type === 'assistant') {
              return (
                <AssistantMessage
                  key={idx}
                  content={(msg.content ?? []) as ContentBlock[]}
                />
              )
            }
            return null
          })}
        </div>
      </div>
    </>
  )
}
