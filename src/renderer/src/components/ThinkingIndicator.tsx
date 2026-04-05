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

type Phase = 'typing' | 'dots' | 'gap' | 'done'

export function ThinkingIndicator({ isCompacting }: ThinkingIndicatorProps) {
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_PHRASES.length),
  )
  const [charIdx, setCharIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const [dotCount, setDotCount] = useState(0)
  const [dotCycle, setDotCycle] = useState(0)
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
        // Full ellipsis shown — either gap for another cycle or done
        if (dotCycle < maxCycles.current - 1) {
          const id = setTimeout(() => {
            setDotCount(0)
            setDotCycle((c) => c + 1)
            setPhase('gap')
          }, 400)
          return () => clearTimeout(id)
        }
        const id = setTimeout(() => setPhase('done'), 400)
        return () => clearTimeout(id)
      }

      case 'gap': {
        // Brief pause with no dots before restarting the cycle
        const id = setTimeout(() => {
          setDotCount(1)
          setPhase('dots')
        }, 250)
        return () => clearTimeout(id)
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
    <span className="relative inline-flex items-baseline gap-0.5 overflow-hidden rounded-sm">
      {/* Subtle horizontal shimmer behind the thinking text */}
      <span
        className="pointer-events-none absolute inset-0 animate-shimmer rounded-sm"
        style={{
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-base-raised) 30%, transparent), transparent)',
          backgroundSize: '200% 100%',
        }}
        aria-hidden="true"
      />
      <span className="relative text-base-text-muted text-xs">{displayText}</span>
      {/* Glowing thin cursor bar */}
      <span
        className="relative inline-block h-3 w-0.5 animate-pulse bg-accent align-text-bottom"
        style={{ boxShadow: '0 0 4px color-mix(in srgb, var(--color-accent) 40%, transparent)' }}
      />
    </span>
  )
}
