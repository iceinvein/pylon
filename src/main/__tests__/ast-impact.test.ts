import { describe, expect, test } from 'bun:test'
import type { AstNode, ImpactIndex, RepoGraph } from '../../shared/types'
import {
  buildImpactIndex,
  computeSnapshotHash,
  getImpactSummary,
  searchImpactEntities,
} from '../ast-impact'

function node(filePath: string, id: string, name: string): AstNode {
  return {
    id,
    type: 'function',
    name,
    startLine: 1,
    endLine: 3,
    children: [],
    filePath,
  }
}

function graph(): RepoGraph {
  const root = '/repo'
  const api = `${root}/src/api.ts`
  const service = `${root}/src/service.ts`
  const db = `${root}/src/db.ts`
  const testFile = `${root}/src/service.test.ts`
  return {
    files: [
      {
        filePath: api,
        language: 'typescript',
        declarations: [node(api, 'function-1', 'handleRequest')],
        imports: [],
        size: 100,
        lastModified: 10,
      },
      {
        filePath: service,
        language: 'typescript',
        declarations: [node(service, 'function-1', 'loadUser')],
        imports: [],
        size: 120,
        lastModified: 20,
      },
      {
        filePath: db,
        language: 'typescript',
        declarations: [node(db, 'function-1', 'queryUser')],
        imports: [],
        size: 90,
        lastModified: 30,
      },
      {
        filePath: testFile,
        language: 'typescript',
        declarations: [node(testFile, 'function-1', 'testLoadUser')],
        imports: [],
        size: 80,
        lastModified: 40,
      },
    ],
    edges: [
      { source: api, target: service, specifiers: ['loadUser'] },
      { source: service, target: db, specifiers: ['queryUser'] },
      { source: testFile, target: service, specifiers: ['loadUser'] },
    ],
  }
}

function symbolFilterGraph(): RepoGraph {
  const root = '/repo'
  const api = `${root}/src/api.ts`
  const orders = `${root}/src/orders.ts`
  const service = `${root}/src/service.ts`

  return {
    files: [
      {
        filePath: api,
        language: 'typescript',
        declarations: [node(api, 'function-1', 'handleRequest')],
        imports: [],
        size: 100,
        lastModified: 10,
      },
      {
        filePath: orders,
        language: 'typescript',
        declarations: [node(orders, 'function-1', 'handleOrder')],
        imports: [],
        size: 100,
        lastModified: 20,
      },
      {
        filePath: service,
        language: 'typescript',
        declarations: [
          node(service, 'function-1', 'loadUser'),
          node(service, 'function-2', 'saveOrder'),
        ],
        imports: [],
        size: 120,
        lastModified: 30,
      },
    ],
    edges: [
      { source: api, target: service, specifiers: ['loadUser'] },
      { source: orders, target: service, specifiers: ['saveOrder'] },
    ],
  }
}

function selectedLoadUser() {
  return {
    kind: 'symbol' as const,
    filePath: '/repo/src/service.ts',
    symbolId: 'function-1',
    symbolName: 'loadUser',
    symbolType: 'function' as const,
    startLine: 1,
    endLine: 3,
  }
}

