import { useEffect, useState } from 'react'

const THINKING_PHRASES = [
  'Thinking...',
  'Gathering context...',
  'Connecting the dots...',
  'Mulling it over...',
  'Piecing it together...',
  'Tracing the code...',
  'Forming a plan...',
]

type ThinkingIndicatorProps = {
  isCompacting?: boolean
}

export function ThinkingIndicator({ isCompacting }: ThinkingIndicatorProps) {
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_PHRASES.length),
  )
  const [charIdx, setCharIdx] = useState(0)
  const phrase = isCompacting ? 'Compacting conversation...' : THINKING_PHRASES[phraseIdx]

  useEffect(() => {
    if (charIdx < phrase.length) {
      const id = setTimeout(() => setCharIdx((c) => c + 1), 40)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length)
      setCharIdx(0)
    }, 3000)
    return () => clearTimeout(id)
  }, [charIdx, phrase.length])

  return (
    <div className="mx-auto max-w-3xl px-4 py-2">
      <span className="font-display text-[var(--color-base-text-secondary)] text-base italic">
        {phrase.slice(0, charIdx)}
      </span>
      <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--color-accent)] align-text-bottom" />
    </div>
  )
}
