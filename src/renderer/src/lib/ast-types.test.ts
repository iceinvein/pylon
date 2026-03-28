import { test, expect } from 'bun:test'
import type {
  AstNode,
  AstNodeType,
  FileNode,
  ImportEdge,
  RepoGraph,
  ArchLayer,
  ModuleCluster,
  CallEdge,
  DataFlow,
  ArchAnalysis,
  AstOverlay,
  AstChatMessage,
} from '../../../shared/types'

// ── AstNodeType ──

test('AstNodeType accepts all valid literal values', () => {
  const values: AstNodeType[] = [
    'function',
    'class',
    'type',
    'variable',
    'import',
    'export',
    'block',
    'statement',
    'expression',
    'parameter',
    'other',
  ]
  expect(values.length).toBe(11)
})

// ── AstNode ──

test('AstNode has expected shape', () => {
  const node: AstNode = {
    id: 'node-1',
    type: 'function',
    name: 'myFunction',
    startLine: 1,
    endLine: 10,
    children: [],
    filePath: '/src/foo.ts',
  }
  expect(node.id).toBe('node-1')
  expect(node.type).toBe('function')
  expect(node.name).toBe('myFunction')
  expect(node.startLine).toBe(1)
  expect(node.endLine).toBe(10)
  expect(node.children).toEqual([])
  expect(node.filePath).toBe('/src/foo.ts')
})

test('AstNode children can be nested', () => {
  const child: AstNode = {
    id: 'child-1',
    type: 'parameter',
    name: 'x',
    startLine: 2,
    endLine: 2,
    children: [],
    filePath: '/src/foo.ts',
  }
  const parent: AstNode = {
    id: 'parent-1',
    type: 'function',
    name: 'outer',
    startLine: 1,
    endLine: 5,
    children: [child],
    filePath: '/src/foo.ts',
  }
  expect(parent.children[0].id).toBe('child-1')
})

// ── ImportEdge ──

test('ImportEdge has expected shape', () => {
  const edge: ImportEdge = {
    source: '/src/a.ts',
    target: '/src/b.ts',
    specifiers: ['foo', 'bar'],
  }
  expect(edge.source).toBe('/src/a.ts')
  expect(edge.target).toBe('/src/b.ts')
  expect(edge.specifiers).toEqual(['foo', 'bar'])
})

// ── FileNode ──

test('FileNode has expected shape', () => {
  const fileNode: FileNode = {
    filePath: '/src/foo.ts',
    language: 'typescript',
    declarations: [],
    imports: [],
    size: 1024,
    lastModified: 1700000000,
  }
  expect(fileNode.filePath).toBe('/src/foo.ts')
  expect(fileNode.language).toBe('typescript')
  expect(fileNode.declarations).toEqual([])
  expect(fileNode.imports).toEqual([])
  expect(fileNode.size).toBe(1024)
  expect(fileNode.lastModified).toBe(1700000000)
})

// ── RepoGraph ──

test('RepoGraph has files and edges arrays', () => {
  const graph: RepoGraph = {
    files: [],
    edges: [],
  }
  expect(Array.isArray(graph.files)).toBe(true)
  expect(Array.isArray(graph.edges)).toBe(true)
})

// ── ArchLayer ──

test('ArchLayer has expected shape', () => {
  const layer: ArchLayer = {
    id: 'layer-ui',
    name: 'UI',
    color: '#4af',
    pattern: 'src/renderer/**',
  }
  expect(layer.id).toBe('layer-ui')
  expect(layer.name).toBe('UI')
  expect(layer.color).toBe('#4af')
  expect(layer.pattern).toBe('src/renderer/**')
})

// ── ModuleCluster ──

test('ModuleCluster has expected shape', () => {
  const cluster: ModuleCluster = {
    id: 'cluster-1',
    name: 'Auth',
    description: 'Authentication modules',
    files: ['/src/auth/login.ts', '/src/auth/logout.ts'],
    layerId: 'layer-ui',
  }
  expect(cluster.id).toBe('cluster-1')
  expect(cluster.files).toHaveLength(2)
  expect(cluster.layerId).toBe('layer-ui')
})

// ── CallEdge ──

test('CallEdge has caller and callee with filePath and symbolName', () => {
  const edge: CallEdge = {
    caller: { filePath: '/src/a.ts', symbolName: 'doStuff' },
    callee: { filePath: '/src/b.ts', symbolName: 'helper' },
  }
  expect(edge.caller.symbolName).toBe('doStuff')
  expect(edge.callee.symbolName).toBe('helper')
})

// ── DataFlow ──

test('DataFlow has expected shape with steps', () => {
  const flow: DataFlow = {
    id: 'flow-1',
    name: 'User Registration',
    description: 'Handles user signup',
    steps: [
      { filePath: '/src/form.ts', symbolName: 'submitForm', direction: 'in' },
      { filePath: '/src/api.ts', symbolName: 'createUser', direction: 'transform' },
      { filePath: '/src/db.ts', symbolName: 'insertUser', direction: 'out' },
    ],
  }
  expect(flow.steps).toHaveLength(3)
  expect(flow.steps[0].direction).toBe('in')
  expect(flow.steps[1].direction).toBe('transform')
  expect(flow.steps[2].direction).toBe('out')
})

// ── ArchAnalysis ──

test('ArchAnalysis has all required fields', () => {
  const analysis: ArchAnalysis = {
    layers: [],
    clusters: [],
    annotations: {},
    callEdges: [],
    dataFlows: [],
  }
  expect(Array.isArray(analysis.layers)).toBe(true)
  expect(Array.isArray(analysis.clusters)).toBe(true)
  expect(typeof analysis.annotations).toBe('object')
  expect(Array.isArray(analysis.callEdges)).toBe(true)
  expect(Array.isArray(analysis.dataFlows)).toBe(true)
})

test('ArchAnalysis annotations is a string record', () => {
  const analysis: ArchAnalysis = {
    layers: [],
    clusters: [],
    annotations: { '/src/main.ts': 'Entry point', '/src/db.ts': 'Database layer' },
    callEdges: [],
    dataFlows: [],
  }
  expect(analysis.annotations['/src/main.ts']).toBe('Entry point')
})

// ── AstOverlay ──

test('AstOverlay accepts all valid values', () => {
  const overlays: AstOverlay[] = ['deps', 'calls', 'dataflow']
  expect(overlays).toHaveLength(3)
})

// ── AstChatMessage ──

test('AstChatMessage with user role and no highlights', () => {
  const msg: AstChatMessage = {
    role: 'user',
    content: 'Explain the auth module',
  }
  expect(msg.role).toBe('user')
  expect(msg.content).toBe('Explain the auth module')
  expect(msg.highlights).toBeUndefined()
})

test('AstChatMessage with assistant role and highlights', () => {
  const msg: AstChatMessage = {
    role: 'assistant',
    content: 'The auth module handles login and logout.',
    highlights: [
      { filePath: '/src/auth/login.ts', symbolName: 'login' },
      { filePath: '/src/auth/logout.ts', symbolName: 'logout' },
    ],
  }
  expect(msg.role).toBe('assistant')
  expect(msg.highlights).toHaveLength(2)
  expect(msg.highlights?.[0].symbolName).toBe('login')
})
