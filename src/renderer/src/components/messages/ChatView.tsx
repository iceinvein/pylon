import { memo, useEffect, useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { useSessionStore } from '../../store/session-store'
import { useAgentGrouping } from '../../hooks/use-agent-grouping'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { SystemMessage } from './SystemMessage'
import { ResultMessage } from './ResultMessage'
import { PermissionPrompt } from './PermissionPrompt'
import { QuestionPrompt } from './QuestionPrompt'
import { TextBlock } from './TextBlock'
import { SubagentBlock } from '../tools/SubagentBlock'
import { ToolUseBlock } from '../tools/ToolUseBlock'
import { isCommitRequest, hasGitCommitTools, CommitCard } from '../tools/CommitCard'
import { Zap, Minimize2 } from 'lucide-react'

type SdkMessage = {
  type: string
  role?: string
  content?: unknown
  subtype?: string
  session_id?: string
  message?: {
    content?: AssistantContentBlock[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

type AssistantContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

type ToolResultBlock = {
  type: string
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
}

function buildToolResultMap(messages: unknown[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of messages) {
    const msg = raw as SdkMessage
    if (msg.type !== 'user') continue
    const rawContent = msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content
    if (!Array.isArray(rawContent)) continue
    for (const block of rawContent as ToolResultBlock[]) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const text = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
            : ''
        if (text) map.set(block.tool_use_id, text)
      }
    }
  }
  return map
}

const emptyMessages: unknown[] = []

type ChatViewProps = {
  sessionId: string
}

export const ChatView = memo(function ChatView({ sessionId }: ChatViewProps) {
  // Use fine-grained selectors to avoid re-rendering on unrelated store changes
  const sessionMessages = useSessionStore((s) => s.messages.get(sessionId)) ?? emptyMessages
  const streaming = useSessionStore((s) => s.streamingText.get(sessionId))
  const pendingPermissions = useSessionStore((s) => s.pendingPermissions)
  const pendingQuestions = useSessionStore((s) => s.pendingQuestions)
  const sessionPermissions = pendingPermissions.filter((p) => p.sessionId === sessionId)
  const sessionQuestions = pendingQuestions.filter((q) => q.sessionId === sessionId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const { agentMap, mainThreadMessages } = useAgentGrouping(sessionMessages)

  // Find the last compact_boundary and only show messages after it
  const { visibleMessages, wasCompacted, compactMetadata } = useMemo(() => {
    let lastBoundaryIdx = -1
    let metadata: { trigger?: string; pre_tokens?: number } | null = null
    for (let i = mainThreadMessages.length - 1; i >= 0; i--) {
      const m = mainThreadMessages[i] as SdkMessage
      if (m.type === 'system' && m.subtype === 'compact_boundary') {
        lastBoundaryIdx = i
        metadata = (m as { compact_metadata?: { trigger?: string; pre_tokens?: number } }).compact_metadata ?? null
        break
      }
    }
    if (lastBoundaryIdx === -1) {
      return { visibleMessages: mainThreadMessages, wasCompacted: false, compactMetadata: null }
    }
    // Skip the SDK-injected summary user message that immediately follows the boundary
    let startIdx = lastBoundaryIdx + 1
    const next = mainThreadMessages[startIdx] as SdkMessage | undefined
    if (next?.type === 'user' && isCompactSummaryMessage(next)) {
      startIdx++
    }
    return {
      visibleMessages: mainThreadMessages.slice(startIdx),
      wasCompacted: true,
      compactMetadata: metadata,
    }
  }, [mainThreadMessages])

  const toolResultMap = useMemo(() => buildToolResultMap(sessionMessages), [sessionMessages])

  // Track whether the user has scrolled away from the bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    function onScroll() {
      if (!container) return
      const threshold = 120
      isNearBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll only when user is already near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [sessionMessages.length, streaming, sessionQuestions.length])

  async function handlePermissionRespond(requestId: string, behavior: 'allow' | 'deny') {
    await window.api.respondToPermission(requestId, behavior)
    useSessionStore.getState().removePermission(requestId)
  }

  async function handleQuestionRespond(requestId: string, answers: Record<string, string>) {
    await window.api.respondToQuestion(requestId, answers)
    useSessionStore.getState().removeQuestion(requestId)
  }

  function renderAssistantContent(content: AssistantContentBlock[]) {
    const hasAgentBlocks = content.some((b) => b.type === 'tool_use' && b.name === 'Agent')

    if (!hasAgentBlocks) {
      return (
        <AssistantMessage
          content={content}
          sessionId={sessionId}
          toolResultMap={toolResultMap}
        />
      )
    }

    // Render message normally but replace Agent tool_use blocks with SubagentBlock cards
    return (
      <div className="space-y-1 px-6 py-2">
        {content.map((block, i) => {
          if (block.type === 'tool_use' && block.name === 'Agent' && block.id) {
            const agent = agentMap.get(block.id)
            const status = agent?.done ? (agent.isError ? 'error' : 'done') : 'running'
            return (
              <SubagentBlock
                key={i}
                sessionId={sessionId}
                agentType={agent?.agentType ?? 'agent'}
                status={status}
                description={agent?.description}
                agentId={block.id}
                prompt={agent?.prompt}
                result={agent?.result}
              />
            )
          }
          if (block.type === 'text' && block.text) {
            return <TextBlock key={i} text={block.text} />
          }
          if (block.type === 'thinking' && block.thinking) {
            return null
          }
          if (block.type === 'tool_use') {
            return (
              <ToolUseBlock
                key={i}
                toolName={block.name ?? 'unknown'}
                input={block.input ?? {}}
                toolUseId={block.id}
                result={toolResultMap.get(block.id ?? '')}
              />
            )
          }
          return null
        })}
      </div>
    )
  }

  // Group messages into conversation turns: each turn starts with a user message
  // and contains all subsequent messages until the next user message.
  // This scopes sticky positioning to each turn so they don't overlap.
  const turns = useMemo(() => {
    const groups: { userIdx: number | null; messages: { msg: SdkMessage; idx: number }[] }[] = []
    let current: { userIdx: number | null; messages: { msg: SdkMessage; idx: number }[] } = { userIdx: null, messages: [] }

    for (let idx = 0; idx < visibleMessages.length; idx++) {
      const msg = visibleMessages[idx] as SdkMessage
      const isVisibleUser = msg.type === 'user' && !isToolResultMessage(msg) && !extractSkillName(msg)

      if (isVisibleUser) {
        // Push current group if it has messages
        if (current.messages.length > 0) {
          groups.push(current)
        }
        current = { userIdx: idx, messages: [{ msg, idx }] }
      } else {
        current.messages.push({ msg, idx })
      }
    }
    if (current.messages.length > 0) {
      groups.push(current)
    }
    return groups
  }, [visibleMessages])

  // Detect commit turns: user message is a commit request + assistant has git tool calls.
  // With includePartialMessages, each tool_use arrives in its own assistant message,
  // so we aggregate tool blocks across ALL assistant messages in the turn before checking.
  const commitTurnIndices = useMemo(() => {
    const indices = new Set<number>()
    for (const turn of turns) {
      const userMsg = turn.messages.find(({ msg }) => msg.type === 'user' && !isToolResultMessage(msg))
      if (!userMsg) continue
      const rawContent = userMsg.msg.content ?? (userMsg.msg.message as Record<string, unknown> | undefined)?.content
      const userText = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? (rawContent as Array<{ type: string; text?: string }>).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ')
          : ''
      if (!isCommitRequest(userText)) continue

      // Aggregate tool blocks from ALL assistant messages in this turn
      const allToolBlocks: Array<{ name: string; input: Record<string, unknown> }> = []
      for (const { msg } of turn.messages) {
        if (msg.type !== 'assistant') continue
        const messageObj = msg.message as { content?: AssistantContentBlock[] } | undefined
        const blocks = (messageObj?.content ?? msg.content ?? []) as AssistantContentBlock[]
        for (const b of blocks) {
          if (b.type === 'tool_use') {
            allToolBlocks.push({ name: b.name ?? '', input: b.input ?? {} })
          }
        }
      }

      if (hasGitCommitTools(allToolBlocks)) {
        for (const m of turn.messages) indices.add(m.idx)
      }
    }
    return indices
  }, [turns])

  function renderMessage(msg: SdkMessage, idx: number) {
    if (msg.type === 'user') {
      if (isToolResultMessage(msg)) return null
      const skillName = extractSkillName(msg)
      if (skillName) {
        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-2 px-6 py-1">
              <Zap size={12} className="flex-shrink-0 text-purple-400/70" />
              <span className="text-xs text-stone-500">
                Loaded skill <span className="text-stone-400">{skillName}</span>
              </span>
            </div>
          </motion.div>
        )
      }
      return <UserMessage key={`user-${idx}`} message={msg as Record<string, unknown>} />
    }

    if (msg.type === 'assistant') {
      const messageObj = msg.message as { content?: AssistantContentBlock[] } | undefined
      const content = (messageObj?.content ?? msg.content ?? []) as AssistantContentBlock[]
      return (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {renderAssistantContent(content)}
        </motion.div>
      )
    }

    if (msg.type === 'system') {
      const sub = msg.subtype
      if (
        sub === 'init' ||
        sub === 'status' ||
        sub === 'hook_started' ||
        sub === 'hook_response' ||
        sub === 'task_started' ||
        sub === 'compact_boundary'
      ) return null
      const content = String(msg.content ?? msg.subtype ?? 'System message')
      return (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <SystemMessage content={content} subtype={sub} />
        </motion.div>
      )
    }

    if (msg.type === 'result') {
      return (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <ResultMessage
            isError={msg.is_error === true}
            model={msg.model as string | undefined}
            totalCostUsd={msg.total_cost_usd as number | undefined}
            durationMs={msg.duration_ms as number | undefined}
            numTurns={msg.num_turns as number | undefined}
            inputTokens={(msg.usage as { input_tokens?: number } | undefined)?.input_tokens}
            outputTokens={(msg.usage as { output_tokens?: number } | undefined)?.output_tokens}
            errorMessage={msg.error as string | undefined}
          />
        </motion.div>
      )
    }

    if (msg.type === 'error') {
      return (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <ResultMessage
            isError={true}
            errorMessage={msg.error as string | undefined}
          />
        </motion.div>
      )
    }

    return null
  }

  return (
    <div ref={scrollContainerRef} className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl">
      {wasCompacted && (
        <div className="flex items-center gap-3 px-6 py-3">
          <div className="h-px flex-1 bg-stone-700/50" />
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <Minimize2 size={12} />
            <span>Conversation {compactMetadata?.trigger === 'auto' ? 'auto-' : ''}compacted</span>
            {compactMetadata?.pre_tokens && (
              <span className="text-stone-600">
                ({Math.round(compactMetadata.pre_tokens / 1000)}k tokens)
              </span>
            )}
          </div>
          <div className="h-px flex-1 bg-stone-700/50" />
        </div>
      )}

      {turns.map((turn, turnIdx) => {
        const isCommitTurn = turn.messages.some(({ idx }) => commitTurnIndices.has(idx))

        if (isCommitTurn) {
          // Render commit turns as a single CommitCard instead of individual tool blocks.
          // Collect all tool blocks from every assistant message in the turn.
          const allToolBlocks: Array<{ name: string; input: Record<string, unknown>; id?: string }> = []
          const finalTextBlocks: Array<{ text: string }> = []

          for (const { msg } of turn.messages) {
            if (msg.type !== 'assistant') continue
            const messageObj = msg.message as { content?: AssistantContentBlock[] } | undefined
            const blocks = (messageObj?.content ?? msg.content ?? []) as AssistantContentBlock[]
            for (const b of blocks) {
              if (b.type === 'tool_use' && b.name) {
                allToolBlocks.push({ name: b.name, input: b.input ?? {}, id: b.id })
              }
            }
            // Collect text blocks from the last assistant message (the commit summary)
            const texts = blocks.filter((b) => b.type === 'text' && b.text)
            if (texts.length > 0) {
              finalTextBlocks.length = 0 // reset — only keep text from the latest message
              for (const t of texts) finalTextBlocks.push({ text: t.text! })
            }
          }

          // Render: user message → CommitCard → final text → result
          return (
            <div key={turn.userIdx ?? `pre-${turnIdx}`}>
              {turn.messages.map(({ msg, idx }) => {
                if (msg.type === 'assistant') return null // handled by CommitCard below
                return renderMessage(msg, idx)
              })}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <CommitCard
                  toolBlocks={allToolBlocks}
                  toolResultMap={toolResultMap}
                  isStreaming={!!streaming}
                />
                {finalTextBlocks.map((block, i) => (
                  <div key={`commit-text-${i}`} className="px-6 py-1">
                    <TextBlock text={block.text} />
                  </div>
                ))}
              </motion.div>
            </div>
          )
        }

        // Normal turn rendering
        return (
          <div key={turn.userIdx ?? `pre-${turnIdx}`}>
            {turn.messages.map(({ msg, idx }) => renderMessage(msg, idx))}
          </div>
        )
      })}

      {streaming && (
        <motion.div
          key="streaming"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="px-6 py-2"
        >
          <TextBlock text={streaming} />
          <span className="inline-block h-4 w-0.5 animate-pulse bg-stone-400 align-text-bottom" />
        </motion.div>
      )}

      {sessionPermissions.map((perm) => (
        <motion.div
          key={perm.requestId}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <PermissionPrompt
            permission={perm}
            onRespond={handlePermissionRespond}
          />
        </motion.div>
      ))}

      {sessionQuestions.map((q) => (
        <motion.div
          key={q.requestId}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <QuestionPrompt
            question={q}
            onRespond={handleQuestionRespond}
          />
        </motion.div>
      ))}

      <div ref={bottomRef} />
      </div>
    </div>
  )
})

/** Detect if a user message is a tool_result (SDK internal, not user-typed) */
function isToolResultMessage(msg: SdkMessage): boolean {
  const rawContent = msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content
  if (!Array.isArray(rawContent)) return false
  const blocks = rawContent as Array<{ type: string }>
  return blocks.length > 0 && blocks.every((b) => b.type === 'tool_result')
}

/** Detect if a user message is synthetic skill content injected by the SDK */
function extractSkillName(msg: SdkMessage): string | null {
  const rawContent = msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content
  let text = ''
  if (typeof rawContent === 'string') {
    text = rawContent
  } else if (Array.isArray(rawContent)) {
    text = (rawContent as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n')
  }
  if (!text) return null

  // Match "Base directory for this skill: .../skills/<name>"
  const baseDir = text.match(/Base directory for this skill:.*\/skills\/([^\s/]+)/)
  if (baseDir) return baseDir[1]

  // Match skill frontmatter "name: <skill-name>"
  const nameHeader = text.match(/^---\s*\nname:\s*(.+)/m)
  if (nameHeader) return nameHeader[1].trim()

  // Match "<skill-name>" or "<command-name>" tags
  const tagMatch = text.match(/<(?:skill-name|command-name)>\s*(.+?)\s*<\//)
  if (tagMatch) return tagMatch[1]

  // Broad check: contains skill-like content patterns
  if (
    text.includes('Base directory for this skill:') ||
    text.includes('skill_directory') ||
    (text.includes('---\nname:') && text.includes('description:'))
  ) {
    return 'unknown'
  }

  return null
}

/** Detect the SDK-injected compact summary user message */
function isCompactSummaryMessage(msg: SdkMessage): boolean {
  const rawContent = msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content
  let text = ''
  if (typeof rawContent === 'string') {
    text = rawContent
  } else if (Array.isArray(rawContent)) {
    text = (rawContent as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n')
  }
  return text.includes('This session is being continued from a previous conversation')
}
