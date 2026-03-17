import { Bot, CheckCircle, ChevronRight, Loader2, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { TextBlock } from '../messages/TextBlock'
import { ToolUseBlock } from './ToolUseBlock'

type SubagentBlockProps = {
  sessionId: string
  agentType: string
  status: 'running' | 'done' | 'error'
  description?: string
  agentId?: string
  prompt?: string
  result?: string
}

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

export function SubagentBlock({
  agentType,
  status,
  description,
  agentId,
  prompt,
  result,
}: SubagentBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [userCollapsed, setUserCollapsed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const streamingText = useSessionStore((s) =>
    agentId ? s.subagentStreaming.get(agentId) : undefined,
  )
  const agentMessagesRaw = useSessionStore((s) =>
    agentId ? s.subagentMessages.get(agentId) : undefined,
  )
  const agentMessages = useMemo(() => agentMessagesRaw ?? [], [agentMessagesRaw])

  // Auto-expand when running, auto-collapse when done (unless user manually toggled)
  useEffect(() => {
    if (userCollapsed) return
    if (status === 'running') {
      setExpanded(true)
    } else if (status === 'done' || status === 'error') {
      setExpanded(false)
    }
  }, [status, userCollapsed])

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expanded])

  function handleToggle() {
    setExpanded((v) => !v)
    setUserCollapsed(true)
  }

  // Build tool result map from user messages within the subagent conversation
  const subagentToolResultMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const rawMsg of agentMessages) {
      const msg = rawMsg as Record<string, unknown>
      if (msg.type !== 'user') continue
      const messageObj = msg.message as
        | { content?: Array<{ type: string; tool_use_id?: string; content?: unknown }> }
        | undefined
      const content = messageObj?.content ?? msg.content
      if (!Array.isArray(content)) continue
      for (const block of content as Array<{
        type: string
        tool_use_id?: string
        content?: unknown
      }>) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const text =
            typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? (block.content as Array<{ type: string; text?: string }>)
                    .filter((b) => b.type === 'text')
                    .map((b) => b.text ?? '')
                    .join('\n')
                : ''
          if (text) map.set(block.tool_use_id, text)
        }
      }
    }
    return map
  }, [agentMessages])

  // One-line preview from streaming text or description
  const preview = streamingText
    ? streamingText.split('\n').filter(Boolean).pop()?.slice(0, 100)
    : description

  const StatusIcon = status === 'running' ? Loader2 : status === 'error' ? XCircle : CheckCircle

  const statusColor =
    status === 'running'
      ? 'text-[var(--color-info)]'
      : status === 'error'
        ? 'text-[var(--color-error)]'
        : 'text-[var(--color-success)]'

  // Count tool uses for the summary
  const toolUseCount = agentMessages.filter((rawM) => {
    const m = rawM as Record<string, unknown>
    if (m.type !== 'assistant') return false
    const messageObj = m.message as { content?: ContentBlock[] } | undefined
    const blocks = (messageObj?.content ?? m.content ?? []) as ContentBlock[]
    return blocks.some((b) => b.type === 'tool_use')
  }).length

  return (
    <div className="my-1">
      {/* Summary bar */}
      <button
        type="button"
        onClick={handleToggle}
        className="group flex w-full items-center gap-2 py-0.5 text-left"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="shrink-0 text-base-text-faint"
        >
          <ChevronRight size={14} />
        </motion.span>
        <Bot size={14} className="shrink-0 text-info" />
        <span className="font-medium text-base-text text-sm">{agentType}</span>
        <StatusIcon
          size={12}
          className={`shrink-0 ${statusColor} ${status === 'running' ? 'animate-spin' : ''}`}
        />
        {!expanded && (
          <>
            {status === 'done' && toolUseCount > 0 && (
              <span className="text-base-text-faint text-xs">
                {toolUseCount} tool{toolUseCount !== 1 ? 's' : ''}
              </span>
            )}
            {preview && (
              <span className="min-w-0 flex-1 truncate text-base-text-muted text-sm italic">
                {preview}
              </span>
            )}
          </>
        )}
      </button>

      {/* Expanded conversation */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="ml-5 max-h-96 overflow-y-auto border-info/30 border-l-2 pt-1 pl-3">
              {/* Prompt */}
              {prompt && (
                <div className="mb-2 rounded bg-base-surface/40 px-3 py-2">
                  <p className="mb-1 font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                    Prompt
                  </p>
                  <p className="whitespace-pre-wrap text-base-text-secondary text-xs leading-relaxed">
                    {prompt}
                  </p>
                </div>
              )}

              {/* Subagent conversation: tool calls, text responses, streaming */}
              {agentMessages
                .filter((m) => (m as Record<string, unknown>).type !== 'user')
                .map((rawMsg, idx) => {
                  const msg = rawMsg as Record<string, unknown>

                  if (msg.type === 'subagent_text' && msg.text) {
                    return (
                      <div key={`st-${idx}`} className="py-1">
                        <TextBlock text={msg.text as string} />
                      </div>
                    )
                  }

                  if (msg.type === 'assistant') {
                    const messageObj = msg.message as { content?: ContentBlock[] } | undefined
                    const blocks = (messageObj?.content ?? msg.content ?? []) as ContentBlock[]
                    if (blocks.length === 0) return null

                    return (
                      <div key={`a-${idx}`} className="space-y-1.5 py-1">
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
                                result={subagentToolResultMap.get(block.id ?? '')}
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
                <div className="py-1">
                  <TextBlock text={streamingText} isStreaming />
                  <span className="inline-block h-3.5 w-0.5 animate-pulse bg-info align-text-bottom" />
                </div>
              )}

              {/* Final result (returned to parent as tool_result) */}
              {result && status !== 'running' && (
                <div className="mt-1 mb-1 rounded bg-base-surface/40 px-3 py-2">
                  <p className="mb-1 font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                    Result
                  </p>
                  <div className="text-base-text-secondary text-xs leading-relaxed">
                    <TextBlock text={result} />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
