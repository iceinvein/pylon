// src/renderer/src/lib/session-preview.ts
import type { SdkMessage } from '../../../shared/types'

/**
 * Derive a short preview string from the last assistant message in a session.
 * Returns the first ~80 chars of the last text block, or the last tool name used.
 */
export function getSessionPreview(messages: SdkMessage[]): string {
  // Walk backwards to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.type !== 'assistant') continue

    const content = msg.content
    if (!Array.isArray(content)) {
      if (typeof content === 'string') {
        return truncate(content, 80)
      }
      continue
    }

    // Look for first text block
    for (const block of content) {
      if (block && typeof block === 'object' && 'type' in block) {
        if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
          return truncate(block.text, 80)
        }
        if (block.type === 'tool_use' && 'name' in block && typeof block.name === 'string') {
          return `Used ${block.name}`
        }
      }
    }
  }

  return ''
}

function truncate(text: string, max: number): string {
  // Collapse whitespace and trim
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max).trimEnd()}…`
}
