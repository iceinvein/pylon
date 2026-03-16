import { Sparkles } from 'lucide-react'
import { ToolUseBlock } from '../tools/ToolUseBlock'
import { TextBlock } from './TextBlock'
import { ThinkingBlock } from './ThinkingBlock'

type ContentBlock = {
  type: string
  text?: string
  thinking?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

type AssistantMessageProps = {
  content: ContentBlock[]
  sessionId?: string
  toolResultMap?: Map<string, string>
  /** Show the avatar + "Claude" header. Only true for the first assistant message in a turn. */
  showHeader?: boolean
}

export function AssistantMessage({ content, toolResultMap, showHeader }: AssistantMessageProps) {
  return (
    <div className={`flex gap-3 px-6 py-2 ${showHeader ? '' : 'pl-[3.75rem]'}`}>
      {showHeader && (
        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-base-raised)]">
          <Sparkles size={13} className="text-[var(--color-base-text-muted)]" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {showHeader && (
          <span className="font-semibold text-[var(--color-base-text-secondary)] text-xs">
            Claude
          </span>
        )}
        {content.map((block, i) => {
          if (block.type === 'text' && block.text) {
            return <TextBlock key={i} text={block.text} />
          }
          if (block.type === 'thinking' && block.thinking) {
            return <ThinkingBlock key={i} thinking={block.thinking} />
          }
          if (block.type === 'tool_use') {
            return (
              <ToolUseBlock
                key={i}
                toolName={block.name ?? 'unknown'}
                input={block.input ?? {}}
                toolUseId={block.id}
                result={toolResultMap?.get(block.id ?? '')}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
