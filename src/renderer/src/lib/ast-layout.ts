/**
 * Graph layout engine for the AST Visualizer.
 *
 * - `computeRepoLayout`  — positions repo-level file nodes using d3-force,
 *   optionally groups them into cluster bounding boxes from ArchAnalysis.
 * - `computeTreeLayout`  — positions an AST node tree top-down for file-level view.
 */

import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import type { ArchAnalysis, AstNode, RepoGraph } from '../../../shared/types'

// ── Layout types ──

export type LayoutNode = {
  id: string
  filePath: string
  name: string
  x: number
  y: number
  width: number
  height: number
  clusterId?: string
  layerColor?: string
  isCluster?: boolean
  fileCount?: number
}

export type LayoutEdge = {
  source: string
  target: string
  label?: string
}

export type LayoutCluster = {
  id: string
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
}

export type RepoLayout = {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  clusters: LayoutCluster[]
}

export type TreeLayoutNode = {
  id: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  startLine: number
  endLine: number
}

export type TreeLayout = {
  nodes: TreeLayoutNode[]
  edges: LayoutEdge[]
}

// ── Constants ──

const REPO_NODE_WIDTH = 140
const REPO_NODE_HEIGHT = 32
const CLUSTER_NODE_WIDTH = 160
const CLUSTER_NODE_HEIGHT = 36
const CLUSTER_PADDING = 30
const SIMULATION_TICKS = 300

const NODE_WIDTH = 120
const NODE_HEIGHT = 28
const TREE_H_SPACING = 140
const TREE_V_SPACING = 60

// ── Repo-level layout (d3-force) ──

type SimNode = {
  id: string
  filePath: string
  name: string
  x: number
  y: number
  vx: number
  vy: number
  clusterId?: string
  layerColor?: string
}

type SimLink = {
  source: string
  target: string
  label?: string
}

function fileBaseName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

/** Derive the directory path for a file (relative segments minus filename). */
function fileDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx > 0 ? filePath.slice(0, idx) : '.'
}

/** Palette for directory-based clusters when no ArchAnalysis colours exist. */
const DIR_COLORS = [
  '#58a6ff',
  '#7ee787',
  '#d2a8ff',
  '#ff7b72',
  '#79c0ff',
  '#ffa657',
  '#f778ba',
  '#a5d6ff',
  '#56d4dd',
  '#e3b341',
]

