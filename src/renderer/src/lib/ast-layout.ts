/**
 * Graph layout engine for the AST Visualizer.
 *
 * - `computeRepoLayout`  — positions repo-level file nodes using d3-force,
 *   optionally groups them into cluster bounding boxes from ArchAnalysis.
 * - `computeTreeLayout`  — positions an AST node tree top-down for file-level view.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force'
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

export function computeRepoLayout(
  graph: RepoGraph,
  analysis: ArchAnalysis | null,
): RepoLayout {
  if (graph.files.length === 0) {
    return { nodes: [], edges: [], clusters: [] }
  }

  // Build a lookup from filePath → cluster/layer info
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

  // Create simulation nodes
  const simNodes: SimNode[] = graph.files.map((f, i) => {
    const info = fileClusterMap.get(f.filePath)
    return {
      id: f.filePath,
      filePath: f.filePath,
      name: fileBaseName(f.filePath),
      x: Math.cos((2 * Math.PI * i) / graph.files.length) * 200,
      y: Math.sin((2 * Math.PI * i) / graph.files.length) * 200,
      vx: 0,
      vy: 0,
      clusterId: info?.clusterId,
      layerColor: info?.layerColor,
    }
  })

  // Build node id set for filtering edges
  const nodeIdSet = new Set(simNodes.map((n) => n.id))

  // Build edge descriptors — keep original string IDs separately because
  // d3-force mutates link.source/target into node object references.
  const filteredEdges = graph.edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target),
  )

  const edgeDescriptors = filteredEdges.map((e) => ({
    sourceId: e.source,
    targetId: e.target,
    label: e.specifiers.length > 0 ? e.specifiers.join(', ') : undefined,
  }))

  const simLinks: SimLink[] = filteredEdges.map((e) => ({
    source: e.source,
    target: e.target,
    label: e.specifiers.length > 0 ? e.specifiers.join(', ') : undefined,
  }))

  // Run d3-force simulation synchronously
  const simulation = forceSimulation<SimNode>(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(100),
    )
    .force('charge', forceManyBody().strength(-200))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<SimNode>().radius(REPO_NODE_WIDTH / 2 + 10))
    .stop()

  for (let i = 0; i < SIMULATION_TICKS; i++) {
    simulation.tick()
  }

  // Map to LayoutNodes — convert d3 center-based coords to top-left origin
  const layoutNodes: LayoutNode[] = simNodes.map((n) => ({
    id: n.id,
    filePath: n.filePath,
    name: n.name,
    x: n.x - REPO_NODE_WIDTH / 2,
    y: n.y - REPO_NODE_HEIGHT / 2,
    width: REPO_NODE_WIDTH,
    height: REPO_NODE_HEIGHT,
    clusterId: n.clusterId,
    layerColor: n.layerColor,
  }))

  // Map edges using preserved string IDs (d3-force mutates source/target to objects)
  const layoutEdges: LayoutEdge[] = edgeDescriptors.map((d) => ({
    source: d.sourceId,
    target: d.targetId,
    label: d.label,
  }))

  // Compute cluster bounding boxes
  const clusters: LayoutCluster[] = []

  if (analysis) {
    for (const cluster of analysis.clusters) {
      const clusterNodes = layoutNodes.filter((n) => n.clusterId === cluster.id)
      if (clusterNodes.length === 0) continue

      const layerColor =
        analysis.layers.find((l) => l.id === cluster.layerId)?.color ?? '#484f58'

      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY

      for (const n of clusterNodes) {
        // LayoutNode x/y is top-left corner
        const left = n.x
        const top = n.y
        const right = n.x + n.width
        const bottom = n.y + n.height
        if (left < minX) minX = left
        if (top < minY) minY = top
        if (right > maxX) maxX = right
        if (bottom > maxY) maxY = bottom
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

function assignPositions(
  node: InternalTreeNode,
  startX: number,
  level: number,
): void {
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
