import { type ReactNode, useCallback, useEffect, useRef } from 'react'
import { useAstStore } from '../../store/ast-store'

type FitNode = { x: number; y: number; width: number; height: number }

type GraphCanvasProps = {
  children: ReactNode
  layoutNodes?: FitNode[]
  onCanvasClick?: () => void
}

const CLICK_DRAG_THRESHOLD = 4

export function GraphCanvas({ children, layoutNodes, onCanvasClick }: GraphCanvasProps) {
  const zoom = useAstStore((s) => s.zoom)
  const panX = useAstStore((s) => s.panX)
  const panY = useAstStore((s) => s.panY)
  const setZoom = useAstStore((s) => s.setZoom)
  const setPan = useAstStore((s) => s.setPan)

  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const hasFitted = useRef(false)

  const autoFit = useCallback(
    (nodes: FitNode[]) => {
      if (nodes.length === 0) return
      const minX = Math.min(...nodes.map((n) => n.x))
      const maxX = Math.max(...nodes.map((n) => n.x + n.width))
      const minY = Math.min(...nodes.map((n) => n.y))
      const maxY = Math.max(...nodes.map((n) => n.y + n.height))
      const graphW = maxX - minX + 100
      const graphH = maxY - minY + 100
      const svgRect = svgRef.current?.getBoundingClientRect()
      if (!svgRect) return
      const scaleX = svgRect.width / graphW
      const scaleY = svgRect.height / graphH
      const fitZoom = Math.min(scaleX, scaleY, 1)
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      setZoom(fitZoom)
      // Account for the hardcoded +400/+300 offset in the transform
      setPan(
        -centerX * fitZoom + svgRect.width / 2 - 400,
        -centerY * fitZoom + svgRect.height / 2 - 300,
      )
    },
    [setZoom, setPan],
  )

  // Auto-fit on initial layout load
  useEffect(() => {
    if (!layoutNodes || layoutNodes.length === 0 || hasFitted.current) return
    // Small delay to ensure SVG has rendered and has dimensions
    const raf = requestAnimationFrame(() => {
      autoFit(layoutNodes)
      hasFitted.current = true
    })
    return () => cancelAnimationFrame(raf)
  }, [layoutNodes, autoFit])

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
      hasDragged.current = false
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
      if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) {
        hasDragged.current = true
      }
      setPan(panStart.current.x + dx, panStart.current.y + dy)
    },
    [setPan],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return
      const wasDragging = hasDragged.current
      isDragging.current = false
      if (wasDragging) return
      const target = e.target as SVGElement
      if (target.tagName === 'svg' || (target.tagName === 'g' && !target.closest('[data-node]'))) {
        onCanvasClick?.()
      }
    },
    [onCanvasClick],
  )

  const handleMouseLeave = useCallback(() => {
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
      onMouseLeave={handleMouseLeave}
    >
      <g transform={`translate(${panX + 400}, ${panY + 300}) scale(${zoom})`}>{children}</g>
    </svg>
  )
}
