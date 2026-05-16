import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { IPC } from '../../shared/ipc-channels'

const handlers = new Map<string, (_event: unknown, args: unknown) => Promise<unknown>>()
const sentMessages: Array<{ channel: string; data: unknown }> = []

const webContents = {
  send: mock((channel: string, data: unknown) => {
    sentMessages.push({ channel, data })
  }),
}

mock.module('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
  },
  BrowserWindow: {
    getFocusedWindow: () => ({ webContents }),
  },
  ipcMain: {
    handle: mock((channel: string, handler: (_event: unknown, args: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    }),
  },
}))

mock.module('../ast-parsers/grammar-manager', () => ({
  setResourceDir: mock(() => {}),
}))

mock.module('../../shared/logger', () => ({
  log: {
    child: () => ({
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
      child: mock(() => ({})),
    }),
  },
}))

let cachedAnalysisRow:
  | { repo_graph: string; arch_analysis: string | null; analyzed_at: number }
  | undefined

mock.module('../db', () => ({
  getDb: () => ({
    prepare: () => ({
      run: mock(() => {}),
      get: mock(() => cachedAnalysisRow),
    }),
  }),
}))

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

mock.module('../ast-analyzer', () => ({
  analyzeScope: mock(() => Promise.resolve(graph)),
  parseFileAst: mock(() => []),
}))

let providerAvailable = false

mock.module('../providers/registry', () => ({
  getProviderForModel: mock(() =>
    providerAvailable
      ? {
          id: 'codex',
          createSession: mock(() => ({})),
        }
      : undefined,
  ),
}))

let providerTextQueryOptions: unknown = null

mock.module('../provider-text-query', () => ({
  runProviderTextQuery: mock((options: unknown) => {
    providerTextQueryOptions = options
    return Promise.resolve('provider text')
  }),
}))

let analysisResult: unknown = null

mock.module('../ast-ai', () => ({
  analyzeRepoWithAi: mock(() => Promise.resolve(analysisResult)),
  explainNode: mock(
    async (
      _filePath: string,
      _nodeName: string,
      _context: string,
      queryFn: (system: string, prompt: string) => Promise<string>,
    ) => {
      await queryFn('system', 'prompt')
      return 'explanation'
    },
  ),
  chatAboutCode: mock(() => Promise.resolve({ text: 'answer', highlights: [] })),
}))

const { registerAstIpcHandlers } = await import('../ast-ipc-handlers')

function progressMessages() {
  return sentMessages
    .filter((message) => message.channel === IPC.AST_ANALYSIS_PROGRESS)
    .map((message) => message.data as { status: string; message?: string })
}

describe('registerAstIpcHandlers AST analysis status', () => {
  beforeEach(() => {
    handlers.clear()
    sentMessages.length = 0
    webContents.send.mockClear()
    providerAvailable = false
    analysisResult = null
    providerTextQueryOptions = null
    cachedAnalysisRow = undefined
    registerAstIpcHandlers()
  })

  test('ignores graph-only cache entries so provider analysis can rerun', async () => {
    cachedAnalysisRow = {
      repo_graph: JSON.stringify(graph),
      arch_analysis: null,
      analyzed_at: 123,
    }
    const handler = handlers.get(IPC.AST_GET_CACHED)
    expect(handler).toBeDefined()

    await expect(handler?.(null, { scope: '/repo' })).resolves.toBeNull()
  })

  test('returns completed cache entries with architecture analysis intact', async () => {
    const archAnalysis = {
      layers: [],
      clusters: [],
      annotations: { 'src/main.ts': 'Entry point' },
      callEdges: [],
      dataFlows: [],
    }
    cachedAnalysisRow = {
      repo_graph: JSON.stringify(graph),
      arch_analysis: JSON.stringify(archAnalysis),
      analyzed_at: 456,
    }
    const handler = handlers.get(IPC.AST_GET_CACHED)
    expect(handler).toBeDefined()

    await expect(handler?.(null, { scope: '/repo' })).resolves.toEqual({
      repoGraph: graph,
      archAnalysis,
      analyzedAt: 456,
    })
  })

  test('reports error instead of ready when the AST model has no provider', async () => {
    const handler = handlers.get(IPC.AST_ANALYZE_SCOPE)
    expect(handler).toBeDefined()

    await handler?.(null, { scope: '/repo', agentModel: 'missing-model' })

    const progress = progressMessages()
    expect(progress.at(-1)).toEqual({
      status: 'error',
      message: 'No AI provider found for AST model "missing-model". Choose a supported AST model.',
    })
    expect(progress.some((message) => message.status === 'ready')).toBe(false)
  })

  test('reports error instead of ready when AI analysis cannot be parsed', async () => {
    providerAvailable = true
    analysisResult = null
    const handler = handlers.get(IPC.AST_ANALYZE_SCOPE)
    expect(handler).toBeDefined()

    await handler?.(null, { scope: '/repo', agentModel: 'gpt-5.5' })

    const progress = progressMessages()
    expect(progress.at(-1)).toEqual({
      status: 'error',
      message: 'AI architecture analysis failed. Try again or choose another AST model.',
    })
    expect(progress.some((message) => message.status === 'ready')).toBe(false)
  })

  test('uses repo scope as cwd for explain queries when scope is available', async () => {
    providerAvailable = true
    const handler = handlers.get(IPC.AST_EXPLAIN)
    expect(handler).toBeDefined()

    await handler?.(null, {
      nodeId: 'function-1',
      filePath: '/repo/src/main.ts',
      context: 'runApp',
      scope: '/repo',
      agentModel: 'gpt-5.5',
    })

    expect(providerTextQueryOptions).toMatchObject({ cwd: '/repo' })
  })

  test('returns honest chat shape when the AST model has no provider', async () => {
    const handler = handlers.get(IPC.AST_CHAT)
    expect(handler).toBeDefined()

    const result = await handler?.(null, {
      message: 'Where is startup?',
      scope: '/repo',
      agentModel: 'missing-model',
    })

    expect(result).toEqual({
      text: 'No provider found for model "missing-model". Choose another AST model in settings.',
      highlights: [],
      done: true,
    })
  })
})
