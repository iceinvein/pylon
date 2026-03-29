import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArchAnalysis, RepoGraph } from '../../../../shared/types'
import { computeRepoLayout, type LayoutEdge, type LayoutNode } from '../../lib/ast-layout'
import { useAstStore } from '../../store/ast-store'
import { AstContextMenu } from './AstContextMenu'
import { GraphCanvas } from './GraphCanvas'
import { Minimap } from './Minimap'

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

/** Compute the set of neighbours for a focused node from graph edges. */
function computeNeighbors(nodeId: string, edges: RepoGraph['edges']): Set<string> {
  const neighbors = new Set<string>()
  for (const e of edges) {
    if (e.source === nodeId) neighbors.add(e.target)
    if (e.target === nodeId) neighbors.add(e.source)
  }
  return neighbors
}

/** Quadratic bezier midpoint offset for curved edges. */
function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  // offset perpendicular to the line
  const offset = Math.min(30, Math.sqrt(dx * dx + dy * dy) * 0.15)
  const cx = mx - dy * (offset / Math.sqrt(dx * dx + dy * dy + 1))
  const cy = my + dx * (offset / Math.sqrt(dx * dx + dy * dy + 1))
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

export function RepoMapView({ repoGraph, archAnalysis }: RepoMapViewProps) {
  const selectedFile = useAstStore((s) => s.selectedFile)
  const activeOverlays = useAstStore((s) => s.activeOverlays)
  const selectFile = useAstStore((s) => s.selectFile)
  const drillFile = useAstStore((s) => s.drillFile)
  const hoveredNode = useAstStore((s) => s.hoveredNode)
  const setHoveredNode = useAstStore((s) => s.setHoveredNode)
  const expandedClusters = useAstStore((s) => s.expandedClusters)
  const toggleCluster = useAstStore((s) => s.toggleCluster)
  const focusedNode = useAstStore((s) => s.focusedNode)
  const setFocusedNode = useAstStore((s) => s.setFocusedNode)
  const searchQuery = useAstStore((s) => s.searchQuery)
  const searchMatches = useAstStore((s) => s.searchMatches)
  const zoom = useAstStore((s) => s.zoom)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })

  // Track container dimensions for minimap viewport calculation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(
    () => computeRepoLayout(repoGraph, archAnalysis, expandedClusters),
    [repoGraph, archAnalysis, expandedClusters],
  )

  const showDeps = activeOverlays.has('deps')

  // Zoom-level buckets
  const zoomLevel: 'overview' | 'standard' | 'detail' =
    zoom < 0.3 ? 'overview' : zoom > 1.2 ? 'detail' : 'standard'

  // Neighbour set for ego network focus
  const neighborSet = useMemo(() => {
    if (!focusedNode) return null
    return computeNeighbors(focusedNode, repoGraph.edges)
  }, [focusedNode, repoGraph.edges])

  // Search match set for quick lookup
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])

  const isSearchActive = searchQuery.length > 0 && searchMatches.length > 0

  /** Compute opacity for a node based on focus and search state. */
  const nodeOpacity = useCallback(
    (node: LayoutNode): number => {
      if (focusedNode) {
        if (node.id === focusedNode) return 1
        if (neighborSet?.has(node.id)) return 1
        return 0.12
      }
      if (isSearchActive) {
        return searchMatchSet.has(node.filePath) ? 1 : 0.3
      }
      return 1
    },
    [focusedNode, neighborSet, isSearchActive, searchMatchSet],
  )

  /** Compute opacity for an edge based on focus state. */
  const edgeOpacity = useCallback(
    (edge: LayoutEdge): number => {
      if (focusedNode) {
        if (edge.source === focusedNode || edge.target === focusedNode) return 0.6
        return 0.05
      }
      return 0.4
    },
    [focusedNode],
  )

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

  /** Single-click on a file node: show code in side panel + ego network focus. */
  const handleNodeClick = useCallback(
    (node: LayoutNode) => {
      if (node.isCluster) {
        toggleCluster(node.id)
      } else {
        // Toggle ego focus (click again to clear)
        setFocusedNode(focusedNode === node.id ? null : node.id)
        // Also select the file so CodePanel shows source
        selectFile(node.filePath)
      }
    },
    [toggleCluster, setFocusedNode, selectFile, focusedNode],
  )

  /** Double-click drills into file AST tree view (replaces repo map). */
  const handleNodeDoubleClick = useCallback(
    (node: LayoutNode) => {
      if (!node.isCluster) {
        drillFile(node.filePath)
      }
    },
    [drillFile],
  )

  /** Click empty canvas clears focus. */
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only clear if click target is the SVG or root <g>, not a child node
      const target = e.target as SVGElement
      if (target.tagName === 'svg' || (target.tagName === 'g' && !target.closest('[data-node]'))) {
        setFocusedNode(null)
      }
    },
    [setFocusedNode],
  )

  // At overview zoom, force all clusters to appear collapsed visually.
  // We still use the layout as computed — collapsed clusters are already summary nodes.
  // For the overview, we just skip rendering individual file labels for readability.

  const renderNode = useCallback(
    (node: LayoutNode) => {
      const isSelected = selectedFile === node.filePath
      const isHovered = hoveredNode === node.id
      const opacity = nodeOpacity(node)
      const isMatch = isSearchActive && searchMatchSet.has(node.filePath)

      if (node.isCluster) {
        // Collapsed directory cluster node
        return (
          <g
            key={node.id}
            data-node="true"
            onClick={() => handleNodeClick(node)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: 'pointer' }}
            opacity={opacity}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={8}
              fill={
                isHovered
                  ? `${node.layerColor ?? '#484f58'}30`
                  : `${node.layerColor ?? '#484f58'}20`
              }
              stroke={node.layerColor ?? '#484f58'}
              strokeWidth={1.5}
            />
            {/* Expand indicator */}
            <text
              x={node.x + 10}
              y={node.y + node.height / 2 + 4}
              fill={node.layerColor ?? '#8b949e'}
              fontSize={10}
              fontFamily="var(--font-mono, monospace)"
            >
              {'+'} {node.name}
            </text>
          </g>
        )
      }

      // Regular file node
      const showBadge = zoomLevel === 'detail' && isHovered
      return (
        <g
          key={node.id}
          data-node="true"
          onClick={() => handleNodeClick(node)}
          onDoubleClick={() => handleNodeDoubleClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node.id, node.name, node.filePath)}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
          style={{ cursor: 'pointer' }}
          opacity={opacity}
        >
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={4}
            fill={isHovered ? '#30363d' : '#21262d'}
            stroke={isMatch ? '#58a6ff' : isSelected ? '#58a6ff' : (node.layerColor ?? '#484f58')}
            strokeWidth={isMatch ? 2 : isSelected ? 2 : 1}
          />
          {/* Search match ring */}
          {isMatch && (
            <rect
              x={node.x - 2}
              y={node.y - 2}
              width={node.width + 4}
              height={node.height + 4}
              rx={6}
              fill="none"
              stroke="#58a6ff"
              strokeWidth={1.5}
              opacity={0.6}
            />
          )}
          {zoomLevel !== 'overview' && (
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
          )}
          {showBadge && (
            <text
              x={node.x + node.width - 4}
              y={node.y - 4}
              textAnchor="end"
              fill="#8b949e"
              fontSize={8}
            >
              declarations
            </text>
          )}
        </g>
      )
    },
    [
      selectedFile,
      hoveredNode,
      nodeOpacity,
      isSearchActive,
      searchMatchSet,
      zoomLevel,
      handleNodeClick,
      handleNodeDoubleClick,
      handleContextMenu,
      setHoveredNode,
    ],
  )

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: canvas click to clear focus */}
      <div ref={containerRef} onClick={handleCanvasClick} className="relative h-full w-full">
        <GraphCanvas layoutNodes={layout.nodes}>
          {/* Cluster background rects for expanded clusters */}
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
                style={{ cursor: 'pointer' }}
                onClick={() => toggleCluster(cluster.id)}
              >
                {cluster.name}
              </text>
            </g>
          ))}

          {/* Dependency edges */}
          {showDeps &&
            layout.edges.map((edge) => {
              const sourceNode = layout.nodes.find((n) => n.id === edge.source)
              const targetNode = layout.nodes.find((n) => n.id === edge.target)
              if (!sourceNode || !targetNode) return null
              const x1 = sourceNode.x + sourceNode.width / 2
              const y1 = sourceNode.y + sourceNode.height / 2
              const x2 = targetNode.x + targetNode.width / 2
              const y2 = targetNode.y + targetNode.height / 2
              return (
                <path
                  key={`${edge.source}->${edge.target}`}
                  d={curvedPath(x1, y1, x2, y2)}
                  fill="none"
                  stroke="#484f58"
                  strokeWidth={1}
                  opacity={edgeOpacity(edge)}
                />
              )
            })}

          {/* File / cluster nodes */}
          {layout.nodes.map(renderNode)}
        </GraphCanvas>
        <Minimap
          nodes={layout.nodes}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
        />
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
    </>
  )
}
