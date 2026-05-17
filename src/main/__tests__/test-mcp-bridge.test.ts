import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createServer as createNetServer } from 'node:net'

mock.module('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/Applications/Pylon.app/Contents/Resources/app.asar',
  },
}))

const {
  TestingToolCallbackServer,
  buildTestingMcpServers,
  createTestingToolCallbackUrl,
  resolveTestingMcpStdioServerPath,
} = await import('../test-mcp-bridge')
const { forwardTestingToolCall } = await import('../test-mcp-stdio-server')

describe('testing MCP bridge', () => {
  let callbackServer: InstanceType<typeof TestingToolCallbackServer> | null = null

  beforeEach(() => {
    callbackServer = null
  })

  afterEach(async () => {
    await callbackServer?.stop()
    callbackServer = null
  })

  test('creates the local callback URL for tool dispatch', () => {
    expect(createTestingToolCallbackUrl(49152)).toBe('http://127.0.0.1:49152/tool')
  })

  test('builds provider-neutral Playwright and Pylon testing stdio MCP configs', () => {
    const servers = buildTestingMcpServers({
      callbackPort: 49152,
      callbackToken: 'secret-token',
      explorationId: 'exploration-1',
      cwd: '/repo',
      e2eOutputPath: 'e2e',
      stdioServerPath: '/app/out/main/test-mcp-stdio-server.js',
      command: '/usr/local/bin/node',
    })

    expect(servers.playwright).toEqual({
      command: 'bunx',
      args: ['@playwright/mcp@latest', '--headless'],
    })
    expect(servers['pylon-testing']).toMatchObject({
      command: '/usr/local/bin/node',
      args: ['/app/out/main/test-mcp-stdio-server.js'],
      env: {
        PYLON_TESTING_TOOL_CALLBACK_URL: 'http://127.0.0.1:49152/tool',
        PYLON_TESTING_TOOL_CALLBACK_TOKEN: 'secret-token',
        PYLON_TESTING_EXPLORATION_ID: 'exploration-1',
        PYLON_TESTING_CWD: '/repo',
        PYLON_TESTING_E2E_OUTPUT_PATH: 'e2e',
      },
    })
  })

  test('resolves the stdio server next to the dev main bundle', () => {
    expect(resolveTestingMcpStdioServerPath({ dirname: '/repo/out/main' })).toBe(
      '/repo/out/main/test-mcp-stdio-server.js',
    )
  })

  test('resolves the stdio server inside the packaged app bundle', () => {
    expect(
      resolveTestingMcpStdioServerPath({
        isPackaged: true,
        appPath: '/Applications/Pylon.app/Contents/Resources/app.asar',
      }),
    ).toBe('/Applications/Pylon.app/Contents/Resources/app.asar/out/main/test-mcp-stdio-server.js')
  })

  test('callback server rejects unauthenticated tool calls', async () => {
    callbackServer = new TestingToolCallbackServer()
    const { port } = await callbackServer.start()
    callbackServer.registerExploration({
      callbackToken: 'secret-token',
      explorationId: 'exploration-1',
      cwd: '/repo',
      e2eOutputPath: 'e2e',
      window: null,
    })

    const response = await fetch(createTestingToolCallbackUrl(port), {
      method: 'POST',
      body: JSON.stringify({ toolName: 'report_goals', args: { goals: [] } }),
    })

    expect(response.status).toBe(401)
  })

  test('callback server shares one listener across concurrent starts', async () => {
    const handlesBefore = new Set(getActiveServerHandles())
    callbackServer = new TestingToolCallbackServer()
    const port = await findFreePort()

    const results = await Promise.allSettled([
      callbackServer.start(port),
      callbackServer.start(port),
    ])
    await callbackServer.stop().catch(() => {})
    callbackServer = null

    const leakedHandles = getActiveServerHandles().filter((handle) => !handlesBefore.has(handle))
    await Promise.all(leakedHandles.map(closeServerHandle))

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    const [first, second] = results.map((result) =>
      result.status === 'fulfilled' ? result.value : null,
    )
    expect(first).toEqual({ port, callbackUrl: createTestingToolCallbackUrl(port) })
    expect(second).toEqual(first)
    expect(leakedHandles).toHaveLength(0)
  })

  test('callback server dispatches authorized tool calls to registered test tools', async () => {
    const sent: Array<{ channel: string; data: unknown }> = []
    callbackServer = new TestingToolCallbackServer()
    const { port } = await callbackServer.start()
    callbackServer.registerExploration({
      callbackToken: 'secret-token',
      explorationId: 'exploration-1',
      cwd: '/repo',
      e2eOutputPath: 'e2e',
      window: { webContents: { send: (channel, data) => sent.push({ channel, data }) } } as never,
    })

    const response = await fetch(createTestingToolCallbackUrl(port), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toolName: 'report_goals',
        args: {
          goals: [{ id: 'login', title: 'Login', description: 'Check login' }],
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      content: [{ type: 'text', text: 'Reported 1 testing goals' }],
    })
    expect(sent).toHaveLength(1)
  })

  test('callback server notifies registered hook after authorized tool execution', async () => {
    const hookCalls: Array<{ toolName: string; args: Record<string, unknown> }> = []
    callbackServer = new TestingToolCallbackServer()
    const { port } = await callbackServer.start()
    callbackServer.registerExploration({
      callbackToken: 'secret-token',
      explorationId: 'exploration-1',
      cwd: '/repo',
      e2eOutputPath: 'e2e',
      window: null,
      onToolExecute: (toolName, args) => {
        hookCalls.push({ toolName, args })
      },
    })

    const response = await fetch(createTestingToolCallbackUrl(port), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toolName: 'report_goals',
        args: {
          goals: [{ id: 'login', title: 'Login', description: 'Check login' }],
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(hookCalls).toEqual([
      {
        toolName: 'report_goals',
        args: {
          goals: [{ id: 'login', title: 'Login', description: 'Check login' }],
        },
      },
    ])
  })

  test('stdio server tool forwarder posts tool calls to the parent callback URL', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const result = await forwardTestingToolCall(
        'report_goals',
        { goals: [] },
        {
          callbackUrl: 'http://127.0.0.1:49152/tool',
          callbackToken: 'secret-token',
        },
      )

      expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] })
      expect(fetchCalls).toHaveLength(1)
      expect(fetchCalls[0].url).toBe('http://127.0.0.1:49152/tool')
      expect(fetchCalls[0].init.method).toBe('POST')
      expect(fetchCalls[0].init.headers).toEqual({
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
      })
      expect(JSON.parse(fetchCalls[0].init.body as string)).toEqual({
        toolName: 'report_goals',
        args: { goals: [] },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

type CloseableServerHandle = {
  close: (callback?: (err?: Error) => void) => void
  constructor?: { name?: string }
}

function getActiveServerHandles(): CloseableServerHandle[] {
  const processWithHandles = process as typeof process & {
    _getActiveHandles?: () => unknown[]
  }
  return (processWithHandles._getActiveHandles?.() ?? []).filter(
    (handle): handle is CloseableServerHandle =>
      Boolean(
        handle &&
          typeof handle === 'object' &&
          'close' in handle &&
          typeof handle.close === 'function' &&
          handle.constructor?.name === 'Server',
      ),
  )
}

async function closeServerHandle(handle: CloseableServerHandle): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      handle.close(() => resolve())
    } catch {
      resolve()
    }
  })
}

async function findFreePort(): Promise<number> {
  const server = createNetServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate a local test port')
  }
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  return address.port
}
