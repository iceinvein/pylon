import { AnimatePresence, motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useEffect, useState } from 'react'

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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!lightboxSrc) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxSrc(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lightboxSrc])

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
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            className="fixed inset-0 z-100 flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxSrc(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.img
              src={lightboxSrc}
              alt="Preview"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-text/10">
        <User size={13} className="text-base-text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-base-text text-sm">You</span>
        {images.length > 0 && (
          <div className="mt-2 space-y-2">
            {images.map((img, i) => {
              const src = `data:${img.source?.media_type};base64,${img.source?.data}`
              return (
                <div key={i} className="overflow-hidden rounded-lg border border-base-border">
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(src)}
                    className="cursor-zoom-in"
                  >
                    <img
                      src={src}
                      alt="attachment"
                      className="max-h-64 max-w-full object-contain"
                    />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {text && (
          <p className="mt-1 whitespace-pre-wrap text-base-text text-sm leading-relaxed">{text}</p>
        )}
      </div>
    </div>
  )
}
