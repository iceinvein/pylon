import { Minimize2, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { memo, useEffect, useMemo, useRef } from 'react'
import { useAgentGrouping } from '../../hooks/use-agent-grouping'
import { detectChoices } from '../../lib/detect-choices'
import { parsePlanSections } from '../../lib/parse-plan'
import { useSessionStore } from '../../store/session-store'
import { useUiStore } from '../../store/ui-store'
import { CommitCard, hasGitCommitTools, isCommitRequest } from '../tools/CommitCard'
import { PlanCard } from '../tools/PlanCard'
import { SubagentBlock } from '../tools/SubagentBlock'
import { ToolUseBlock } from '../tools/ToolUseBlock'
import { AssistantMessage } from './AssistantMessage'
import { ChoiceButtons } from './ChoiceButtons'
import { PermissionPrompt } from './PermissionPrompt'
import { QuestionPrompt } from './QuestionPrompt'
import { ResultMessage } from './ResultMessage'
import { SystemMessage } from './SystemMessage'
import { TextBlock } from './TextBlock'
import { UserMessage } from './UserMessage'

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
        const text =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content
                  .filter((b) => b.type === 'text')
                  .map((b) => b.text ?? '')
                  .join('\n')
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
  const detectedPlans = useSessionStore((s) => s.detectedPlans.get(sessionId)) ?? []
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevSessionIdRef = useRef(sessionId)
  const savedScrollPositions = useRef(new Map<string, number>())

  const { agentMap, mainThreadMessages } = useAgentGrouping(sessionMessages)

  // Find the last compact_boundary and only show messages after it
  const { visibleMessages, wasCompacted, compactMetadata } = useMemo(() => {
    let lastBoundaryIdx = -1
    let metadata: { trigger?: string; pre_tokens?: number } | null = null
    for (let i = mainThreadMessages.length - 1; i >= 0; i--) {
      const m = mainThreadMessages[i] as SdkMessage
      if (m.type === 'system' && m.subtype === 'compact_boundary') {
        lastBoundaryIdx = i
        metadata =
          (m as { compact_metadata?: { trigger?: string; pre_tokens?: number } })
            .compact_metadata ?? null
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

  // Map from visibleMessages index → original sessionMessages index.
  // The flow graph uses sessionMessages indices, so we need this to set
  // data-message-index attributes that match flow graph messageIndex values.
  const originalIndexMap = useMemo(() => {
    const map = new Map<number, number>()
    // Build identity map: message object → sessionMessages index
    const identityMap = new Map<unknown, number>()
    for (let i = 0; i < sessionMessages.length; i++) {
      identityMap.set(sessionMessages[i], i)
    }
    for (let i = 0; i < visibleMessages.length; i++) {
      const origIdx = identityMap.get(visibleMessages[i])
      if (origIdx !== undefined) map.set(i, origIdx)
    }
    return map
  }, [sessionMessages, visibleMessages])

  const toolResultMap = useMemo(() => buildToolResultMap(sessionMessages), [sessionMessages])

  // For each plan file path, only show the PlanCard on the LAST Write/Edit.
  // When the agent iterates on a plan (e.g. due to review feedback), intermediate
  // writes should not render cards — only the final version matters.
  const finalPlanToolUseIds = useMemo(() => {
    const lastByPath = new Map<string, string>() // filePath → toolUseId (last wins)
    for (const plan of detectedPlans) {
      lastByPath.set(plan.filePath, plan.toolUseId)
    }
    return new Set(lastByPath.values())
  }, [detectedPlans])

  const planSectionTitles = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const plan of detectedPlans) {
      const toolUseMsg = sessionMessages.find((raw) => {
        const msg = raw as SdkMessage
        if (msg.type !== 'assistant') return false
        const content = (msg.message?.content ?? msg.content ?? []) as AssistantContentBlock[]
        return content.some((b) => b.type === 'tool_use' && b.id === plan.toolUseId)
      }) as SdkMessage | undefined

      if (!toolUseMsg) continue
      const content = (toolUseMsg.message?.content ??
        toolUseMsg.content ??
        []) as AssistantContentBlock[]
      const block = content.find((b) => b.type === 'tool_use' && b.id === plan.toolUseId)
      const fileContent = String(block?.input?.content ?? '')
      if (fileContent) {
        const sections = parsePlanSections(fileContent)
        const titles = sections.flatMap((s) =>
          s.children && s.children.length > 0 ? s.children.map((c) => c.title) : [s.title],
        )
        map.set(plan.toolUseId, titles)
      }
    }
    return map
  }, [detectedPlans, sessionMessages])

  // Detect skill content messages injected by the SDK after Skill tool invocations.
  // Flow: assistant calls Skill tool → tool_result "Launching skill: X" → SDK injects
  // a separate plain-text user message with skill markdown. We track the tool_use IDs
  // and mark the next text-only user message after each tool_result as skill content.
  const skillContentIndices = useMemo(() => {
    const indices = new Map<number, string>() // visibleMessages index → skill name
    const skillToolUseIds = new Map<string, string>() // tool_use_id → skill name

    // Pass 1: Find all Skill tool_use blocks in assistant messages
    for (const raw of visibleMessages) {
      const msg = raw as SdkMessage
      if (msg.type !== 'assistant') continue
      const content = (msg.message?.content ?? msg.content ?? []) as AssistantContentBlock[]
      for (const block of content) {
        if (block.type === 'tool_use' && block.name === 'Skill' && block.id) {
          const input = (block.input ?? {}) as Record<string, string>
          const skillName = input.skill ?? input.skill_name ?? 'skill'
          skillToolUseIds.set(block.id, skillName)
        }
      }
    }

    if (skillToolUseIds.size === 0) return indices

    // Pass 2: Find tool_results for Skill tools, then mark the next text-only user message
    for (let i = 0; i < visibleMessages.length; i++) {
      const msg = visibleMessages[i] as SdkMessage
      if (msg.type !== 'user') continue
      const rawContent =
        msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content
      if (!Array.isArray(rawContent)) continue

      // Check if this user message has a tool_result for a Skill tool
      const blocks = rawContent as Array<{ type: string; tool_use_id?: string }>
      let skillName: string | null = null
      for (const block of blocks) {
        if (
          block.type === 'tool_result' &&
          block.tool_use_id &&
          skillToolUseIds.has(block.tool_use_id)
        ) {
          skillName = skillToolUseIds.get(block.tool_use_id) ?? ''
          break
        }
      }

      if (!skillName) continue

      // Look ahead for the immediately next user message that is text-only (not tool_result)
      for (let j = i + 1; j < visibleMessages.length; j++) {
        const next = visibleMessages[j] as SdkMessage
        if (next.type === 'assistant' || next.type === 'system') break // stop if assistant/system intervenes
        if (next.type !== 'user') continue
        if (isToolResultMessage(next)) continue
        // This is the injected skill content
        indices.set(j, skillName)
        break
      }
    }

    return indices
  }, [visibleMessages])

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

  // Save/restore scroll position on session switch
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    if (prevSessionIdRef.current !== sessionId) {
      // Save the outgoing session's scroll position
      savedScrollPositions.current.set(prevSessionIdRef.current, container.scrollTop)
      prevSessionIdRef.current = sessionId
      // Cancel any in-flight rAF from the previous session
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      // Restore the incoming session's scroll position (after content renders)
      const saved = savedScrollPositions.current.get(sessionId)
      requestAnimationFrame(() => {
        if (saved !== undefined) {
          container.scrollTop = saved
        } else {
          // New session with no saved position — scroll to bottom
          container.scrollTop = container.scrollHeight
        }
        // Update isNearBottom based on restored position
        const threshold = 120
        isNearBottomRef.current =
          container.scrollHeight - container.scrollTop - container.clientHeight < threshold
      })
    }
  }, [sessionId])

  // rAF scroll pinning during streaming — sets scrollTop directly each frame.
  // Unlike the old implementation, this loop keeps running every frame for the
  // entire streaming duration (instead of permanently exiting when the user
  // briefly scrolls away). This lets auto-scroll resume when the user scrolls
  // back near the bottom mid-stream.
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !streaming) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      return
    }

    function pin() {
      if (!container) {
        rafIdRef.current = null
        return
      }
      if (isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight
      }
      // Always schedule next frame — don't exit the loop just because the
      // user scrolled away. They may scroll back.
      rafIdRef.current = requestAnimationFrame(pin)
    }

    rafIdRef.current = requestAnimationFrame(pin)

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [streaming])

  // Scroll to bottom on discrete events: new messages arriving, new
  // permission/question prompts, or streaming ending. This covers the gap
  // between the user sending a message and streaming starting — without this,
  // the user's own message can render below the viewport with no scroll.
  const contentCountRef = useRef({
    messages: visibleMessages.length,
    permissions: sessionPermissions.length,
    questions: sessionQuestions.length,
  })

  useEffect(() => {
    const prev = contentCountRef.current
    const grew =
      visibleMessages.length > prev.messages ||
      sessionPermissions.length > prev.permissions ||
      sessionQuestions.length > prev.questions
    contentCountRef.current = {
      messages: visibleMessages.length,
      permissions: sessionPermissions.length,
      questions: sessionQuestions.length,
    }

    if (!isNearBottomRef.current) return

    if (grew || !streaming) {
      // Use rAF to let the DOM update first, then scroll
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }, [visibleMessages.length, sessionPermissions.length, sessionQuestions.length, streaming])

  // Listen for flow-scroll-to-message events from the FlowPanel
  useEffect(() => {
    function handleFlowScroll(e: Event) {
      const detail = (e as CustomEvent).detail as { messageIndex: number }
      const container = scrollContainerRef.current
      if (!container) return
      const messageElements = container.querySelectorAll('[data-message-index]')
      for (const el of messageElements) {
        if (Number(el.getAttribute('data-message-index')) === detail.messageIndex) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('flow-highlight')
          setTimeout(() => el.classList.remove('flow-highlight'), 1500)
          break
        }
      }
    }
    window.addEventListener('flow-scroll-to-message', handleFlowScroll)
    return () => window.removeEventListener('flow-scroll-to-message', handleFlowScroll)
  }, [])

  async function handlePermissionRespond(requestId: string, behavior: 'allow' | 'deny') {
    await window.api.respondToPermission(requestId, behavior)
    useSessionStore.getState().removePermission(requestId)
  }

  async function handleQuestionRespond(requestId: string, answers: Record<string, string>) {
    await window.api.respondToQuestion(requestId, answers)
    useSessionStore.getState().removeQuestion(requestId)
  }

  function handleChoiceSelect(text: string) {
    // Optimistically add user message to store (matches SessionView.handleSend pattern)
    useSessionStore.getState().appendMessage(sessionId, {
      type: 'user',
      content: text,
    })
    window.api.sendMessage(sessionId, text, [])
  }

  function handleChoicePreFill(text: string) {
    useUiStore.getState().setDraftText(text)
  }

  function renderAssistantContent(content: AssistantContentBlock[]) {
    const hasAgentBlocks = content.some((b) => b.type === 'tool_use' && b.name === 'Agent')

    const hasPlanBlocks = content.some(
      (b) => b.type === 'tool_use' && b.id && finalPlanToolUseIds.has(b.id),
    )

    if (!hasAgentBlocks && !hasPlanBlocks) {
      return (
        <AssistantMessage content={content} sessionId={sessionId} toolResultMap={toolResultMap} />
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
            // Only render PlanCard for the final write of each plan file.
            // Intermediate writes (from agent review iterations) are rendered
            // as normal tool blocks so the chat isn't cluttered with duplicates.
            const matchedPlan =
              block.id && finalPlanToolUseIds.has(block.id)
                ? detectedPlans.find((p) => p.toolUseId === block.id)
                : undefined
            if (matchedPlan) {
              return (
                <PlanCard
                  key={i}
                  plan={matchedPlan}
                  sessionId={sessionId}
                  sectionTitles={planSectionTitles.get(matchedPlan.toolUseId) ?? []}
                />
              )
            }
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
    let current: { userIdx: number | null; messages: { msg: SdkMessage; idx: number }[] } = {
      userIdx: null,
      messages: [],
    }

    for (let idx = 0; idx < visibleMessages.length; idx++) {
      const msg = visibleMessages[idx] as SdkMessage
      const isVisibleUser =
        msg.type === 'user' &&
        !isToolResultMessage(msg) &&
        !skillContentIndices.has(idx) &&
        !extractSkillName(msg)

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
  }, [visibleMessages, skillContentIndices.has])

  // Detect commit turns: user message is a commit request + assistant has git tool calls.
  // With includePartialMessages, each tool_use arrives in its own assistant message,
  // so we aggregate tool blocks across ALL assistant messages in the turn before checking.
  // Detect choice patterns in the last assistant message for inline buttons.
  // Only active when not streaming and no pending questions/permissions.
  const detectedChoices = useMemo(() => {
    if (streaming) return null
    if (sessionQuestions.length > 0 || sessionPermissions.length > 0) return null

    // Find the last assistant message with text content
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const msg = visibleMessages[i] as SdkMessage

      // If we hit a user message first, no actionable choices
      if (msg.type === 'user' && !isToolResultMessage(msg)) return null

      if (msg.type === 'assistant') {
        const messageObj = msg.message as { content?: AssistantContentBlock[] } | undefined
        const content = (messageObj?.content ?? msg.content ?? []) as AssistantContentBlock[]
        const textBlocks = content.filter((b) => b.type === 'text' && b.text)
        if (textBlocks.length === 0) continue

        const fullText = textBlocks.map((b) => (b as { text?: string }).text ?? '').join('\n')
        return detectChoices(fullText)
      }
    }

    return null
  }, [visibleMessages, streaming, sessionQuestions.length, sessionPermissions.length])

  const commitTurnIndices = useMemo(() => {
    const indices = new Set<number>()
    for (const turn of turns) {
      const userMsg = turn.messages.find(
        ({ msg }) => msg.type === 'user' && !isToolResultMessage(msg),
      )
      if (!userMsg) continue
      const rawContent =
        userMsg.msg.content ?? (userMsg.msg.message as Record<string, unknown> | undefined)?.content
      const userText =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? (rawContent as Array<{ type: string; text?: string }>)
                .filter((b) => b.type === 'text')
                .map((b) => b.text ?? '')
                .join(' ')
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
      // Positional detection (robust): check if this message was injected after a Skill tool call
      const positionalSkillName = skillContentIndices.get(idx)
      // Fallback: pattern-based detection for edge cases
      const skillName = positionalSkillName ?? extractSkillName(msg)
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
              <span className="text-stone-500 text-xs">
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
      )
        return null
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
          <ResultMessage isError={true} errorMessage={msg.error as string | undefined} />
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
            <div className="flex items-center gap-1.5 text-stone-500 text-xs">
              <Minimize2 size={12} />
              <span>
                Conversation {compactMetadata?.trigger === 'auto' ? 'auto-' : ''}compacted
              </span>
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
            const allToolBlocks: Array<{
              name: string
              input: Record<string, unknown>
              id?: string
            }> = []

            for (const { msg } of turn.messages) {
              if (msg.type !== 'assistant') continue
              const messageObj = msg.message as { content?: AssistantContentBlock[] } | undefined
              const blocks = (messageObj?.content ?? msg.content ?? []) as AssistantContentBlock[]
              for (const b of blocks) {
                if (b.type === 'tool_use' && b.name) {
                  allToolBlocks.push({ name: b.name, input: b.input ?? {}, id: b.id })
                }
              }
            }

            // Render: user message → CommitCard → result (skip assistant messages and their text)
            return (
              <div key={turn.userIdx ?? `pre-${turnIdx}`}>
                {turn.messages.map(({ msg, idx }) => {
                  // Skip assistant messages — handled by CommitCard
                  if (msg.type === 'assistant') return null
                  // Render user message first, then CommitCard, then result
                  if (msg.type === 'result' || msg.type === 'error') {
                    return (
                      <div key={idx}>
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
                        </motion.div>
                        {renderMessage(msg, idx)}
                      </div>
                    )
                  }
                  return renderMessage(msg, idx)
                })}
                {/* If no result yet (still streaming), show CommitCard at the end */}
                {!turn.messages.some(
                  ({ msg }) => msg.type === 'result' || msg.type === 'error',
                ) && (
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
                  </motion.div>
                )}
              </div>
            )
          }

          // Normal turn rendering
          return (
            <div key={turn.userIdx ?? `pre-${turnIdx}`}>
              {turn.messages.map(({ msg, idx }) => {
                const rendered = renderMessage(msg, idx)
                if (!rendered) return null
                return (
                  <div key={`flow-${idx}`} data-message-index={originalIndexMap.get(idx) ?? idx}>
                    {rendered}
                  </div>
                )
              })}
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
            <TextBlock text={streaming} isStreaming />
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
            <PermissionPrompt permission={perm} onRespond={handlePermissionRespond} />
          </motion.div>
        ))}

        {sessionQuestions.map((q) => (
          <motion.div
            key={q.requestId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <QuestionPrompt question={q} onRespond={handleQuestionRespond} />
          </motion.div>
        ))}

        {detectedChoices && (
          <motion.div
            key="choice-buttons"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <ChoiceButtons
              choices={detectedChoices.choices}
              onSelect={handleChoiceSelect}
              onPreFill={handleChoicePreFill}
            />
          </motion.div>
        )}

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
