import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useAgentGrouping } from '../../hooks/use-agent-grouping'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { SystemMessage } from './SystemMessage'
import { ResultMessage } from './ResultMessage'
import { PermissionPrompt } from './PermissionPrompt'
import { TextBlock } from './TextBlock'
import { SubagentBlock } from '../tools/SubagentBlock'
import { ToolUseBlock } from '../tools/ToolUseBlock'
import { Zap } from 'lucide-react'

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

type ChatViewProps = {
  sessionId: string
}

const THINKING_PHRASES = [
  'Thinking...',
  'Reasoning through this...',
  'Considering the options...',
  'Analyzing the codebase...',
  'Gathering context...',
  'Connecting the dots...',
  'Mulling it over...',
  'Examining the details...',
  'Piecing things together...',
  'Working through it...',
]

function ThinkingIndicator() {
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * THINKING_PHRASES.length))
  const [charIdx, setCharIdx] = useState(0)
  const phrase = THINKING_PHRASES[phraseIdx]

  useEffect(() => {
    if (charIdx < phrase.length) {
      const id = setTimeout(() => setCharIdx((c) => c + 1), 40)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length)
      setCharIdx(0)
    }, 3000)
    return () => clearTimeout(id)
  }, [charIdx, phrase.length])

  return (
    <div className="px-6 py-3">
      <span className="text-sm text-stone-500">{phrase.slice(0, charIdx)}</span>
      <span className="inline-block h-3.5 w-0.5 animate-pulse bg-stone-500 align-text-bottom" />
    </div>
  )
}

export function ChatView({ sessionId }: ChatViewProps) {
  const { messages, pendingPermissions, streamingText, sessions } = useSessionStore()
  const sessionMessages = messages.get(sessionId) ?? []
  const streaming = streamingText.get(sessionId)
  const sessionPermissions = pendingPermissions.filter((p) => p.sessionId === sessionId)
  const session = sessions.get(sessionId)
  const isProcessing = (session?.status === 'running' || session?.status === 'starting') && !streaming
  const bottomRef = useRef<HTMLDivElement>(null)

  const { agentMap, mainThreadMessages } = useAgentGrouping(sessionMessages)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages.length, streaming, isProcessing])

  async function handlePermissionRespond(requestId: string, behavior: 'allow' | 'deny') {
    await window.api.respondToPermission(requestId, behavior)
    useSessionStore.getState().removePermission(requestId)
  }

  function renderAssistantContent(content: AssistantContentBlock[], idx: number) {
    const hasAgentBlocks = content.some((b) => b.type === 'tool_use' && b.name === 'Agent')

    if (!hasAgentBlocks) {
      return <AssistantMessage key={idx} content={content} sessionId={sessionId} />
    }

    // Render message normally but replace Agent tool_use blocks with SubagentBlock cards
    return (
      <div key={idx} className="space-y-1 px-6 py-2">
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
              />
            )
          }
          return null
        })}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl">
      {mainThreadMessages.map((rawMsg, idx) => {
        const msg = rawMsg as SdkMessage

        if (msg.type === 'user') {
          const skillName = extractSkillName(msg)
          if (skillName) {
            return (
              <div key={idx} className="flex items-center gap-2 px-6 py-1">
                <Zap size={12} className="flex-shrink-0 text-purple-400/70" />
                <span className="text-xs text-stone-500">
                  Loaded skill <span className="text-stone-400">{skillName}</span>
                </span>
              </div>
            )
          }
          return <UserMessage key={idx} message={msg as Record<string, unknown>} />
        }

        if (msg.type === 'assistant') {
          const messageObj = msg.message as { content?: AssistantContentBlock[] } | undefined
          const content = (messageObj?.content ?? msg.content ?? []) as AssistantContentBlock[]
          return renderAssistantContent(content, idx)
        }

        if (msg.type === 'system') {
          const sub = msg.subtype
          if (
            sub === 'init' ||
            sub === 'status' ||
            sub === 'hook_started' ||
            sub === 'hook_response' ||
            sub === 'task_started'
          ) return null
          const content = String(msg.content ?? msg.subtype ?? 'System message')
          return <SystemMessage key={idx} content={content} subtype={sub} />
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

      {isProcessing && <ThinkingIndicator />}

      {streaming && (
        <div className="px-6 py-2">
          <TextBlock text={streaming} />
          <span className="inline-block h-4 w-0.5 animate-pulse bg-stone-400 align-text-bottom" />
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
    </div>
  )
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
