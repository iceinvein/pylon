// src/renderer/src/lib/activity-format.ts
import type { ExplorationAgentMessage } from '../../../shared/types'

export type ActivityEntry = {
  id: string
  toolName: string
  summary: string
  highlight: 'finding' | 'test' | null
}

function stripMcpPrefix(name: string): string {
  const parts = name.split('__')
  return parts.length >= 3 ? parts.slice(2).join('__') : name
}

function extractPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export function formatActivityEntry(msg: ExplorationAgentMessage): ActivityEntry | null {
  if (msg.type !== 'tool_use') return null

  const toolName = stripMcpPrefix(msg.name)
  const input = msg.input

  switch (toolName) {
    case 'browser_navigate':
      return {
        id: msg.id,
        toolName,
        summary: `Navigate → ${extractPath(String(input.url ?? ''))}`,
        highlight: null,
      }

    case 'browser_click':
      return {
        id: msg.id,
        toolName,
        summary: `Click → "${String(input.element ?? input.selector ?? 'element')}"`,
        highlight: null,
      }

    case 'browser_snapshot':
      return { id: msg.id, toolName, summary: 'Snapshot', highlight: null }

    case 'browser_type':
      return {
        id: msg.id,
        toolName,
        summary: `Type → "${String(input.text ?? '').slice(0, 30)}"`,
        highlight: null,
      }

    case 'browser_fill_form':
      return { id: msg.id, toolName, summary: 'Fill form', highlight: null }

    case 'browser_hover':
      return {
        id: msg.id,
        toolName,
        summary: `Hover → "${String(input.element ?? 'element')}"`,
        highlight: null,
      }

    case 'browser_press_key':
      return {
        id: msg.id,
        toolName,
        summary: `Key → ${String(input.key ?? '')}`,
        highlight: null,
      }

    case 'report_finding':
      return {
        id: msg.id,
        toolName,
        summary: `Finding: ${String(input.title ?? 'Untitled')}`,
        highlight: 'finding',
      }

    case 'save_playwright_test':
      return {
        id: msg.id,
        toolName,
        summary: `Test saved: ${String(input.filename ?? 'test.spec.ts')}`,
        highlight: 'test',
      }

    default:
      return { id: msg.id, toolName, summary: toolName, highlight: null }
  }
}
