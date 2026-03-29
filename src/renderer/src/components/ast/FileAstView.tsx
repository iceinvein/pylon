import { ArrowLeft } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { AstNode } from '../../../../shared/types'
import { computeTreeLayout } from '../../lib/ast-layout'
import { useAstStore } from '../../store/ast-store'
import { AstContextMenu } from './AstContextMenu'
import { NODE_COLORS, NODE_LABELS } from './ast-constants'
import { GraphCanvas } from './GraphCanvas'

type ContextMenuState = {
  x: number
  y: number
  nodeId: string
  nodeName: string
  filePath: string
} | null

type FileAstViewProps = {
  fileAst: AstNode[]
  fileName: string
}

export function FileAstView({ fileAst, fileName }: FileAstViewProps) {
  const selectedNode = useAstStore((s) => s.selectedNode)
  const selectedFile = useAstStore((s) => s.selectedFile)
  const selectFile = useAstStore((s) => s.selectFile)
  const selectNode = useAstStore((s) => s.selectNode)
  const hoveredNode = useAstStore((s) => s.hoveredNode)
  const setHoveredNode = useAstStore((s) => s.setHoveredNode)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const layout = useMemo(() => computeTreeLayout(fileAst), [fileAst])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string, nodeName: string, filePath: string) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId, nodeName, filePath })
    },
    [],
  )

  const handleExplain = useCallback((nodeId: string, nodeName: string, filePath: string) => {
    useAstStore.getState().setExplain(null, true)
    window.api.explainAstNode(nodeId, filePath, nodeName)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => selectFile(null)}
        className="flex items-center gap-1.5 self-start px-3 py-2 text-accent-text text-xs transition-colors hover:text-base-text"
      >
        <ArrowLeft size={12} />
        Back to repo map
      </button>

      <div className="mb-2 px-3">
        <span className="font-mono text-base-text-muted text-xs">{fileName}</span>
      </div>

      <div className="min-h-0 flex-1">
        <GraphCanvas>
          {/* Parent -> child edges */}
          {layout.edges.map((edge) => {
            const source = layout.nodes.find((n) => n.id === edge.source)
            const target = layout.nodes.find((n) => n.id === edge.target)
            if (!source || !target) return null
            return (
              <line
                key={`${edge.source}->${edge.target}`}
                x1={source.x + source.width / 2}
                y1={source.y + source.height}
                x2={target.x + target.width / 2}
                y2={target.y}
                stroke="#484f58"
                strokeWidth={1}
                opacity={0.5}
              />
            )
          })}

          {/* AST node rects */}
          {layout.nodes.map((node) => {
            const isSelected = selectedNode === node.id
            const isHovered = hoveredNode === node.id
            const color = NODE_COLORS[node.type as keyof typeof NODE_COLORS] ?? '#484f58'
            const label = NODE_LABELS[node.type as keyof typeof NODE_LABELS] ?? '...'

            return (
              <g
                key={node.id}
                onClick={() => selectNode(node.id)}
                onContextMenu={(e) => handleContextMenu(e, node.id, node.name, selectedFile ?? '')}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={4}
                  fill={isHovered ? '#30363d' : '#21262d'}
                  stroke={isSelected ? '#58a6ff' : color}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <text
                  x={node.x + 6}
                  y={node.y + node.height / 2 + 4}
                  fill={color}
                  fontSize={9}
                  fontWeight={600}
                  opacity={0.7}
                >
                  {label}
                </text>
                <text
                  x={node.x + 6 + label.length * 6 + 4}
                  y={node.y + node.height / 2 + 4}
                  fill="#e6edf3"
                  fontSize={10}
                  fontFamily="var(--font-mono, monospace)"
                >
                  {node.name.length > 10 ? `${node.name.slice(0, 9)}..` : node.name}
                </text>
              </g>
            )
          })}
        </GraphCanvas>
      </div>

      {contextMenu && (
        <AstContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeName={contextMenu.nodeName}
          filePath={contextMenu.filePath}
          onClose={() => setContextMenu(null)}
          onExplain={handleExplain}
        />
      )}
    </div>
  )
}
