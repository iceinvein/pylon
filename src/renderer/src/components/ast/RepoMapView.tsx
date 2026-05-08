import { FolderOpen, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArchAnalysis, FileNode, RepoGraph } from '../../../../shared/types'
import { AST_GRAPH_COLORS } from '../../lib/ast-colors'
import { countVisibleSearchMatches, findVisibleGraphNode } from '../../lib/ast-graph-resolve'
import {
  computeRepoLayout,
  type LayoutEdge,
  type LayoutNode,
  type RepoLayoutSeed,
} from '../../lib/ast-layout'
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

type NodePopoverDetails = {
  kind: 'File' | 'Folder'
  title: string
  subtitle: string
  meta: string[]
  stats: { inbound: number; outbound: number }
  declarations: string[]
  annotation?: string
}

const HOVER_POPOVER_WIDTH = 280
const HOVER_POPOVER_PADDING = 12
const HOVER_POPOVER_MAX_TOP = 180

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

function parentPath(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx > 0 ? filePath.slice(0, idx) : filePath
}

function filesInDir(dir: string, graph: RepoGraph): number {
  return graph.files.filter((file) => parentPath(file.filePath) === dir).length
}

function fileNodesInDir(dir: string, graph: RepoGraph): FileNode[] {
  return graph.files.filter((file) => parentPath(file.filePath) === dir)
}