describe('ast-impact', () => {
  test('builds file and symbol entities', () => {
    const index = buildImpactIndex(graph())
    expect(index.entities).toContainEqual({ kind: 'file', filePath: '/repo/src/service.ts' })
    expect(index.entities).toContainEqual({
      kind: 'symbol',
      filePath: '/repo/src/service.ts',
      symbolId: 'function-1',
      symbolName: 'loadUser',
      symbolType: 'function',
      startLine: 1,
      endLine: 3,
    })
  })

  test('builds dependencies and reverse importers', () => {
    const index = buildImpactIndex(graph())
    expect(index.dependenciesByFile['/repo/src/service.ts']).toEqual(['/repo/src/db.ts'])
    expect(index.importersByFile['/repo/src/service.ts']).toEqual([
      '/repo/src/api.ts',
      '/repo/src/service.test.ts',
    ])
  })

  test('detects likely tests for selected file', () => {
    const index = buildImpactIndex(graph())
    expect(index.likelyTestsByFile['/repo/src/service.ts']).toEqual(['/repo/src/service.test.ts'])
  })

  test('returns impact summary for symbol using file-level deterministic impact', () => {
    const index = buildImpactIndex(graph())
    const summary = getImpactSummary(index, {
      kind: 'symbol',
      filePath: '/repo/src/service.ts',
      symbolId: 'function-1',
      symbolName: 'loadUser',
      symbolType: 'function',
      startLine: 1,
      endLine: 3,
    })
    expect(summary.dependencies.map((edge) => edge.target)).toEqual([
      { kind: 'file', filePath: '/repo/src/db.ts' },
    ])
    expect(summary.importers.map((edge) => edge.source)).toEqual([
      { kind: 'file', filePath: '/repo/src/api.ts' },
      { kind: 'file', filePath: '/repo/src/service.test.ts' },
    ])
    expect(summary.likelyTests).toEqual([{ kind: 'file', filePath: '/repo/src/service.test.ts' }])
    expect(summary.paths).toContainEqual({
      id: 'dependency:symbol:/repo/src/service.ts:function-1:loadUser:1:3:/repo/src/db.ts',
      label: '/repo/src/service.ts imports /repo/src/db.ts',
      entities: [
        {
          kind: 'symbol',
          filePath: '/repo/src/service.ts',
          symbolId: 'function-1',
          symbolName: 'loadUser',
          symbolType: 'function',
          startLine: 1,
          endLine: 3,
        },
        { kind: 'file', filePath: '/repo/src/db.ts' },
      ],
      confidence: 'high',
    })
    expect(summary.paths).toContainEqual({
      id: 'importer:/repo/src/api.ts:symbol:/repo/src/service.ts:function-1:loadUser:1:3',
      label: '/repo/src/api.ts imports /repo/src/service.ts',
      entities: [
        { kind: 'file', filePath: '/repo/src/api.ts' },
        {
          kind: 'symbol',
          filePath: '/repo/src/service.ts',
          symbolId: 'function-1',
          symbolName: 'loadUser',
          symbolType: 'function',
          startLine: 1,
          endLine: 3,
        },
      ],
      confidence: 'high',
    })
    expect(summary.stale).toBe(false)
  })

  test('filters symbol importers by explicit import specifiers', () => {
    const index = buildImpactIndex(symbolFilterGraph())
    const summary = getImpactSummary(index, selectedLoadUser())
    expect(summary.importers.map((edge) => edge.source)).toEqual([
      { kind: 'file', filePath: '/repo/src/api.ts' },
    ])

    const fileSummary = getImpactSummary(index, { kind: 'file', filePath: '/repo/src/service.ts' })
    expect(fileSummary.importers.map((edge) => edge.source)).toEqual([
      { kind: 'file', filePath: '/repo/src/api.ts' },
      { kind: 'file', filePath: '/repo/src/orders.ts' },
    ])
  })

  test('excludes empty-specifier edges from high-confidence symbol importers', () => {
    const selectedGraph = symbolFilterGraph()
    selectedGraph.edges.push({
      source: '/repo/src/unknown.ts',
      target: '/repo/src/service.ts',
      specifiers: [],
    })
    selectedGraph.files.push({
      filePath: '/repo/src/unknown.ts',
      language: 'typescript',
      declarations: [node('/repo/src/unknown.ts', 'function-1', 'handleUnknown')],
      imports: [],
      size: 100,
      lastModified: 40,
    })

    const summary = getImpactSummary(buildImpactIndex(selectedGraph), selectedLoadUser())
    expect(summary.importers.map((edge) => edge.source)).toEqual([
      { kind: 'file', filePath: '/repo/src/api.ts' },
    ])
  })

  test('does not infer symbol importers without import-edge metadata', () => {
    const index = buildImpactIndex(symbolFilterGraph())
    const plainIndex: ImpactIndex = {
      generatedAt: index.generatedAt,
      snapshotHash: index.snapshotHash,
      entities: index.entities,
      dependenciesByFile: index.dependenciesByFile,
      importersByFile: index.importersByFile,
      likelyTestsByFile: index.likelyTestsByFile,
    }

    const summary = getImpactSummary(plainIndex, selectedLoadUser())
    expect(summary.importers).toEqual([])
    expect(summary.notes).toContain('Symbol importers unavailable without import-edge metadata.')

    const fileSummary = getImpactSummary(plainIndex, { kind: 'file', filePath: '/repo/src/service.ts' })
    expect(fileSummary.importers.map((edge) => edge.source)).toEqual([
      { kind: 'file', filePath: '/repo/src/api.ts' },
      { kind: 'file', filePath: '/repo/src/orders.ts' },
    ])
  })

  test('searches files and symbols case-insensitively', () => {
    const index = buildImpactIndex(graph())
    expect(searchImpactEntities(index, 'load')).toEqual([
      {
        kind: 'symbol',
        filePath: '/repo/src/service.ts',
        symbolId: 'function-1',
        symbolName: 'loadUser',
        symbolType: 'function',
        startLine: 1,
        endLine: 3,
      },
    ])
    expect(searchImpactEntities(index, 'service')).toContainEqual({
      kind: 'file',
      filePath: '/repo/src/service.ts',
    })
    expect(searchImpactEntities(index, 'user')).toContainEqual({
      kind: 'symbol',
      filePath: '/repo/src/service.ts',
      symbolId: 'function-1',
      symbolName: 'loadUser',
      symbolType: 'function',
      startLine: 1,
      endLine: 3,
    })
    expect(searchImpactEntities(index, 'service', -1)).toEqual([])
  })

  test('computes stable snapshot hash from paths and mtimes', () => {
    const first = computeSnapshotHash(graph())
    const second = computeSnapshotHash(graph())
    const changed = graph()
    changed.files[0].lastModified = 999
    expect(first).toBe(second)
    expect(first).not.toBe(computeSnapshotHash(changed))
  })
})
