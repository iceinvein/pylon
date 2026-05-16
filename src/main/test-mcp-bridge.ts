import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import {
  createReportFindingTool,
  createReportGoalsTool,
  createSavePlaywrightTestTool,
} from './test-tools'

const STDIO_SERVER_FILENAME = 'test-mcp-stdio-server.js'

export type McpStdioConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type TestingMcpServers = {
  playwright: McpStdioConfig
  'pylon-testing': McpStdioConfig
}

export type BuildTestingMcpServersInput = {
  callbackPort: number
  callbackToken: string
  explorationId: string
  cwd: string
  e2eOutputPath: string
  stdioServerPath?: string
  command?: string
}

export type ResolveTestingMcpStdioServerPathOptions = {
  dirname?: string
  isPackaged?: boolean
  appPath?: string
}

type RegisteredExploration = {
  callbackToken: string
  explorationId: string
  cwd: string
  e2eOutputPath: string
  window: BrowserWindow | null
}

type ToolCallRequest = {
  toolName?: unknown
  args?: unknown
}

export function createTestingToolCallbackUrl(port: number): string {
  return `http://127.0.0.1:${port}/tool`
}

export function resolveTestingMcpStdioServerPath(
  options: ResolveTestingMcpStdioServerPathOptions = {},
): string {
  if (process.env.PYLON_TESTING_MCP_STDIO_SERVER_PATH) {
    return process.env.PYLON_TESTING_MCP_STDIO_SERVER_PATH
  }

  const isPackaged = options.isPackaged ?? app.isPackaged
  if (isPackaged) {
    return join(options.appPath ?? app.getAppPath(), 'out/main', STDIO_SERVER_FILENAME)
  }

  return join(options.dirname ?? __dirname, STDIO_SERVER_FILENAME)
}

export function buildTestingMcpServers(input: BuildTestingMcpServersInput): TestingMcpServers {
  const stdioServerPath = input.stdioServerPath ?? resolveTestingMcpStdioServerPath()

  return {
    playwright: {
      command: 'bunx',
      args: ['@playwright/mcp@latest', '--headless'],
    },
    'pylon-testing': {
      command: input.command ?? process.execPath,
      args: [stdioServerPath],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        PYLON_TESTING_TOOL_CALLBACK_URL: createTestingToolCallbackUrl(input.callbackPort),
        PYLON_TESTING_TOOL_CALLBACK_TOKEN: input.callbackToken,
        PYLON_TESTING_EXPLORATION_ID: input.explorationId,
        PYLON_TESTING_CWD: input.cwd,
        PYLON_TESTING_E2E_OUTPUT_PATH: input.e2eOutputPath,
      },
    },
  }
}

export class TestingToolCallbackServer {
  private server: Server | null = null
  private port: number | null = null
  private readonly explorationsByToken = new Map<string, RegisteredExploration>()

  async start(port = 0): Promise<{ port: number; callbackUrl: string }> {
    if (this.server && this.port !== null) {
      return { port: this.port, callbackUrl: createTestingToolCallbackUrl(this.port) }
    }

    this.server = createServer((request, response) => {
      this.handleRequest(request, response).catch((err) => {
        this.writeJson(response, 500, {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(port, '127.0.0.1', () => {
        this.server?.off('error', reject)
        resolve()
      })
    })

    const address = this.server.address() as AddressInfo
    this.port = address.port
    return { port: this.port, callbackUrl: createTestingToolCallbackUrl(this.port) }
  }

  registerExploration(exploration: RegisteredExploration): void {
    this.explorationsByToken.set(exploration.callbackToken, exploration)
  }

  unregisterExploration(callbackToken: string): void {
    this.explorationsByToken.delete(callbackToken)
  }

  async stop(): Promise<void> {
    this.explorationsByToken.clear()

    if (!this.server) {
      this.port = null
      return
    }

    const server = this.server
    this.server = null
    this.port = null

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/tool') {
      this.writeJson(response, 404, { error: 'Not found' })
      return
    }

    const token = readBearerToken(request.headers.authorization)
    const exploration = token ? this.explorationsByToken.get(token) : undefined
    if (!exploration) {
      this.writeJson(response, 401, { error: 'Unauthorized' })
      return
    }

    const body = (await readJsonBody(request)) as ToolCallRequest
    if (!body || typeof body.toolName !== 'string') {
      this.writeJson(response, 400, { error: 'toolName is required' })
      return
    }

    const args =
      body.args && typeof body.args === 'object' && !Array.isArray(body.args)
        ? (body.args as Record<string, unknown>)
        : {}
    const tool = this.createToolMap(exploration).get(body.toolName)
    if (!tool) {
      this.writeJson(response, 404, { error: `Unknown testing tool: ${body.toolName}` })
      return
    }

    const result = await tool.execute(args)
    this.writeJson(response, 200, result)
  }

  private createToolMap(exploration: RegisteredExploration) {
    const tools = [
      createReportFindingTool({
        explorationId: exploration.explorationId,
        cwd: exploration.cwd,
        e2eOutputPath: exploration.e2eOutputPath,
        window: exploration.window,
      }),
      createSavePlaywrightTestTool({
        explorationId: exploration.explorationId,
        cwd: exploration.cwd,
        e2eOutputPath: exploration.e2eOutputPath,
        window: exploration.window,
      }),
      createReportGoalsTool({
        cwd: exploration.cwd,
        window: exploration.window,
      }),
    ]

    return new Map(tools.map((tool) => [tool.name, tool]))
  }

  private writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
    if (response.headersSent) return
    response.writeHead(statusCode, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(value))
  }
}

export const testingToolCallbackServer = new TestingToolCallbackServer()

function readBearerToken(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}

  return JSON.parse(raw)
}
