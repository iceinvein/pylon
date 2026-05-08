import { describe, expect, test } from 'bun:test'
import {
  countVisibleSearchMatches,
  findRepoFilePath,
  findVisibleGraphNode,
} from './ast-graph-resolve'

const files = [
  { filePath: '/workspace/app/src/ui/Button.tsx' },
  { filePath: '/workspace/app/src/store/session-store.ts' },
  { filePath: '/workspace/app/src/main/server.ts' },
]

describe('findRepoFilePath', () => {
  test('matches exact absolute file paths', () => {
    expect(findRepoFilePath('/workspace/app/src/ui/Button.tsx', files)).toBe(
      '/workspace/app/src/ui/Button.tsx',
    )
  })

  test('matches AI analysis paths emitted as src-relative paths', () => {
    expect(findRepoFilePath('src/store/session-store.ts', files)).toBe(
      '/workspace/app/src/store/session-store.ts',
    )
  })
})

describe('findVisibleGraphNode', () => {
  test('returns expanded file nodes when they are visible', () => {
    const nodes = [
      { id: '/workspace/app/src/ui/Button.tsx', filePath: '/workspace/app/src/ui/Button.tsx' },
    ]

    expect(findVisibleGraphNode('src/ui/Button.tsx', files, nodes)?.id).toBe(
      '/workspace/app/src/ui/Button.tsx',
    )
  })

  test('returns the collapsed directory node containing the file', () => {
    const nodes = [
      { id: '/workspace/app/src/ui', filePath: '/workspace/app/src/ui', isCluster: true },
      { id: '/workspace/app/src/store', filePath: '/workspace/app/src/store', isCluster: true },
    ]

    expect(findVisibleGraphNode('src/store/session-store.ts', files, nodes)?.id).toBe(
      '/workspace/app/src/store',
    )
  })
})

describe('countVisibleSearchMatches', () => {
  test('counts matches against visible collapsed directory nodes', () => {
    const nodes = [
      { id: '/workspace/app/src/ui', filePath: '/workspace/app/src/ui', isCluster: true },
      { id: '/workspace/app/src/store', filePath: '/workspace/app/src/store', isCluster: true },
    ]

    expect(
      countVisibleSearchMatches(
        ['/workspace/app/src/ui/Button.tsx', '/workspace/app/src/store/session-store.ts'],
        files,
        nodes,
      ),
    ).toEqual(
      new Map([
        ['/workspace/app/src/ui', 1],
        ['/workspace/app/src/store', 1],
      ]),
    )
  })

  test('counts multiple hidden file matches on one collapsed node', () => {
    const localFiles = [
      ...files,
      { filePath: '/workspace/app/src/ui/Input.tsx' },
      { filePath: '/workspace/app/src/ui/Menu.tsx' },
    ]
    const nodes = [
      { id: '/workspace/app/src/ui', filePath: '/workspace/app/src/ui', isCluster: true },
    ]

    expect(
      countVisibleSearchMatches(
        [
          '/workspace/app/src/ui/Button.tsx',
          '/workspace/app/src/ui/Input.tsx',
          '/workspace/app/src/ui/Menu.tsx',
        ],
        localFiles,
        nodes,
      ).get('/workspace/app/src/ui'),
    ).toBe(3)
  })
})
