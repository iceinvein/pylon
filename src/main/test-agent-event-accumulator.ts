import type { ExplorationAgentMessage } from '../shared/types'
import type { NormalizedEvent } from './providers'

export class TestAgentEventAccumulator {
  private streamedText = ''
  private pendingTextDelta = ''
  private emittedToolUseIds = new Set<string>()
  private emittedToolResultIds = new Set<string>()
  private inputTokens = 0
  private outputTokens = 0
  private hasUsageUpdate = false

  recordUsage(event: Extract<NormalizedEvent, { type: 'usage_update' | 'turn_complete' }>): void {
    if (event.type === 'usage_update') {
      this.hasUsageUpdate = true
      this.inputTokens += event.inputTokens
      this.outputTokens += event.outputTokens
      return
    }

    if (this.hasUsageUpdate) {
      this.inputTokens = Math.max(this.inputTokens, event.inputTokens)
      this.outputTokens = Math.max(this.outputTokens, event.outputTokens)
      return
    }

    this.inputTokens += event.inputTokens
    this.outputTokens += event.outputTokens
  }

  usage(): { inputTokens: number; outputTokens: number } {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens }
  }

  streamingText(): string {
    return this.streamedText
  }

  append(event: NormalizedEvent): ExplorationAgentMessage[] {
    const messages: ExplorationAgentMessage[] = []
    switch (event.type) {
      case 'text_delta':
        this.streamedText += event.text
        this.pendingTextDelta += event.text
        messages.push({ type: 'text', text: event.text })
        break
      case 'thinking_delta':
        messages.push({ type: 'thinking', text: event.text })
        break
      case 'tool_use':
        if (!this.emittedToolUseIds.has(event.toolId)) {
          this.emittedToolUseIds.add(event.toolId)
          messages.push({
            type: 'tool_use',
            id: event.toolId,
            name: event.toolName,
            input: toRecord(event.input),
          })
        }
        break
      case 'tool_result':
        if (!this.emittedToolResultIds.has(event.toolId)) {
          this.emittedToolResultIds.add(event.toolId)
          messages.push({
            type: 'tool_result',
            toolUseId: event.toolId,
            content: event.output.slice(0, 2000),
          })
        }
        break
      case 'message_complete':
        messages.push(...this.appendCompleteMessage(event))
        break
    }
    return messages
  }

  private appendCompleteMessage(
    event: Extract<NormalizedEvent, { type: 'message_complete' }>,
  ): ExplorationAgentMessage[] {
    const messages: ExplorationAgentMessage[] = []
    for (const block of event.content) {
      if (block.type === 'text' && event.role === 'assistant') {
        if (this.pendingTextDelta.startsWith(block.text)) {
          this.pendingTextDelta = this.pendingTextDelta.slice(block.text.length)
          continue
        }

        this.streamedText += `${block.text}\n`
        messages.push({ type: 'text', text: block.text })
      }
      if (block.type === 'thinking' && event.role === 'assistant') {
        messages.push({ type: 'thinking', text: block.text })
      }
      if (
        block.type === 'tool_use' &&
        event.role === 'assistant' &&
        !this.emittedToolUseIds.has(block.toolId)
      ) {
        this.emittedToolUseIds.add(block.toolId)
        messages.push({
          type: 'tool_use',
          id: block.toolId,
          name: block.toolName,
          input: toRecord(block.input),
        })
      }
      if (
        block.type === 'tool_result' &&
        event.role === 'user' &&
        !this.emittedToolResultIds.has(block.toolId)
      ) {
        this.emittedToolResultIds.add(block.toolId)
        messages.push({
          type: 'tool_result',
          toolUseId: block.toolId,
          content: block.output.slice(0, 2000),
        })
      }
    }

    if (event.role === 'assistant') {
      this.pendingTextDelta = ''
    }
    return messages
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
