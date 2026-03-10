/**
 * Scans an array of SDK messages for Edit/Write tool_use blocks
 * and returns a deduplicated list of file paths that were changed.
 *
 * Used both when streaming new messages (IPC bridge) and when
 * loading historical messages on session resume.
 */
export function extractChangedFiles(messages: unknown[]): string[] {
  const seen = new Set<string>()

  for (const raw of messages) {
    const msg = raw as {
      type?: string
      message?: { content?: unknown[] }
      content?: unknown[]
    }

    if (msg.type !== 'assistant') continue

    const content = (msg.message?.content ?? msg.content) as
      | Array<{ type: string; name?: string; input?: Record<string, unknown> }>
      | undefined

    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block.type !== 'tool_use' || !block.input) continue

      const blockName = (block.name ?? '').toLowerCase()
      if (
        blockName.includes('edit') ||
        (blockName.includes('write') && blockName !== 'todowrite')
      ) {
        const filePath = block.input?.file_path ?? block.input?.path
        if (typeof filePath === 'string' && filePath) {
          seen.add(filePath)
        }
      }
    }
  }

  return Array.from(seen)
}
