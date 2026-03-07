import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bot, ChevronRight, Loader2, CheckCircle, XCircle } from 'lucide-react'
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
}

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

export function SubagentBlock({ agentType, status, description, agentId, prompt }: SubagentBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [userCollapsed, setUserCollapsed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const streamingText = useSessionStore((s) => agentId ? s.subagentStreaming.get(agentId) : undefined)
  const agentMessages = useSessionStore((s) => agentId ? (s.subagentMessages.get(agentId) ?? []) : [])

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
  }, [agentMessages.length, streamingText, expanded])

  function handleToggle() {
    setExpanded((v) => !v)
    setUserCollapsed(true)
  }

  // One-line preview from streaming text
  const preview = streamingText
    ? streamingText.split('\n').filter(Boolean).pop()?.slice(0, 100)
    : description

  const StatusIcon = status === 'running' ? Loader2
    : status === 'error' ? XCircle
    : CheckCircle

  const statusColor = status === 'running' ? 'text-blue-400'
    : status === 'error' ? 'text-red-400'
    : 'text-green-500'

  return (
    <div className="my-1">
      {/* Collapsed summary bar */}
      <button
        onClick={handleToggle}
        className="group flex w-full items-center gap-2 py-0.5 text-left"
      >
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-stone-600"
        >
          <ChevronRight size={14} />
        </motion.span>
        <Bot size={14} className="flex-shrink-0 text-blue-400" />
        <span className="text-sm font-medium text-stone-300">{agentType}</span>
        <StatusIcon
          size={12}
          className={`flex-shrink-0 ${statusColor} ${status === 'running' ? 'animate-spin' : ''}`}
        />
        {preview && !expanded && (
          <span className="min-w-0 flex-1 truncate text-sm italic text-stone-500">
            {preview}
          </span>
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
            <div className="ml-5 max-h-96 overflow-y-auto border-l-2 border-blue-500/30 pl-3 pt-1">
              {/* Prompt */}
              {prompt && (
                <div className="mb-2 rounded bg-stone-900/40 px-3 py-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-stone-600">Prompt</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-400">{prompt}</p>
                </div>
              )}

              {/* Subagent messages */}
              {agentMessages.map((rawMsg, idx) => {
                const msg = rawMsg as Record<string, unknown>

                if (msg.type === 'subagent_text' && msg.text) {
                  return (
                    <div key={idx} className="py-1">
                      <TextBlock text={msg.text as string} />
                    </div>
                  )
                }

                if (msg.type === 'user') return null

                if (msg.type === 'assistant') {
                  const messageObj = msg.message as { content?: ContentBlock[] } | undefined
                  const blocks = (messageObj?.content ?? msg.content ?? []) as ContentBlock[]
                  const hasContent = blocks.some((b) =>
                    (b.type === 'text' && b.text) || b.type === 'tool_use'
                  )
                  if (!hasContent) return null
                  return (
                    <div key={idx} className="space-y-1 py-1">
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
                <div className="py-1">
                  <TextBlock text={streamingText} />
                  <span className="inline-block h-3.5 w-0.5 animate-pulse bg-blue-400 align-text-bottom" />
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
