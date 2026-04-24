import { describe, expect, test } from 'bun:test'
import type { McpClientLike } from '../mcp-context-backend'
import { McpContextBackend } from '../mcp-context-backend'

function mockClient(map: Record<string, unknown>): McpClientLike {
  return {
    async connect() {},
    async close() {},
    async callTool(name: string) {
      if (name in map) return map[name]
      return []
    },
  }
}

const SAMPLE_DIFF = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index 0..1 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,3 +1,4 @@',
  ' export function untouched() {}',
  '-export function changed(x: number): number {',
  '-  return x + 1',
  '+export function changed(x: number): number {',
  '+  return x * 2',
  ' }',
  '',
].join('\n')

describe('McpContextBackend', () => {
  test('detectAvailability returns true when MCP client connects', async () => {
    const backend = new McpContextBackend({
      makeClient: () => mockClient({}),
    })
    expect(await backend.detectAvailability()).toBe(true)
  })

  test('detectAvailability returns false when connect throws', async () => {
    const backend = new McpContextBackend({
      makeClient: () => ({
        async connect() {
          throw new Error('no server')
        },
        async close() {},
        async callTool() {
          return null
        },
      }),
    })
    expect(await backend.detectAvailability()).toBe(false)
  })

  test('build hydrates changed symbols with references and tests', async () => {
    const backend = new McpContextBackend({
      makeClient: () =>
        mockClient({
          get_file_symbols: [
            { name: 'changed', kind: 'function', range: { start: 2, end: 4 } },
            { name: 'untouched', kind: 'function', range: { start: 1, end: 1 } },
          ],
          get_definition: 'export function changed(x: number): number {\n  return x * 2\n}',
          find_references: {
            references: [{ file: 'src/bar.ts', line: 5, snippet: 'changed(3)' }],
            total: 1,
            truncated: false,
          },
          find_tests_for_symbol: [{ file: 'src/foo.test.ts', name: 'changed works' }],
          get_module_summary: 'foo module',
        }),
    })

    const bundle = await backend.build({
      diff: SAMPLE_DIFF,
      worktreePath: '/tmp/unused',
      pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
      signal: new AbortController().signal,
      perCallTimeoutMs: 1000,
    })

    expect(bundle.mode).toBe('mcp')
    expect(bundle.files).toHaveLength(1)
    const file = bundle.files[0]
    expect(file.moduleSummary).toBe('foo module')
    const sym = file.symbols.find((s) => s.name === 'changed')
    expect(sym).toBeDefined()
    expect(sym?.references).toHaveLength(1)
    expect(sym?.referencesTotal).toBe(1)
    expect(sym?.tests).toHaveLength(1)
    expect(file.symbols.find((s) => s.name === 'untouched')).toBeUndefined()
  })

  test('records error on per-symbol tool timeout and continues', async () => {
    const backend = new McpContextBackend({
      makeClient: () => ({
        async connect() {},
        async close() {},
        async callTool(name: string) {
          if (name === 'get_file_symbols') {
            return [{ name: 'changed', kind: 'function', range: { start: 2, end: 4 } }]
          }
          if (name === 'find_references') {
            const err = new Error('MCP tool find_references timed out') as Error & {
              timedOut: true
            }
            err.timedOut = true
            throw err
          }
          return []
        },
      }),
    })
    const bundle = await backend.build({
      diff: SAMPLE_DIFF,
      worktreePath: '/tmp/unused',
      pr: { number: 1, headBranch: 'f', baseBranch: 'm', title: 't' },
      signal: new AbortController().signal,
      perCallTimeoutMs: 1000,
    })
    const sym = bundle.files[0].symbols.find((s) => s.name === 'changed')
    expect(sym?.error).toContain('timed out')
    expect(sym?.references).toEqual([])
  })
})
