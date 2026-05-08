export function extractReviewOutputText(message: unknown): string {
  const msg = message as Record<string, unknown>

  if (msg.type === 'stream_event') {
    const event = msg.event as Record<string, unknown> | undefined
    const delta = event?.delta as Record<string, unknown> | undefined
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return delta.text
    }
    return ''
  }

  if (msg.type !== 'assistant') return ''

  const content = (msg.message as Record<string, unknown> | undefined)?.content ?? msg.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((block) => {
      const typedBlock = block as Record<string, unknown>
      return typedBlock.type === 'text' && typeof typedBlock.text === 'string'
        ? typedBlock.text
        : ''
    })
    .join('')
}

export function appendReviewOutputText(current: string, next: string): string {
  if (!next) return current
  if (!current) return next
  if (current.endsWith(next)) return current

  const maxOverlap = Math.min(current.length, next.length)
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (current.endsWith(next.slice(0, overlap))) {
      return current + next.slice(overlap)
    }
  }

  return current + next
}
