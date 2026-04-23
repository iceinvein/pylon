import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { log } from '../../shared/logger'

const logger = log.child('mcp-client')

export type McpStdioConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export class CodeIntelligenceMcpClient {
  private client: Client | null = null
  private transport: StdioClientTransport | null = null
  private connected = false

  constructor(private readonly config: McpStdioConfig) {}

  async connect(timeoutMs: number = 5000): Promise<void> {
    if (this.connected) return

    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      env: this.config.env,
    })

    const client = new Client({ name: 'pylon-pr-context', version: '1.0.0' }, { capabilities: {} })

    const connectPromise = (async () => {
      await transport.start()
      await client.connect(transport)
    })()

    await withTimeout(connectPromise, timeoutMs, 'MCP connect timed out')

    this.transport = transport
    this.client = client
    this.connected = true
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number = 5000,
  ): Promise<unknown> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected')
    }

    const invocation = this.client.callTool({ name, arguments: args })
    const result = await withTimeout(invocation, timeoutMs, `MCP tool ${name} timed out`)

    if ('content' in result) {
      return result.content ?? null
    }

    if ('toolResult' in result) {
      return result.toolResult ?? null
    }

    return null
  }

  async close(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close()
      }
    } catch (err) {
      logger.warn('Error closing MCP client:', err)
    }

    try {
      if (this.transport) {
        await this.transport.close()
      }
    } catch (err) {
      logger.warn('Error closing MCP transport:', err)
    }

    this.client = null
    this.transport = null
    this.connected = false
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err) => {
        clearTimeout(t)
        reject(err)
      },
    )
  })
}