export function computeRepoLayout(
  graph: RepoGraph,
  analysis: ArchAnalysis | null,
  expandedClusters?: Set<string>,
): RepoLayout {
  if (graph.files.length === 0) {
    return { nodes: [], edges: [], clusters: [] }
  }

  const expanded = expandedClusters ?? new Set<string>()

  // ── 1. Build arch-analysis lookup ──
  const fileClusterMap = new Map<string, { clusterId: string; layerColor: string }>()

  if (analysis) {
    const layerColorMap = new Map<string, string>()
    for (const layer of analysis.layers) {
      layerColorMap.set(layer.id, layer.color)
    }
    for (const cluster of analysis.clusters) {
      const color = layerColorMap.get(cluster.layerId) ?? '#484f58'
      for (const filePath of cluster.files) {
        fileClusterMap.set(filePath, { clusterId: cluster.id, layerColor: color })
      }
    }
  }

  // ── 2. Group files by directory ──
  const dirGroups = new Map<string, typeof graph.files>()
  for (const f of graph.files) {
    const dir = fileDir(f.filePath)
    let group = dirGroups.get(dir)
    if (!group) {
      group = []
      dirGroups.set(dir, group)
    }
    group.push(f)
  }

  // Assign stable colours per directory
  const dirColorMap = new Map<string, string>()
  let colorIdx = 0
  for (const dir of dirGroups.keys()) {
    dirColorMap.set(dir, DIR_COLORS[colorIdx % DIR_COLORS.length])
    colorIdx++
  }

  // ── 3. Build simulation nodes — collapsed dirs become single nodes ──
  const simNodes: SimNode[] = []
  // Track which files are represented by a cluster summary node
  const collapsedFileToDir = new Map<string, string>()

  let angle = 0
  const totalItems = dirGroups.size // rough count for initial placement
  for (const [dir, files] of dirGroups) {
    const isExpanded = expanded.has(dir)

    if (isExpanded) {
      // Expanded: individual file nodes
      for (const f of files) {
        const info = fileClusterMap.get(f.filePath)
        simNodes.push({
          id: f.filePath,
          filePath: f.filePath,
          name: fileBaseName(f.filePath),
          x: Math.cos((2 * Math.PI * angle) / Math.max(totalItems * 3, 1)) * 200,
          y: Math.sin((2 * Math.PI * angle) / Math.max(totalItems * 3, 1)) * 200,
          vx: 0,
          vy: 0,
          clusterId: info?.clusterId ?? dir,
          layerColor: info?.layerColor ?? dirColorMap.get(dir),
        })
        angle++
      }
    } else {
      // Collapsed: single summary node for directory
      const dirBaseName = dir === '.' ? 'root' : (dir.split('/').pop() ?? dir)
      for (const f of files) {
        collapsedFileToDir.set(f.filePath, dir)
      }
      simNodes.push({
        id: dir,
        filePath: dir,
        name: `${dirBaseName} (${files.length})`,
        x: Math.cos((2 * Math.PI * angle) / Math.max(totalItems, 1)) * 200,
        y: Math.sin((2 * Math.PI * angle) / Math.max(totalItems, 1)) * 200,
        vx: 0,
        vy: 0,
        clusterId: dir,
        layerColor: dirColorMap.get(dir),
      })
      angle++
    }
  }

  // ── 4. Build edges — remap collapsed file edges to their dir node ──
  const nodeIdSet = new Set(simNodes.map((n) => n.id))

  function resolveId(filePath: string): string {
    const dir = collapsedFileToDir.get(filePath)
    return dir ?? filePath
  }

  const edgeDescriptors: Array<{ sourceId: string; targetId: string; label?: string }> = []
  const edgeDedupe = new Set<string>()

  for (const e of graph.edges) {
    const src = resolveId(e.source)
    const tgt = resolveId(e.target)
    if (!nodeIdSet.has(src) || !nodeIdSet.has(tgt)) continue
    if (src === tgt) continue // skip self-loops within collapsed dir
    const key = `${src}->${tgt}`
    if (edgeDedupe.has(key)) continue
    edgeDedupe.add(key)
    edgeDescriptors.push({
      sourceId: src,
      targetId: tgt,
      label: e.specifiers.length > 0 ? e.specifiers.join(', ') : undefined,
    })
  }

  const simLinks: SimLink[] = edgeDescriptors.map((d) => ({
    source: d.sourceId,
    target: d.targetId,
    label: d.label,
  }))

  // ── 5. Run d3-force simulation ──
  const collideRadius = (d: SimNode) => {
    const isClusterNode =
      collapsedFileToDir.size > 0 && !d.filePath.includes('/')
        ? CLUSTER_NODE_WIDTH / 2 + 12
        : REPO_NODE_WIDTH / 2 + 10
    return dirGroups.has(d.id) && !expanded.has(d.id) ? CLUSTER_NODE_WIDTH / 2 + 12 : isClusterNode
  }

  const simulation = forceSimulation<SimNode>(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(100),
    )
    .force('charge', forceManyBody().strength(-200))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<SimNode>().radius(collideRadius))
    .stop()

  for (let i = 0; i < SIMULATION_TICKS; i++) {
    simulation.tick()
  }

  // ── 6. Map to LayoutNodes ──
  const collapsedDirs = new Set(collapsedFileToDir.values())

  const layoutNodes: LayoutNode[] = simNodes.map((n) => {
    const isSummary = collapsedDirs.has(n.id)
    const w = isSummary ? CLUSTER_NODE_WIDTH : REPO_NODE_WIDTH
    const h = isSummary ? CLUSTER_NODE_HEIGHT : REPO_NODE_HEIGHT
    return {
      id: n.id,
      filePath: n.filePath,
      name: n.name,
      x: n.x - w / 2,
      y: n.y - h / 2,
      width: w,
      height: h,
      clusterId: n.clusterId,
      layerColor: n.layerColor,
      isCluster: isSummary,
      fileCount: isSummary ? (dirGroups.get(n.id)?.length ?? 0) : undefined,
    }
  })

  // ── 7. Map edges ──
  const layoutEdges: LayoutEdge[] = edgeDescriptors.map((d) => ({
    source: d.sourceId,
    target: d.targetId,
    label: d.label,
  }))

  // ── 8. Cluster bounding boxes for expanded directories ──
  const clusters: LayoutCluster[] = []

  for (const dir of expanded) {
    const clusterNodes = layoutNodes.filter((n) => !n.isCluster && fileDir(n.filePath) === dir)
    if (clusterNodes.length === 0) continue

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const n of clusterNodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x + n.width > maxX) maxX = n.x + n.width
      if (n.y + n.height > maxY) maxY = n.y + n.height
    }

    const dirBaseName = dir === '.' ? 'root' : (dir.split('/').pop() ?? dir)
    clusters.push({
      id: dir,
      name: dirBaseName,
      color: dirColorMap.get(dir) ?? '#484f58',
      x: minX - CLUSTER_PADDING,
      y: minY - CLUSTER_PADDING,
      width: maxX - minX + CLUSTER_PADDING * 2,
      height: maxY - minY + CLUSTER_PADDING * 2,
    })
  }

  // Also add arch-analysis clusters if available
  if (analysis) {
    for (const cluster of analysis.clusters) {
      const clusterNodes = layoutNodes.filter((n) => n.clusterId === cluster.id && !n.isCluster)
      if (clusterNodes.length === 0) continue

      const layerColor = analysis.layers.find((l) => l.id === cluster.layerId)?.color ?? '#484f58'

      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY

      for (const n of clusterNodes) {
        if (n.x < minX) minX = n.x
        if (n.y < minY) minY = n.y
        if (n.x + n.width > maxX) maxX = n.x + n.width
        if (n.y + n.height > maxY) maxY = n.y + n.height
      }

      clusters.push({
        id: cluster.id,
        name: cluster.name,
        color: layerColor,
        x: minX - CLUSTER_PADDING,
        y: minY - CLUSTER_PADDING,
        width: maxX - minX + CLUSTER_PADDING * 2,
        height: maxY - minY + CLUSTER_PADDING * 2,
      })
    }
  }

  return { nodes: layoutNodes, edges: layoutEdges, clusters }
}

