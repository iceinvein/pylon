import { describe, expect, test } from 'bun:test'
import { normalizeCachedAnalysisRow, resolveAstExplainCwd } from '../ast-ipc-utils'

const graph = {
  files: [
    {
      filePath: '/repo/src/main.ts',
      language: 'typescript',
      declarations: [],
      imports: [],
      size: 10,
      lastModified: 1,
    },
  ],
  edges: [],
}

describe('AST IPC utilities', () => {
  test('ignores graph-only cache entries so provider analysis can rerun', () => {
    expect(
      normalizeCachedAnalysisRow({
        repo_graph: JSON.stringify(graph),
        arch_analysis: null,
        analyzed_at: 123,
      }),
    ).toBeNull()
  })

  test('returns completed cache entries with architecture analysis intact', () => {
    const archAnalysis = {
      layers: [],
      clusters: [],
      annotations: { 'src/main.ts': 'Entry point' },
      callEdges: [],
      dataFlows: [],
    }

    expect(
      normalizeCachedAnalysisRow({
        repo_graph: JSON.stringify(graph),
        arch_analysis: JSON.stringify(archAnalysis),
        analyzed_at: 456,
      }),
    ).toEqual({
      repoGraph: graph,
      archAnalysis,
      analyzedAt: 456,
    })
  })

  test('uses repo scope as cwd for explain queries when scope is available', () => {
    expect(resolveAstExplainCwd({ filePath: '/repo/src/main.ts', scope: '/repo' })).toBe('/repo')
  })

  test('falls back to the explained file directory when scope is unavailable', () => {
    expect(resolveAstExplainCwd({ filePath: '/repo/src/main.ts' })).toBe('/repo/src')
  })
})
