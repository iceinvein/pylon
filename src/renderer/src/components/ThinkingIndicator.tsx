import { useEffect, useState } from 'react'

const THINKING_PHRASES = [
  'Thinking...',
  'Reasoning through this...',
  'Considering the options...',
  'Analyzing the codebase...',
  'Gathering context...',
  'Connecting the dots...',
  'Mulling it over...',
  'Examining the details...',
  'Piecing things together...',
  'Working through it...',
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
      <span className="text-sm text-stone-500">{phrase.slice(0, charIdx)}</span>
      <span className="inline-block h-3.5 w-0.5 animate-pulse bg-stone-500 align-text-bottom" />
    </div>
  )
}
