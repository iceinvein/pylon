import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createTestingToolCallbackUrl } from './test-mcp-config'
import { createTestingToolMap, type RegisteredTestingExploration } from './test-tool-dispatcher'

type ToolCallRequest = {
  toolName?: unknown
  args?: unknown
}

export class TestingToolCallbackServer {
  private server: Server | null = null
  private port: number | null = null
  private startPromise: Promise<{ port: number; callbackUrl: string }> | null = null
  private readonly explorationsByToken = new Map<string, RegisteredTestingExploration>()

  async start(port = 0): Promise<{ port: number; callbackUrl: string }> {
    if (this.server && this.port !== null) {
      return { port: this.port, callbackUrl: createTestingToolCallbackUrl(this.port) }
    }
    if (this.startPromise) return this.startPromise

    const server = createServer((request, response) => {
      this.handleRequest(request, response).catch((err) => {
        this.writeJson(response, 500, {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    })
    this.server = server

    this.startPromise = new Promise<{ port: number; callbackUrl: string }>((resolve, reject) => {
      const rejectStart = (err: Error) => {
        server.off('error', rejectStart)
        if (this.server === server) {
          this.server = null
          this.port = null
        }
        this.startPromise = null
        reject(err)
      }

      server.once('error', rejectStart)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', rejectStart)
        const address = server.address()
        if (!address || typeof address === 'string') {
          rejectStart(new Error('Testing tool callback server did not bind to a TCP port'))
          return
        }

        this.server = server
        this.port = address.port
        this.startPromise = null
        resolve({ port: this.port, callbackUrl: createTestingToolCallbackUrl(this.port) })
      })
    })

    return this.startPromise
  }

  registerExploration(exploration: RegisteredTestingExploration): void {
    this.explorationsByToken.set(exploration.callbackToken, exploration)
  }

  unregisterExploration(callbackToken: string): void {
    this.explorationsByToken.delete(callbackToken)
  }

  async stop(): Promise<void> {
    this.explorationsByToken.clear()
    this.startPromise = null

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
    const tool = createTestingToolMap(exploration).get(body.toolName)
    if (!tool) {
      this.writeJson(response, 404, { error: `Unknown testing tool: ${body.toolName}` })
      return
    }

    const result = await tool.execute(args)
    exploration.onToolExecute?.(body.toolName, args)
    this.writeJson(response, 200, result)
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
