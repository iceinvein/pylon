type ContentBlock = {
  type: string
  text?: string
  source?: {
    type: string
    media_type: string
    data: string
  }
}

type UserMessageProps = {
  message: Record<string, unknown>
}

export function UserMessage({ message }: UserMessageProps) {
  const rawContent =
    message.content ?? (message.message as Record<string, unknown> | undefined)?.content

  const getText = (): string => {
    if (!rawContent) return ''
    if (typeof rawContent === 'string') return rawContent
    if (!Array.isArray(rawContent)) return String(rawContent)
    return (rawContent as ContentBlock[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
  }

  const getImages = (): ContentBlock[] => {
    if (!rawContent || typeof rawContent === 'string' || !Array.isArray(rawContent)) return []
    return (rawContent as ContentBlock[]).filter((b) => b.type === 'image')
  }

  const text = getText()
  const images = getImages()

  return (
    <div className="border-l-[3px] border-l-amber-600 bg-[var(--color-base-raised)] px-6 py-3">
      {images.length > 0 && (
        <div className="mb-2 space-y-2">
          {images.map((img, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-[var(--color-base-border)]"
            >
              <img
                src={`data:${img.source?.media_type};base64,${img.source?.data}`}
                alt="attachment"
                className="max-h-64 max-w-full object-contain"
              />
            </div>
          ))}
        </div>
      )}
      {text && <p className="whitespace-pre-wrap text-[var(--color-base-text)] text-sm">{text}</p>}
    </div>
  )
}
