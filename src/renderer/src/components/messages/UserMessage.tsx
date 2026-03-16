import { User } from 'lucide-react'

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
    <div className="flex gap-3 px-6 py-3">
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15">
        <User size={13} className="text-[var(--color-accent-text)]" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-[var(--color-base-text)] text-sm">You</span>
        {images.length > 0 && (
          <div className="mt-2 space-y-2">
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
        {text && (
          <p className="mt-1 whitespace-pre-wrap text-[var(--color-base-text)] text-sm leading-relaxed">
            {text}
          </p>
        )}
      </div>
    </div>
  )
}
