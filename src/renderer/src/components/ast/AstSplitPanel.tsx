import { type ReactNode, useCallback, useRef, useState } from 'react'

type AstSplitPanelProps = {
  left: ReactNode
  right: ReactNode
}

const MIN_RATIO = 0.2
const MAX_RATIO = 0.8
const DEFAULT_RATIO = 0.6

export function AstSplitPanel({ left, right }: AstSplitPanelProps) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true

    const handleMouseMove = (me: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const next = (me.clientX - rect.left) / rect.width
      setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)))
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const leftPercent = `${ratio * 100}%`
  const rightPercent = `${(1 - ratio) * 100}%`

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="overflow-hidden" style={{ width: leftPercent }}>
        {left}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="w-px shrink-0 cursor-col-resize bg-base-border transition-colors hover:bg-accent"
      />

      <div className="overflow-hidden" style={{ width: rightPercent }}>
        {right}
      </div>
    </div>
  )
}
