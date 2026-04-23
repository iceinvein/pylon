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

    // Assign client before awaiting so failure paths can reach it for cleanup.
    this.client = client

    try {
      // client.connect() calls transport.start() internally; do NOT call transport.start() manually.
      await withTimeout(client.connect(transport), timeoutMs, 'MCP connect timed out')
      this.connected = true
    } catch (err) {
      // Clean up the subprocess even if connect timed out or start failed.
      // client.close() will close the transport internally.
      try {
        await transport.close()
      } catch (closeErr) {
        logger.warn('Error closing MCP transport after failed connect:', closeErr)
      }
      this.client = null
      throw err
    }
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

    if (
      result &&
      typeof result === 'object' &&
      (result as { isError?: boolean }).isError === true
    ) {
      const content = (result as { content?: unknown }).content
      throw new Error(
        `MCP tool ${name} reported an error: ${
          typeof content === 'string' ? content : JSON.stringify(content)
        }`,
      )
    }

    if (result && typeof result === 'object') {
      if ('content' in result) return (result as { content: unknown }).content
      if ('toolResult' in result) return (result as { toolResult: unknown }).toolResult
    }

    logger.warn(`Unexpected MCP tool result shape for ${name}`, result)
    throw new Error(`MCP tool ${name} returned an unexpected result shape`)
  }

  async close(): Promise<void> {
    try {
      if (this.client) await this.client.close()
    } catch (err) {
      logger.warn('Error closing MCP client:', err)
    }
    this.client = null
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
