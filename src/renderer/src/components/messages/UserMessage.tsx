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
  content: string | ContentBlock[]
}

export function UserMessage({ content }: UserMessageProps) {
  const getText = (): string => {
    if (typeof content === 'string') return content
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
  }

  const getImages = (): ContentBlock[] => {
    if (typeof content === 'string') return []
    return content.filter((b) => b.type === 'image')
  }

  const text = getText()
  const images = getImages()

  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] space-y-2">
        {images.map((img, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-zinc-700">
            <img
              src={`data:${img.source?.media_type};base64,${img.source?.data}`}
              alt="attachment"
              className="max-h-64 max-w-full object-contain"
            />
          </div>
        ))}
        {text && (
          <div className="rounded-2xl rounded-tr-sm bg-zinc-700 px-4 py-2.5 text-sm text-zinc-100">
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        )}
      </div>
    </div>
  )
}
