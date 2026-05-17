import { describe, expect, test } from 'bun:test'
import type { ArchAnalysis, RepoGraph } from '../../shared/types'
import { analyzeRepoWithAi, chatAboutCode, explainNode, type QueryFn } from '../ast-ai'

const graph: RepoGraph = {
  files: [
    {
      filePath: '/repo/src/main.ts',
      language: 'typescript',
      declarations: [
        {
          id: 'function-1',
          type: 'function',
          name: 'runApp',
          startLine: 1,
          endLine: 3,
          children: [],
          filePath: '/repo/src/main.ts',
        },
      ],
      imports: [],
      size: 120,
      lastModified: 1,
    },
  ],
  edges: [],
}

describe('ast-ai provider-neutral prompts', () => {
  test('analyzeRepoWithAi parses JSON from provider text', async () => {
    const expected: ArchAnalysis = {
      layers: [{ id: 'app', name: 'App', color: '#3366ff', pattern: 'src/*.ts' }],
      clusters: [
        {
          id: 'entry',
          name: 'Entry',
          description: 'Application entry point',
          files: ['src/main.ts'],
          layerId: 'app',
        },
      ],
      annotations: { 'src/main.ts': 'Starts the app' },
      callEdges: [],
      dataFlows: [],
    }
    const queryFn: QueryFn = async () =>
      `Provider note:\n\n\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``

    await expect(analyzeRepoWithAi(graph, queryFn)).resolves.toEqual(expected)
  })

  test('analyzeRepoWithAi falls back to embedded JSON when a fenced block has prose', async () => {
    const expected: ArchAnalysis = {
      layers: [],
      clusters: [],
      annotations: { 'src/main.ts': 'Starts the app' },
      callEdges: [],
      dataFlows: [],
    }
    const queryFn: QueryFn = async () => `\`\`\`json
Here is the result:
${JSON.stringify(expected)}
\`\`\``

    await expect(analyzeRepoWithAi(graph, queryFn)).resolves.toEqual(expected)
  })

  test('analyzeRepoWithAi parses architecture JSON from a markdown response', async () => {
    const expected: ArchAnalysis = {
      layers: [{ id: 'main', name: 'Main', color: '#336699', pattern: 'electron' }],
      clusters: [
        {
          id: 'main-process',
          name: 'Main Process',
          description: 'Electron main process files',
          files: ['src/main/index.ts'],
          layerId: 'main',
        },
      ],
      annotations: { 'src/main/index.ts': 'Application bootstrap' },
      callEdges: [],
      dataFlows: [],
    }
    const queryFn: QueryFn = async () => `## Architecture Analysis

Here is the requested architecture JSON:

\`\`\`json
${JSON.stringify(expected)}
\`\`\``

    await expect(analyzeRepoWithAi(graph, queryFn)).resolves.toEqual(expected)
  })

  test('chatAboutCode strips highlights comment and parses highlights', async () => {
    const queryFn: QueryFn = async () =>
      'The entry point calls the runtime.\n<!-- highlights: [{"filePath":"src/main.ts","symbolName":"runApp"}] -->'

    await expect(chatAboutCode('Where does startup happen?', 'Files: 1', queryFn)).resolves.toEqual(
      {
        text: 'The entry point calls the runtime.',
        highlights: [{ filePath: 'src/main.ts', symbolName: 'runApp' }],
      },
    )
  })

  test('explainNode returns fallback explanation on query failure', async () => {
    const queryFn: QueryFn = async () => {
      throw new Error('provider unavailable')
    }

    const consoleError = console.error
    console.error = () => {}
    try {
      await expect(explainNode('/missing.ts', 'runApp', 'function runApp', queryFn)).resolves.toBe(
        'Unable to generate explanation at this time.',
      )
    } finally {
      console.error = consoleError
    }
  })
})
