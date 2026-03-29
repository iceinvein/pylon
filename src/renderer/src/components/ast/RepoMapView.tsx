import { useCallback, useMemo, useState } from 'react'
import type { ArchAnalysis, RepoGraph } from '../../../../shared/types'
import { computeRepoLayout } from '../../lib/ast-layout'
import { useAstStore } from '../../store/ast-store'
import { AstContextMenu } from './AstContextMenu'
import { GraphCanvas } from './GraphCanvas'

type ContextMenuState = {
  x: number
  y: number
  nodeId: string
  nodeName: string
  filePath: string
} | null

type RepoMapViewProps = {
  repoGraph: RepoGraph
  archAnalysis: ArchAnalysis | null
}

export function RepoMapView({ repoGraph, archAnalysis }: RepoMapViewProps) {
  const selectedFile = useAstStore((s) => s.selectedFile)
  const activeOverlays = useAstStore((s) => s.activeOverlays)
  const selectFile = useAstStore((s) => s.selectFile)
  const hoveredNode = useAstStore((s) => s.hoveredNode)
  const setHoveredNode = useAstStore((s) => s.setHoveredNode)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const layout = useMemo(
    () => computeRepoLayout(repoGraph, archAnalysis),
    [repoGraph, archAnalysis],
  )

  const showDeps = activeOverlays.has('deps')

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
    <>
      <GraphCanvas>
        {/* Cluster background rects */}
        {layout.clusters.map((cluster) => (
          <g key={cluster.id}>
            <rect
              x={cluster.x}
              y={cluster.y}
              width={cluster.width}
              height={cluster.height}
              rx={8}
              fill={`${cluster.color}10`}
              stroke={cluster.color}
              strokeWidth={1}
              strokeDasharray="6 3"
              opacity={0.6}
            />
            <text
              x={cluster.x + 8}
              y={cluster.y + 16}
              fill={cluster.color}
              fontSize={11}
              fontWeight={500}
              opacity={0.8}
            >
              {cluster.name}
            </text>
          </g>
        ))}

        {/* Dependency edge lines */}
        {showDeps &&
          layout.edges.map((edge) => {
            const sourceNode = layout.nodes.find((n) => n.id === edge.source)
            const targetNode = layout.nodes.find((n) => n.id === edge.target)
            if (!sourceNode || !targetNode) return null
            return (
              <line
                key={`${edge.source}->${edge.target}`}
                x1={sourceNode.x + sourceNode.width / 2}
                y1={sourceNode.y + sourceNode.height / 2}
                x2={targetNode.x + targetNode.width / 2}
                y2={targetNode.y + targetNode.height / 2}
                stroke="#484f58"
                strokeWidth={1}
                opacity={0.4}
              />
            )
          })}

        {/* File node rects */}
        {layout.nodes.map((node) => {
          const isSelected = selectedFile === node.filePath
          const isHovered = hoveredNode === node.id

          return (
            <g
              key={node.id}
              onClick={() => selectFile(node.filePath)}
              onContextMenu={(e) => handleContextMenu(e, node.id, node.name, node.filePath)}
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
                stroke={isSelected ? '#58a6ff' : (node.layerColor ?? '#484f58')}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height / 2 + 4}
                textAnchor="middle"
                fill="#e6edf3"
                fontSize={10}
                fontFamily="var(--font-mono, monospace)"
              >
                {node.name.length > 16 ? `${node.name.slice(0, 14)}..` : node.name}
              </text>
            </g>
          )
        })}
      </GraphCanvas>

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
    </>
  )
}