// ── File-level AST tree layout ──

type InternalTreeNode = {
  ast: AstNode
  children: InternalTreeNode[]
  x: number
  y: number
  subtreeWidth: number
}

function buildInternalTree(node: AstNode): InternalTreeNode {
  const children = node.children.map(buildInternalTree)
  return { ast: node, children, x: 0, y: 0, subtreeWidth: 0 }
}

function measureSubtree(node: InternalTreeNode): number {
  if (node.children.length === 0) {
    node.subtreeWidth = NODE_WIDTH
    return NODE_WIDTH
  }
  let totalWidth = 0
  for (const child of node.children) {
    totalWidth += measureSubtree(child)
  }
  // Add spacing between children
  totalWidth += (node.children.length - 1) * (TREE_H_SPACING - NODE_WIDTH)
  node.subtreeWidth = Math.max(NODE_WIDTH, totalWidth)
  return node.subtreeWidth
}

function assignPositions(node: InternalTreeNode, startX: number, level: number): void {
  node.y = level * TREE_V_SPACING

  if (node.children.length === 0) {
    node.x = startX + node.subtreeWidth / 2 - NODE_WIDTH / 2
    return
  }

  // Lay children out from left to right within the subtree's allocated width
  let childX = startX
  for (const child of node.children) {
    assignPositions(child, childX, level + 1)
    childX += child.subtreeWidth + (TREE_H_SPACING - NODE_WIDTH)
  }

  // Center parent over its children
  const firstChild = node.children[0]
  const lastChild = node.children[node.children.length - 1]
  const childrenCenter = (firstChild.x + lastChild.x + NODE_WIDTH) / 2
  node.x = childrenCenter - NODE_WIDTH / 2
}

function collectNodes(
  node: InternalTreeNode,
  outNodes: TreeLayoutNode[],
  outEdges: LayoutEdge[],
): void {
  outNodes.push({
    id: node.ast.id,
    name: node.ast.name,
    type: node.ast.type,
    x: node.x,
    y: node.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    startLine: node.ast.startLine,
    endLine: node.ast.endLine,
  })

  for (const child of node.children) {
    outEdges.push({
      source: node.ast.id,
      target: child.ast.id,
    })
    collectNodes(child, outNodes, outEdges)
  }
}

export function computeTreeLayout(astNodes: AstNode[]): TreeLayout {
  if (astNodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const allNodes: TreeLayoutNode[] = []
  const allEdges: LayoutEdge[] = []

  let offsetX = 0

  for (const root of astNodes) {
    const tree = buildInternalTree(root)
    measureSubtree(tree)
    assignPositions(tree, offsetX, 0)
    collectNodes(tree, allNodes, allEdges)
    offsetX += tree.subtreeWidth + TREE_H_SPACING
  }

  return { nodes: allNodes, edges: allEdges }
}