function isFileInDir(filePath: string, dir: string): boolean {
  return parentPath(filePath) === dir
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

function formatLanguageSummary(files: FileNode[]): string {
  const counts = new Map<string, number>()
  for (const file of files) {
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([language, count]) => `${language} ${count}`)
    .join(' · ')
}

function edgeStatsForNode(
  nodeId: string,
  edges: LayoutEdge[],
): { inbound: number; outbound: number } {
  let inbound = 0
  let outbound = 0
  for (const edge of edges) {
    if (edge.source === nodeId) outbound++
    if (edge.target === nodeId) inbound++
  }
  return { inbound, outbound }
}

function edgeStatsForDir(dir: string, edges: LayoutEdge[]): { inbound: number; outbound: number } {
  let inbound = 0
  let outbound = 0
  for (const edge of edges) {
    const sourceInDir = isFileInDir(edge.source, dir)
    const targetInDir = isFileInDir(edge.target, dir)
    if (sourceInDir && !targetInDir) outbound++
    if (!sourceInDir && targetInDir) inbound++
  }
  return { inbound, outbound }
}

function buildNodePopoverDetails(
  node: LayoutNode,
  graph: RepoGraph,
  edges: LayoutEdge[],
  analysis: ArchAnalysis | null,
): NodePopoverDetails {
  if (node.isCluster) {
    const files = fileNodesInDir(node.filePath, graph)
    const declarationCount = files.reduce((sum, file) => sum + file.declarations.length, 0)
    const importsCount = files.reduce((sum, file) => sum + file.imports.length, 0)
    const clusterDescription = analysis?.clusters.find(
      (cluster) => cluster.id === node.id,
    )?.description

    return {
      kind: 'Folder',
      title: node.name,
      subtitle: node.filePath,
      meta: [
        `${files.length} files`,
        `${declarationCount} declarations`,
        `${importsCount} imports`,
        formatLanguageSummary(files),
      ].filter(Boolean),
      stats: edgeStatsForNode(node.id, edges),
      declarations: files
        .flatMap((file) => file.declarations.slice(0, 2).map((declaration) => declaration.name))
        .slice(0, 5),
      annotation: clusterDescription,
    }
  }

  const file = graph.files.find((candidate) => candidate.filePath === node.filePath)
  const annotation = analysis?.annotations[node.filePath]

  return {
    kind: 'File',
    title: node.name,
    subtitle: node.filePath,
    meta: file
      ? [
          file.language,
          formatBytes(file.size),
          `${file.declarations.length} declarations`,
          `${file.imports.length} imports`,
        ]
      : [parentPath(node.filePath)],
    stats: edgeStatsForNode(node.id, edges),
    declarations: file?.declarations.slice(0, 5).map((declaration) => declaration.name) ?? [],
    annotation,
  }
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
  const panX = useAstStore((s) => s.panX)
  const panY = useAstStore((s) => s.panY)

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const previousNodeCentersRef = useRef<RepoLayoutSeed>(new Map())
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
    () =>
      computeRepoLayout(repoGraph, archAnalysis, expandedClusters, previousNodeCentersRef.current),
    [repoGraph, archAnalysis, expandedClusters],
  )

  useEffect(() => {
    const next: RepoLayoutSeed = new Map()
    for (const node of layout.nodes) {
      next.set(node.id, {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
      })
    }
    previousNodeCentersRef.current = next
  }, [layout])

  const showDeps = activeOverlays.has('deps')
  const showGroups = activeOverlays.has('groups')
  const showCalls = activeOverlays.has('calls')
  const showDataflow = activeOverlays.has('dataflow')

  // Zoom-level buckets
  const zoomLevel: 'overview' | 'standard' | 'detail' =
    zoom < 0.3 ? 'overview' : zoom > 1.2 ? 'detail' : 'standard'

  // Neighbour set for ego network focus
  const neighborSet = useMemo(() => {
    if (!focusedNode) return null
    return computeNeighbors(focusedNode, repoGraph.edges)
  }, [focusedNode, repoGraph.edges])

  const resolveVisibleNode = useCallback(
    (filePath: string) => findVisibleGraphNode(filePath, repoGraph.files, layout.nodes),
    [repoGraph.files, layout.nodes],
  )

  const visibleSearchCounts = useMemo(() => {
    if (searchQuery.trim().length === 0) return new Map<string, number>()
    return countVisibleSearchMatches(searchMatches, repoGraph.files, layout.nodes)
  }, [searchQuery, searchMatches, repoGraph.files, layout.nodes])

  const isSearchFiltering = searchQuery.trim().length > 0 && visibleSearchCounts.size > 0

  const selectedLayoutNode = useMemo(() => {
    if (selectedFile) {
      return layout.nodes.find((node) => node.filePath === selectedFile) ?? null
    }
    if (focusedNode) {
      return layout.nodes.find((node) => node.id === focusedNode) ?? null
    }
    return null
  }, [selectedFile, focusedNode, layout.nodes])
  const selectedExpandedCluster = useMemo(() => {
    if (!focusedNode || !expandedClusters.has(focusedNode)) return null
    const cluster = layout.clusters.find((c) => c.id === focusedNode)
    if (!cluster) return null
    return {
      id: focusedNode,
      name: cluster.name,
      filePath: focusedNode,
      fileCount: filesInDir(focusedNode, repoGraph),
    }
  }, [focusedNode, expandedClusters, layout.clusters, repoGraph])
  const selectedDisplay = selectedLayoutNode ?? selectedExpandedCluster
  const isFocusedCluster = !!selectedLayoutNode?.isCluster && selectedLayoutNode.id === focusedNode
  const focusedExpandedClusterId = selectedExpandedCluster?.id ?? null
  const selectedNodeEdgeStats = useMemo(() => {
    if (!selectedDisplay) return null
    if (focusedExpandedClusterId) return edgeStatsForDir(focusedExpandedClusterId, layout.edges)
    return edgeStatsForNode(selectedDisplay.id, layout.edges)
  }, [focusedExpandedClusterId, selectedDisplay, layout.edges])
  const hoveredLayoutNode = useMemo(() => {
    if (!hoveredNode || contextMenu) return null
    return layout.nodes.find((node) => node.id === hoveredNode) ?? null
  }, [contextMenu, hoveredNode, layout.nodes])
  const hoveredDetails = useMemo(() => {
    if (!hoveredLayoutNode) return null
    return buildNodePopoverDetails(hoveredLayoutNode, repoGraph, layout.edges, archAnalysis)
  }, [archAnalysis, hoveredLayoutNode, layout.edges, repoGraph])
  const hoveredPopoverPosition = useMemo(() => {
    if (!hoveredLayoutNode) return null

    const nodeLeft = panX + 400 + hoveredLayoutNode.x * zoom
    const nodeRight = panX + 400 + (hoveredLayoutNode.x + hoveredLayoutNode.width) * zoom
    const nodeTop = panY + 300 + hoveredLayoutNode.y * zoom
    const preferredLeft = nodeRight + HOVER_POPOVER_PADDING
    const roomOnRight = preferredLeft + HOVER_POPOVER_WIDTH <= canvasSize.width
    const left = roomOnRight
      ? preferredLeft
      : nodeLeft - HOVER_POPOVER_WIDTH - HOVER_POPOVER_PADDING
    const maxLeft = Math.max(HOVER_POPOVER_PADDING, canvasSize.width - HOVER_POPOVER_WIDTH - 8)
    const maxTop = Math.max(HOVER_POPOVER_PADDING, canvasSize.height - HOVER_POPOVER_MAX_TOP)

    return {
      left: Math.min(Math.max(left, HOVER_POPOVER_PADDING), maxLeft),
      top: Math.min(Math.max(nodeTop, HOVER_POPOVER_PADDING), maxTop),
    }
  }, [canvasSize.height, canvasSize.width, hoveredLayoutNode, panX, panY, zoom])

  /** Compute opacity for a node based on focus and search state. */
  const nodeOpacity = useCallback(
    (node: LayoutNode): number => {
      if (isSearchFiltering) {
        return visibleSearchCounts.has(node.id) ? 1 : 0.22
      }
      if (focusedNode) {
        if (node.id === focusedNode) return 1
        if (isFocusedCluster) return 0.35
        if (focusedExpandedClusterId) {
          return isFileInDir(node.filePath, focusedExpandedClusterId) ? 1 : 0.16
        }
        if (neighborSet?.has(node.id)) return 1
        return 0.12
      }
      return 1
    },
    [
      focusedNode,
      focusedExpandedClusterId,
      isFocusedCluster,
      neighborSet,
      isSearchFiltering,
      visibleSearchCounts,
    ],
  )

  /** Compute opacity for an edge based on focus state. */
  const edgeOpacity = useCallback(
    (edge: LayoutEdge): number => {
      if (focusedNode) {
        if (isFocusedCluster) return 0.12
        if (focusedExpandedClusterId) {
          const sourceInDir = isFileInDir(edge.source, focusedExpandedClusterId)
          const targetInDir = isFileInDir(edge.target, focusedExpandedClusterId)
          if (sourceInDir && targetInDir) return 0.42
          if (sourceInDir || targetInDir) return 0.76
          return 0.05
        }
        if (edge.source === focusedNode || edge.target === focusedNode) return 0.78
        return 0.05
      }
      return 0.5
    },
    [focusedNode, focusedExpandedClusterId, isFocusedCluster],
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

  /** Single-click selects a visible node without changing graph layout. */
  const handleNodeClick = useCallback(
    (node: LayoutNode) => {
      if (node.isCluster) {
        setFocusedNode(node.id)
        selectFile(null)
      } else {
        setFocusedNode(node.id)
        selectFile(node.filePath)
      }
    },
    [selectFile, setFocusedNode],
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

  const toggleSelectedClusterExpansion = useCallback(() => {
    const clusterId = selectedDisplay?.id
    if (!clusterId) return
    toggleCluster(clusterId)
    setFocusedNode(clusterId)
    selectFile(null)
  }, [selectedDisplay, toggleCluster, setFocusedNode, selectFile])

  const clearSelection = useCallback(() => {
    setFocusedNode(null)
    selectFile(null)
  }, [setFocusedNode, selectFile])

  // At overview zoom, force all clusters to appear collapsed visually.
  // We still use the layout as computed — collapsed clusters are already summary nodes.
  // For the overview, we just skip rendering individual file labels for readability.

  const renderNode = useCallback(
    (node: LayoutNode) => {
      const isSelected = selectedFile === node.filePath || focusedNode === node.id
      const isHovered = hoveredNode === node.id
      const opacity = nodeOpacity(node)
      const searchMatchCount = visibleSearchCounts.get(node.id) ?? 0
      const isMatch = isSearchFiltering && searchMatchCount > 0

      if (node.isCluster) {
        // Collapsed directory cluster node
        return (
          <g
            key={node.id}
            data-node="true"
            onClick={() => handleNodeClick(node)}
            onDoubleClick={() => handleNodeDoubleClick(node)}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: 'pointer' }}
            opacity={opacity}
          >
            {isSelected && (
              <rect
                x={node.x - 4}
                y={node.y - 4}
                width={node.width + 8}
                height={node.height + 8}
                rx={10}
                fill="none"
                stroke={AST_GRAPH_COLORS.selected}
                strokeWidth={2}
                opacity={0.82}
              />
            )}
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={8}
              fill={
                isHovered
                  ? `${node.layerColor ?? AST_GRAPH_COLORS.clusterFallback}30`
                  : `${node.layerColor ?? AST_GRAPH_COLORS.clusterFallback}20`
              }
              stroke={node.layerColor ?? AST_GRAPH_COLORS.mutedStroke}
              strokeWidth={1.5}
            />
            {isMatch && (
              <rect
                x={node.x - 2}
                y={node.y - 2}
                width={node.width + 4}
                height={node.height + 4}
                rx={10}
                fill="none"
                stroke={AST_GRAPH_COLORS.selected}
                strokeWidth={1.5}
                opacity={0.68}
              />
            )}
            {/* Expand indicator */}
            <text
              x={node.x + 10}
              y={node.y + node.height / 2 + 4}
              fill={node.layerColor ?? AST_GRAPH_COLORS.textMuted}
              fontSize={10}
              fontFamily="var(--font-mono, monospace)"
            >
              {'+'} {node.name}
            </text>
            {isMatch && (
              <g>
                <rect
                  x={node.x + node.width - 28}
                  y={node.y + 7}
                  width={20}
                  height={16}
                  rx={4}
                  fill={AST_GRAPH_COLORS.selected}
                  opacity={0.85}
                />
                <text
                  x={node.x + node.width - 18}
                  y={node.y + 18}
                  textAnchor="middle"
                  fill="var(--color-base-bg)"
                  fontSize={9}
                  fontFamily="var(--font-mono, monospace)"
                >
                  {Math.min(searchMatchCount, 99)}
                </text>
              </g>
            )}
            {isSelected && (
              <g>
                <rect
                  x={node.x}
                  y={node.y + node.height + 6}
                  width={48}
                  height={16}
                  rx={4}
                  fill="var(--color-base-bg)"
                  stroke={AST_GRAPH_COLORS.dependency}
                  strokeWidth={0.8}
                  opacity={0.9}
                />
                <text
                  x={node.x + 24}
                  y={node.y + node.height + 17}
                  textAnchor="middle"
                  fill={AST_GRAPH_COLORS.dependency}
                  fontSize={9}
                  fontFamily="var(--font-mono, monospace)"
                >
                  in {edgeStatsForNode(node.id, layout.edges).inbound}
                </text>
                <rect
                  x={node.x + node.width - 48}
                  y={node.y + node.height + 6}
                  width={48}
                  height={16}
                  rx={4}
                  fill="var(--color-base-bg)"
                  stroke={AST_GRAPH_COLORS.dataflow}
                  strokeWidth={0.8}
                  opacity={0.9}
                />
                <text
                  x={node.x + node.width - 24}
                  y={node.y + node.height + 17}
                  textAnchor="middle"
                  fill={AST_GRAPH_COLORS.dataflow}
                  fontSize={9}
                  fontFamily="var(--font-mono, monospace)"
                >
                  out {edgeStatsForNode(node.id, layout.edges).outbound}
                </text>
              </g>
            )}
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
          {isSelected && (
            <rect
              x={node.x - 4}
              y={node.y - 4}
              width={node.width + 8}
              height={node.height + 8}
              rx={7}
              fill="none"
              stroke={AST_GRAPH_COLORS.selected}
              strokeWidth={2}
              opacity={0.82}
            />
          )}
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={4}
            fill={isHovered ? AST_GRAPH_COLORS.surfaceHover : AST_GRAPH_COLORS.surface}
            stroke={
              isMatch
                ? AST_GRAPH_COLORS.selected
                : isSelected
                  ? AST_GRAPH_COLORS.selected
                  : (node.layerColor ?? AST_GRAPH_COLORS.mutedStroke)
            }
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
              stroke={AST_GRAPH_COLORS.selected}
              strokeWidth={1.5}
              opacity={0.6}
            />
          )}
          {zoomLevel !== 'overview' && (
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2 + 4}
              textAnchor="middle"
              fill={AST_GRAPH_COLORS.text}
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
              fill={AST_GRAPH_COLORS.textMuted}
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
      focusedNode,
      hoveredNode,
      nodeOpacity,
      isSearchFiltering,
      visibleSearchCounts,
      zoomLevel,
      handleNodeClick,
      handleNodeDoubleClick,
      handleContextMenu,
      setHoveredNode,
      layout.edges,
    ],
  )

  return (
    <>
      <div ref={containerRef} className="relative h-full w-full">
        {selectedDisplay && (
          <div className="absolute top-3 left-3 z-10 flex max-w-[min(28rem,calc(100%-7rem))] items-center gap-2 rounded-md border border-base-border bg-base-bg/90 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
            {(selectedLayoutNode?.isCluster || selectedExpandedCluster) && (
              <FolderOpen size={13} className="shrink-0 text-base-text-muted" />
            )}
            <span className="truncate font-medium text-base-text text-xs">
              {selectedDisplay.name}
            </span>
            <span className="truncate font-mono text-[10px] text-base-text-muted">
              {selectedLayoutNode?.isCluster || selectedExpandedCluster
                ? selectedDisplay.filePath
                : parentPath(selectedDisplay.filePath)}
            </span>
            {selectedNodeEdgeStats && (
              <span className="shrink-0 font-mono text-[10px] text-base-text-muted">
                {selectedDisplay.fileCount ? `${selectedDisplay.fileCount} files · ` : ''}
                in {selectedNodeEdgeStats.inbound} · out {selectedNodeEdgeStats.outbound}
              </span>
            )}
            {(selectedLayoutNode?.isCluster || selectedExpandedCluster) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSelectedClusterExpansion()
                }}
                className="shrink-0 rounded border border-base-border-subtle px-1.5 py-0.5 text-[10px] text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
              >
                {selectedExpandedCluster ? 'Collapse' : 'Expand'}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                clearSelection()
              }}
              className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
              aria-label="Clear graph selection"
            >
              <X size={12} />
            </button>
          </div>
        )}
        {hoveredDetails && hoveredPopoverPosition && (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-base-border bg-base-bg/95 p-2.5 shadow-xl backdrop-blur-sm"
            style={{
              left: hoveredPopoverPosition.left,
              top: hoveredPopoverPosition.top,
              width: HOVER_POPOVER_WIDTH,
            }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate font-medium text-base-text text-xs">
                {hoveredDetails.title}
              </span>
              <span className="shrink-0 rounded border border-base-border-subtle px-1.5 py-0.5 font-mono text-[9px] text-base-text-muted">
                {hoveredDetails.kind}
              </span>
            </div>
            <div className="truncate font-mono text-[10px] text-base-text-muted">
              {hoveredDetails.subtitle}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {hoveredDetails.meta.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="rounded border border-base-border-subtle bg-base-surface px-1.5 py-0.5 font-mono text-[9px] text-base-text-muted"
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[10px]">
              <div className="rounded border border-base-border-subtle bg-base-surface px-2 py-1 text-base-text-muted">
                in <span className="text-base-text">{hoveredDetails.stats.inbound}</span>
              </div>
              <div className="rounded border border-base-border-subtle bg-base-surface px-2 py-1 text-base-text-muted">
                out <span className="text-base-text">{hoveredDetails.stats.outbound}</span>
              </div>
            </div>
            {hoveredDetails.declarations.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 font-mono text-[9px] text-base-text-faint">declarations</div>
                <div className="flex flex-wrap gap-1">
                  {hoveredDetails.declarations.map((declaration, index) => (
                    <span
                      key={`${declaration}-${index}`}
                      className="max-w-full truncate rounded bg-base-raised px-1.5 py-0.5 font-mono text-[9px] text-base-text-muted"
                    >
                      {declaration}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hoveredDetails.annotation && (
              <div className="mt-2 line-clamp-3 text-[10px] text-base-text-muted leading-relaxed">
                {hoveredDetails.annotation}
              </div>
            )}
          </div>
        )}
        <GraphCanvas layoutNodes={layout.nodes} onCanvasClick={clearSelection}>
          {/* Cluster outlines for expanded clusters */}
          {layout.clusters
            .filter((cluster) => showGroups || cluster.id === focusedNode)
            .map((cluster) => {
              const isSelectedCluster = cluster.id === focusedNode
              const selectedStats =
                isSelectedCluster && focusedExpandedClusterId
                  ? edgeStatsForDir(focusedExpandedClusterId, layout.edges)
                  : null
              return (
                <g key={cluster.id}>
                  <rect
                    x={cluster.x}
                    y={cluster.y}
                    width={cluster.width}
                    height={cluster.height}
                    rx={8}
                    fill={isSelectedCluster ? cluster.color : 'none'}
                    fillOpacity={isSelectedCluster ? 0.06 : 0}
                    stroke={cluster.color}
                    strokeWidth={isSelectedCluster ? 2 : 0.8}
                    strokeDasharray={isSelectedCluster ? '7 4' : '5 5'}
                    opacity={isSelectedCluster ? 0.9 : 0.38}
                  />
                  {isSelectedCluster && (
                    <rect
                      x={cluster.x + 8}
                      y={cluster.y - 10}
                      width={Math.max(120, Math.min(cluster.width - 16, 188))}
                      height={22}
                      rx={5}
                      fill="var(--color-base-bg)"
                      stroke={cluster.color}
                      strokeWidth={1}
                      opacity={0.96}
                    />
                  )}
                  <text
                    x={cluster.x + 16}
                    y={isSelectedCluster ? cluster.y + 5 : cluster.y + 16}
                    fill={cluster.color}
                    fontSize={11}
                    fontWeight={500}
                    opacity={isSelectedCluster ? 1 : 0.62}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleCluster(cluster.id)}
                  >
                    {isSelectedCluster ? `Folder: ${cluster.name}` : cluster.name}
                  </text>
                  {selectedStats && (
                    <text
                      x={cluster.x + 16}
                      y={cluster.y + 22}
                      fill={AST_GRAPH_COLORS.textMuted}
                      fontSize={9}
                      fontFamily="var(--font-mono, monospace)"
                      opacity={0.88}
                    >
                      {filesInDir(cluster.id, repoGraph)} files · in {selectedStats.inbound} · out{' '}
                      {selectedStats.outbound}
                    </text>
                  )}
                </g>
              )
            })}

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
                  stroke={AST_GRAPH_COLORS.dependency}
                  strokeWidth={
                    focusedNode &&
                    !isFocusedCluster &&
                    (edge.source === focusedNode || edge.target === focusedNode)
                      ? 1.8
                      : 1.2
                  }
                  opacity={edgeOpacity(edge)}
                />
              )
            })}

          {/* Call edges (from Claude analysis) */}
          {showCalls &&
            archAnalysis?.callEdges?.map((edge, i) => {
              const sourceNode = resolveVisibleNode(edge.caller.filePath)
              const targetNode = resolveVisibleNode(edge.callee.filePath)
              if (!sourceNode || !targetNode) return null
              if (sourceNode.id === targetNode.id) return null
              const isFocusedEdge = sourceNode.id === focusedNode || targetNode.id === focusedNode
              const x1 = sourceNode.x + sourceNode.width / 2
              const y1 = sourceNode.y + sourceNode.height / 2
              const x2 = targetNode.x + targetNode.width / 2
              const y2 = targetNode.y + targetNode.height / 2
              return (
                <path
                  key={`call-${i}`}
                  d={curvedPath(x1, y1, x2, y2)}
                  fill="none"
                  stroke={AST_GRAPH_COLORS.call}
                  strokeWidth={focusedNode && !isFocusedCluster && isFocusedEdge ? 2 : 1.4}
                  strokeDasharray="4 2"
                  opacity={focusedNode && !isFocusedCluster ? (isFocusedEdge ? 0.78 : 0.08) : 0.58}
                />
              )
            })}

          {/* Data flow paths (from Claude analysis) */}
          {showDataflow &&
            archAnalysis?.dataFlows?.map((flow) =>
              flow.steps.map((step, i) => {
                if (i === 0) return null
                const prevStep = flow.steps[i - 1]
                const sourceNode = resolveVisibleNode(prevStep.filePath)
                const targetNode = resolveVisibleNode(step.filePath)
                if (!sourceNode || !targetNode) return null
                if (sourceNode.id === targetNode.id) return null
                const isFocusedEdge = sourceNode.id === focusedNode || targetNode.id === focusedNode
                const x1 = sourceNode.x + sourceNode.width / 2
                const y1 = sourceNode.y + sourceNode.height / 2
                const x2 = targetNode.x + targetNode.width / 2
                const y2 = targetNode.y + targetNode.height / 2
                return (
                  <g key={`flow-${flow.id}-${i}`}>
                    <path
                      d={curvedPath(x1, y1, x2, y2)}
                      fill="none"
                      stroke={AST_GRAPH_COLORS.dataflow}
                      strokeWidth={
                        focusedNode && !isFocusedCluster ? (isFocusedEdge ? 2.4 : 1.8) : 2
                      }
                      opacity={
                        focusedNode && !isFocusedCluster ? (isFocusedEdge ? 0.82 : 0.08) : 0.62
                      }
                    />
                    {/* Arrow marker at midpoint */}
                    <circle
                      cx={(x1 + x2) / 2}
                      cy={(y1 + y2) / 2}
                      r={3}
                      fill={AST_GRAPH_COLORS.dataflow}
                      opacity={0.72}
                    />
                  </g>
                )
              }),
            )}

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
