import { describe, expect, test } from 'bun:test'
import type { ArchAnalysis, AstNode, RepoGraph } from '../../../shared/types'
import { computeRepoLayout, computeTreeLayout } from './ast-layout'

// ── Helpers ──

function makeFileNode(filePath: string) {
  return {
    filePath,
    language: 'typescript',
    declarations: [],
    imports: [],
    size: 100,
    lastModified: 1700000000,
  }
}

function makeAstNode(
  id: string,
  name: string,
  type: AstNode['type'] = 'function',
  children: AstNode[] = [],
): AstNode {
  return { id, type, name, startLine: 1, endLine: 10, children, filePath: '/test.ts' }
}

// ── computeRepoLayout ──

describe('computeRepoLayout', () => {
  test('returns empty layout for empty graph', () => {
    const graph: RepoGraph = { files: [], edges: [] }
    const layout = computeRepoLayout(graph, null)
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
    expect(layout.clusters).toHaveLength(0)
  })

  test('positions nodes for a simple graph without analysis', () => {
    const graph: RepoGraph = {
      files: [makeFileNode('/src/a.ts'), makeFileNode('/src/b.ts'), makeFileNode('/src/c.ts')],
      edges: [{ source: '/src/a.ts', target: '/src/b.ts', specifiers: ['foo'] }],
    }
    const layout = computeRepoLayout(graph, null)

    expect(layout.nodes).toHaveLength(3)
    expect(layout.edges).toHaveLength(1)
    expect(layout.clusters).toHaveLength(0)

    // All nodes should have finite coordinates
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
      expect(node.width).toBeGreaterThan(0)
      expect(node.height).toBeGreaterThan(0)
    }

    // Edge should have correct source/target
    expect(layout.edges[0].source).toBe('/src/a.ts')
    expect(layout.edges[0].target).toBe('/src/b.ts')
    expect(layout.edges[0].label).toBe('foo')
  })

  test('nodes have expected names derived from file paths', () => {
    const graph: RepoGraph = {
      files: [makeFileNode('/src/utils/helpers.ts')],
      edges: [],
    }
    const layout = computeRepoLayout(graph, null)
    expect(layout.nodes[0].name).toBe('helpers.ts')
    expect(layout.nodes[0].filePath).toBe('/src/utils/helpers.ts')
  })

  test('filters out edges referencing non-existent nodes', () => {
    const graph: RepoGraph = {
      files: [makeFileNode('/src/a.ts')],
      edges: [{ source: '/src/a.ts', target: '/src/missing.ts', specifiers: [] }],
    }
    const layout = computeRepoLayout(graph, null)
    expect(layout.edges).toHaveLength(0)
  })

  test('assigns clusters and layer colors when analysis is provided', () => {
    const graph: RepoGraph = {
      files: [makeFileNode('/src/a.ts'), makeFileNode('/src/b.ts')],
      edges: [],
    }
    const analysis: ArchAnalysis = {
      layers: [{ id: 'layer-ui', name: 'UI', color: '#4af', pattern: 'src/**' }],
      clusters: [
        {
          id: 'cluster-1',
          name: 'Components',
          description: 'UI components',
          files: ['/src/a.ts', '/src/b.ts'],
          layerId: 'layer-ui',
        },
      ],
      annotations: {},
      callEdges: [],
      dataFlows: [],
    }
    const layout = computeRepoLayout(graph, analysis)

    // Nodes should have cluster and color
    for (const node of layout.nodes) {
      expect(node.clusterId).toBe('cluster-1')
      expect(node.layerColor).toBe('#4af')
    }

    // Should produce a cluster bounding box
    expect(layout.clusters).toHaveLength(1)
    expect(layout.clusters[0].name).toBe('Components')
    expect(layout.clusters[0].color).toBe('#4af')
    expect(layout.clusters[0].width).toBeGreaterThan(0)
    expect(layout.clusters[0].height).toBeGreaterThan(0)
  })

  test('cluster bounding box encloses all cluster nodes', () => {
    const graph: RepoGraph = {
      files: [makeFileNode('/a.ts'), makeFileNode('/b.ts'), makeFileNode('/c.ts')],
      edges: [],
    }
    const analysis: ArchAnalysis = {
      layers: [{ id: 'l1', name: 'L', color: '#fff', pattern: '**' }],
      clusters: [
        {
          id: 'c1',
          name: 'All',
          description: '',
          files: ['/a.ts', '/b.ts', '/c.ts'],
          layerId: 'l1',
        },
      ],
      annotations: {},
      callEdges: [],
      dataFlows: [],
    }
    const layout = computeRepoLayout(graph, analysis)
    const cluster = layout.clusters[0]

    for (const node of layout.nodes) {
      // Node center should be within cluster bounds (with padding)
      expect(node.x).toBeGreaterThanOrEqual(cluster.x)
      expect(node.y).toBeGreaterThanOrEqual(cluster.y)
      expect(node.x + node.width).toBeLessThanOrEqual(cluster.x + cluster.width)
      expect(node.y + node.height).toBeLessThanOrEqual(cluster.y + cluster.height)
    }
  })

  test('nodes are not all at the same position', () => {
    const graph: RepoGraph = {
      files: [
        makeFileNode('/a.ts'),
        makeFileNode('/b.ts'),
        makeFileNode('/c.ts'),
        makeFileNode('/d.ts'),
      ],
      edges: [],
    }
    const layout = computeRepoLayout(graph, null)
    const xs = new Set(layout.nodes.map((n) => Math.round(n.x)))
    const ys = new Set(layout.nodes.map((n) => Math.round(n.y)))
    // With 4 nodes and force simulation, they should spread out
    expect(xs.size + ys.size).toBeGreaterThan(2)
  })
})

