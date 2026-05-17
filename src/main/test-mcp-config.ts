import { join } from 'node:path'
import { app } from 'electron'

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
