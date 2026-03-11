import type { DetectedPlan } from '../../../shared/types'
import { isPlanPath, toRelativePath } from './parse-plan'

/**
 * Scans an array of SDK messages for Write/Edit tool_use blocks targeting
 * plan/design files and returns a list of DetectedPlan entries.
 *
 * Used when loading historical messages on session resume — mirrors the
 * live detection logic in use-ipc-bridge.ts so that plan cards survive
 * app reloads.
 */
export function extractDetectedPlans(messages: unknown[]): DetectedPlan[] {
  const plans: DetectedPlan[] = []
  const seenToolUseIds = new Set<string>()

  for (const raw of messages) {
    const msg = raw as {
      type?: string
      message?: { content?: unknown[] }
      content?: unknown[]
    }

    if (msg.type !== 'assistant') continue

    const content = (msg.message?.content ?? msg.content) as
      | Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }>
      | undefined

    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block.type !== 'tool_use' || !block.input || !block.id) continue

      const blockName = (block.name ?? '').toLowerCase()
      if (
        blockName.includes('edit') ||
        (blockName.includes('write') && blockName !== 'todowrite')
      ) {
        const filePath = block.input?.file_path ?? block.input?.path
        if (typeof filePath === 'string' && filePath && isPlanPath(filePath)) {
          if (!seenToolUseIds.has(block.id)) {
            seenToolUseIds.add(block.id)
            plans.push({
              filePath,
              relativePath: toRelativePath(filePath),
              toolUseId: block.id,
              status: 'pending',
              comments: [],
            })
          }
        }
      }
    }
  }

  return plans
}