// ── computeTreeLayout ──

describe('computeTreeLayout', () => {
  test('returns empty layout for empty input', () => {
    const layout = computeTreeLayout([])
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
  })

  test('single root with no children', () => {
    const root = makeAstNode('n1', 'main')
    const layout = computeTreeLayout([root])

    expect(layout.nodes).toHaveLength(1)
    expect(layout.edges).toHaveLength(0)
    expect(layout.nodes[0].id).toBe('n1')
    expect(layout.nodes[0].name).toBe('main')
    expect(layout.nodes[0].type).toBe('function')
    expect(Number.isFinite(layout.nodes[0].x)).toBe(true)
    expect(Number.isFinite(layout.nodes[0].y)).toBe(true)
  })

  test('root with two children produces correct node and edge counts', () => {
    const child1 = makeAstNode('c1', 'child1', 'variable')
    const child2 = makeAstNode('c2', 'child2', 'type')
    const root = makeAstNode('r1', 'root', 'function', [child1, child2])

    const layout = computeTreeLayout([root])

    expect(layout.nodes).toHaveLength(3)
    expect(layout.edges).toHaveLength(2)

    // Edges connect root to children
    const edgeSources = layout.edges.map((e) => e.source)
    const edgeTargets = layout.edges.map((e) => e.target)
    expect(edgeSources).toEqual(['r1', 'r1'])
    expect(edgeTargets.sort()).toEqual(['c1', 'c2'])
  })

  test('children are below parent (larger y)', () => {
    const child = makeAstNode('c1', 'child')
    const root = makeAstNode('r1', 'root', 'function', [child])

    const layout = computeTreeLayout([root])

    const rootNode = layout.nodes.find((n) => n.id === 'r1')!
    const childNode = layout.nodes.find((n) => n.id === 'c1')!

    expect(childNode.y).toBeGreaterThan(rootNode.y)
  })

  test('parent is centered over children', () => {
    const child1 = makeAstNode('c1', 'a')
    const child2 = makeAstNode('c2', 'b')
    const root = makeAstNode('r1', 'root', 'function', [child1, child2])

    const layout = computeTreeLayout([root])

    const rootNode = layout.nodes.find((n) => n.id === 'r1')!
    const c1Node = layout.nodes.find((n) => n.id === 'c1')!
    const c2Node = layout.nodes.find((n) => n.id === 'c2')!

    const childrenCenter = (c1Node.x + c2Node.x + c2Node.width) / 2
    const rootCenter = rootNode.x + rootNode.width / 2

    expect(Math.abs(rootCenter - childrenCenter)).toBeLessThan(1)
  })

  test('multiple roots are offset horizontally', () => {
    const root1 = makeAstNode('r1', 'first')
    const root2 = makeAstNode('r2', 'second')

    const layout = computeTreeLayout([root1, root2])

    expect(layout.nodes).toHaveLength(2)
    const n1 = layout.nodes.find((n) => n.id === 'r1')!
    const n2 = layout.nodes.find((n) => n.id === 'r2')!

    expect(n2.x).toBeGreaterThan(n1.x)
  })

  test('deep tree produces correct depth levels', () => {
    const grandchild = makeAstNode('gc', 'grandchild')
    const child = makeAstNode('c1', 'child', 'function', [grandchild])
    const root = makeAstNode('r1', 'root', 'class', [child])

    const layout = computeTreeLayout([root])

    expect(layout.nodes).toHaveLength(3)
    expect(layout.edges).toHaveLength(2)

    const rootY = layout.nodes.find((n) => n.id === 'r1')!.y
    const childY = layout.nodes.find((n) => n.id === 'c1')!.y
    const gcY = layout.nodes.find((n) => n.id === 'gc')!.y

    expect(childY).toBeGreaterThan(rootY)
    expect(gcY).toBeGreaterThan(childY)
  })

  test('nodes have startLine and endLine from AstNode', () => {
    const node: AstNode = {
      id: 'n1',
      type: 'function',
      name: 'test',
      startLine: 5,
      endLine: 20,
      children: [],
      filePath: '/test.ts',
    }
    const layout = computeTreeLayout([node])
    expect(layout.nodes[0].startLine).toBe(5)
    expect(layout.nodes[0].endLine).toBe(20)
  })
})
