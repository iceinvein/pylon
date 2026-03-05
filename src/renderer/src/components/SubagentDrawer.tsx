import { useEffect, useRef } from 'react'
import { X, Bot, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useUiStore } from '../store/ui-store'
import { useSessionStore } from '../store/session-store'
import { useAgentGrouping } from '../hooks/use-agent-grouping'
import { TextBlock } from './messages/TextBlock'
import { ToolUseBlock } from './tools/ToolUseBlock'

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

export function SubagentDrawer() {
  const { subagentDrawer, closeSubagentDrawer } = useUiStore()
  const { messages, subagentStreaming, subagentMessages } = useSessionStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const sessionMessages = subagentDrawer.sessionId ? (messages.get(subagentDrawer.sessionId) ?? []) : []
  const { agentMap } = useAgentGrouping(sessionMessages)

  const agentId = subagentDrawer.agentId
  const agent = agentId ? agentMap.get(agentId) : null
  const streamingText = agentId ? subagentStreaming.get(agentId) : null
  const agentMessages = agentId ? (subagentMessages.get(agentId) ?? []) : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages.length, streamingText])

  if (!subagentDrawer.open || !subagentDrawer.sessionId) return null

  const statusColor = agent?.done
    ? agent.isError ? 'text-red-400' : 'text-green-400'
    : 'text-blue-400'

  const StatusIcon = agent?.done
    ? agent.isError ? XCircle : CheckCircle
    : Loader2

  const statusLabel = agent?.done
    ? agent.isError ? 'error' : 'done'
    : 'running'

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={closeSubagentDrawer}
      />

      <div className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col bg-stone-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-stone-800/80 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-800">
            <Bot size={14} className="text-stone-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13px] font-medium text-stone-200">
                {agent?.agentType ?? subagentDrawer.agentType ?? 'Subagent'}
              </p>
              <span className={`flex items-center gap-1 text-[11px] ${statusColor}`}>
                <StatusIcon size={11} className={statusLabel === 'running' ? 'animate-spin' : ''} />
                {statusLabel}
              </span>
            </div>
            {agent?.description && (
              <p className="truncate text-[11px] text-stone-500">{agent.description}</p>
            )}
          </div>
          <button
            onClick={closeSubagentDrawer}
            className="flex h-6 w-6 items-center justify-center rounded text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-400"
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
          {/* Prompt */}
          {agent?.prompt && (
            <div className="border-b border-stone-800/50 bg-stone-900/40 px-4 py-3">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-600">Prompt</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-stone-400">{agent.prompt}</p>
            </div>
          )}

          {/* Subagent conversation messages */}
          {agentMessages.map((rawMsg, idx) => {
            const msg = rawMsg as Record<string, unknown>

            // Accumulated text block from streaming
            if (msg.type === 'subagent_text' && msg.text) {
              return (
                <div key={idx} className="px-4 py-2.5">
                  <TextBlock text={msg.text as string} />
                </div>
              )
            }

            // User message (tool_result from subagent's tool calls)
            if (msg.type === 'user') {
              return null // Tool results are internal, skip
            }

            // Assistant message from subagent
            if (msg.type === 'assistant') {
              const messageObj = msg.message as { content?: ContentBlock[] } | undefined
              const blocks = (messageObj?.content ?? msg.content ?? []) as ContentBlock[]
              const hasContent = blocks.some((b) =>
                (b.type === 'text' && b.text) || b.type === 'tool_use'
              )
              if (!hasContent) return null
              return (
                <div key={idx} className="space-y-1 px-4 py-2.5">
                  {blocks.map((block, i) => {
                    if (block.type === 'text' && block.text) {
                      return <TextBlock key={i} text={block.text} />
                    }
                    if (block.type === 'thinking') return null
                    if (block.type === 'tool_use') {
                      return (
                        <ToolUseBlock
                          key={i}
                          toolName={block.name ?? 'unknown'}
                          input={block.input ?? {}}
                          toolUseId={block.id}
                        />
                      )
                    }
                    return null
                  })}
                </div>
              )
            }

            return null
          })}

          {/* Live streaming text */}
          {streamingText && (
            <div className="px-4 py-2.5">
              <TextBlock text={streamingText} />
              <span className="inline-block h-3.5 w-0.5 animate-pulse bg-stone-500 align-text-bottom" />
            </div>
          )}

          {/* Empty state */}
          {!agent?.prompt && agentMessages.length === 0 && !streamingText && (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px] text-stone-700">
                {agent?.done ? 'No messages recorded.' : 'Waiting for agent...'}
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </>
  )
}
