import { useEffect, useRef, useState } from 'react'

const THINKING_PHRASES = [
  'Thinking',
  'Gathering context',
  'Connecting the dots',
  'Mulling it over',
  'Piecing it together',
  'Tracing the code',
  'Forming a plan',
]

type ThinkingIndicatorProps = {
  isCompacting?: boolean
}

type Phase = 'typing' | 'dots' | 'pause' | 'done'

export function ThinkingIndicator({ isCompacting }: ThinkingIndicatorProps) {
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_PHRASES.length),
  )
  const [charIdx, setCharIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const [dotCount, setDotCount] = useState(0)
  const [dotCycle, setDotCycle] = useState(0)
  // Random 1–3 dot cycles per phrase, chosen when typing starts
  const maxCycles = useRef(1 + Math.floor(Math.random() * 3))

  const basePhrase = isCompacting ? 'Compacting conversation' : THINKING_PHRASES[phraseIdx]
  const displayText = basePhrase.slice(0, charIdx) + '.'.repeat(dotCount)

  useEffect(() => {
    switch (phase) {
      case 'typing': {
        if (charIdx < basePhrase.length) {
          const id = setTimeout(() => setCharIdx((c) => c + 1), 28)
          return () => clearTimeout(id)
        }
        const id = setTimeout(() => {
          setDotCount(1)
          setDotCycle(0)
          maxCycles.current = 1 + Math.floor(Math.random() * 3)
          setPhase('dots')
        }, 300)
        return () => clearTimeout(id)
      }

      case 'dots': {
        if (dotCount < 3) {
          const id = setTimeout(() => setDotCount((d) => d + 1), 400)
          return () => clearTimeout(id)
        }
        const id = setTimeout(() => setPhase('pause'), 400)
        return () => clearTimeout(id)
      }

      case 'pause': {
        if (dotCycle < maxCycles.current - 1) {
          const next = dotCycle + 1
          const id = setTimeout(() => {
            setDotCount(0)
            setDotCycle(next)
            setTimeout(() => {
              setDotCount(1)
              setPhase('dots')
            }, 250)
          }, 100)
          return () => clearTimeout(id)
        }
        setPhase('done')
        return
      }

      case 'done': {
        const id = setTimeout(() => {
          setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length)
          setCharIdx(0)
          setDotCount(0)
          setDotCycle(0)
          setPhase('typing')
        }, 400)
        return () => clearTimeout(id)
      }
    }
  }, [phase, charIdx, dotCount, basePhrase.length, dotCycle])

  return (
    <div className="mx-auto max-w-3xl px-4 py-2">
      <span className="text-[var(--color-base-text-muted)] text-sm">{displayText}</span>
      <span className="inline-block h-3.5 w-0.5 animate-pulse bg-[var(--color-accent)] align-text-bottom" />
    </div>
  )
}
