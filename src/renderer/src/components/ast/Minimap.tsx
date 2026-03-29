import { useCallback, useMemo, useRef } from 'react'
import type { LayoutNode } from '../../lib/ast-layout'
import { useAstStore } from '../../store/ast-store'

type MinimapProps = {
  nodes: LayoutNode[]
  canvasWidth: number
  canvasHeight: number
}

const MINIMAP_W = 200
const MINIMAP_H = 140
const MINIMAP_PAD = 10

export function Minimap({ nodes, canvasWidth, canvasHeight }: MinimapProps) {
  const zoom = useAstStore((s) => s.zoom)
  const panX = useAstStore((s) => s.panX)
  const panY = useAstStore((s) => s.panY)
  const setPan = useAstStore((s) => s.setPan)

  const svgRef = useRef<SVGSVGElement>(null)

  // Compute bounding box of all nodes
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const minX = Math.min(...nodes.map((n) => n.x))
    const maxX = Math.max(...nodes.map((n) => n.x + n.width))
    const minY = Math.min(...nodes.map((n) => n.y))
    const maxY = Math.max(...nodes.map((n) => n.y + n.height))
    return { minX: minX - 50, minY: minY - 50, maxX: maxX + 50, maxY: maxY + 50 }
  }, [nodes])

  const graphW = bounds.maxX - bounds.minX
  const graphH = bounds.maxY - bounds.minY

  // Scale factor to fit graph into minimap
  const scaleX = (MINIMAP_W - MINIMAP_PAD * 2) / graphW
  const scaleY = (MINIMAP_H - MINIMAP_PAD * 2) / graphH
  const scale = Math.min(scaleX, scaleY)

  // Viewport rectangle in graph coords
  // The main canvas transform is: translate(panX + 400, panY + 300) scale(zoom)
  // So visible graph area top-left in graph coords = -(panX + 400) / zoom, -(panY + 300) / zoom
  const vpX = -(panX + 400) / zoom
  const vpY = -(panY + 300) / zoom
  const vpW = canvasWidth / zoom
  const vpH = canvasHeight / zoom

  // Transform graph coords to minimap coords
  const toMiniX = useCallback(
    (gx: number) => MINIMAP_PAD + (gx - bounds.minX) * scale,
    [bounds.minX, scale],
  )
  const toMiniY = useCallback(
    (gy: number) => MINIMAP_PAD + (gy - bounds.minY) * scale,
    [bounds.minY, scale],
  )

  const navigateTo = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = clientX - rect.left
      const my = clientY - rect.top
      // Convert minimap coords to graph coords
      const gx = (mx - MINIMAP_PAD) / scale + bounds.minX
      const gy = (my - MINIMAP_PAD) / scale + bounds.minY
      // Center viewport on this point
      setPan(-gx * zoom + canvasWidth / 2 - 400, -gy * zoom + canvasHeight / 2 - 300)
    },
    [scale, bounds.minX, bounds.minY, zoom, canvasWidth, canvasHeight, setPan],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      navigateTo(e.clientX, e.clientY)
    },
    [navigateTo],
  )

  if (nodes.length === 0) return null

  return (
    <button
      type="button"
      className="absolute right-3 bottom-3 rounded-md border border-base-border-subtle bg-base-bg/80 p-0 backdrop-blur-sm"
      onClick={handleClick}
      aria-label="Minimap - click to navigate"
    >
      <svg ref={svgRef} width={MINIMAP_W} height={MINIMAP_H}>
        <title>Minimap navigation</title>
        {/* Node dots */}
        {nodes.map((node) => (
          <circle
            key={node.id}
            cx={toMiniX(node.x + node.width / 2)}
            cy={toMiniY(node.y + node.height / 2)}
            r={node.isCluster ? 3 : 2}
            fill={node.layerColor ?? '#484f58'}
            opacity={0.8}
          />
        ))}
        {/* Viewport rect */}
        <rect
          x={toMiniX(vpX)}
          y={toMiniY(vpY)}
          width={vpW * scale}
          height={vpH * scale}
          fill="#58a6ff"
          fillOpacity={0.1}
          stroke="#58a6ff"
          strokeWidth={1}
          strokeOpacity={0.5}
          rx={2}
        />
      </svg>
    </button>
  )
}
