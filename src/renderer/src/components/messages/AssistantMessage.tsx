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
  /** Show the avatar + assistant header. Only true for the first assistant message in a turn. */
  showHeader?: boolean
  assistantName?: string
}

export function AssistantMessage({
  content,
  toolResultMap,
  showHeader,
  assistantName = 'Claude',
}: AssistantMessageProps) {
  return (
    <div className={`flex gap-3 px-6 py-2 ${showHeader ? '' : 'pl-15'}`}>
      {showHeader && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-raised">
          <Sparkles size={13} className="text-base-text-muted" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {showHeader && (
          <span className="font-semibold text-base-text text-sm">{assistantName}</span>
        )}
        {content.map((block, i) => {
          const prevType = i > 0 ? content[i - 1].type : null
          const isAfterTool = prevType === 'tool_use'
          const isToolBlock = block.type === 'tool_use'

          if (block.type === 'text' && block.text) {
            return (
              <div key={i} className={isAfterTool ? 'mt-2' : i > 0 ? 'mt-1' : ''}>
                <TextBlock text={block.text} />
              </div>
            )
          }
          if (block.type === 'thinking' && block.thinking) {
            return (
              <div key={i} className={i > 0 ? 'mt-1' : ''}>
                <ThinkingBlock thinking={block.thinking} />
              </div>
            )
          }
          if (isToolBlock) {
            return (
              <div key={i} className={prevType === 'tool_use' ? 'mt-px' : i > 0 ? 'mt-1' : ''}>
                <ToolUseBlock
                  toolName={block.name ?? 'unknown'}
                  input={block.input ?? {}}
                  toolUseId={block.id}
                  result={toolResultMap?.get(block.id ?? '')}
                />
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
