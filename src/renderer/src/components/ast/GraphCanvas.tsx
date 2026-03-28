import { type ReactNode, useCallback, useRef } from 'react'
import { useAstStore } from '../../store/ast-store'

type GraphCanvasProps = {
  children: ReactNode
}

export function GraphCanvas({ children }: GraphCanvasProps) {
  const zoom = useAstStore((s) => s.zoom)
  const panX = useAstStore((s) => s.panX)
  const panY = useAstStore((s) => s.panY)
  const setZoom = useAstStore((s) => s.setZoom)
  const setPan = useAstStore((s) => s.setPan)

  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const next = Math.min(3, Math.max(0.1, zoom * factor))
      setZoom(next)
    },
    [zoom, setZoom],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      panStart.current = { x: panX, y: panY }
    },
    [panX, panY],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPan(panStart.current.x + dx, panStart.current.y + dy)
    },
    [setPan],
  )

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      role="img"
      aria-label="Graph visualization canvas"
      className="cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <title>Graph visualization canvas</title>
      <g transform={`translate(${panX + 400}, ${panY + 300}) scale(${zoom})`}>{children}</g>
    </svg>
  )
}
