import { TextBlock } from './TextBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolUseBlock } from '../tools/ToolUseBlock'

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
}

export function AssistantMessage({ content, toolResultMap }: AssistantMessageProps) {
  return (
    <div className="space-y-1 px-6 py-2">
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
  )
}
