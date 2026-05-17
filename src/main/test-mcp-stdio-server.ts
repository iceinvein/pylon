import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

type ForwardTestingToolCallOptions = {
  callbackUrl?: string
  callbackToken?: string
}

export async function forwardTestingToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: ForwardTestingToolCallOptions = {},
): Promise<CallToolResult> {
  const callbackUrl = options.callbackUrl ?? process.env.PYLON_TESTING_TOOL_CALLBACK_URL
  const callbackToken = options.callbackToken ?? process.env.PYLON_TESTING_TOOL_CALLBACK_TOKEN

  if (!callbackUrl) throw new Error('PYLON_TESTING_TOOL_CALLBACK_URL is required')
  if (!callbackToken) throw new Error('PYLON_TESTING_TOOL_CALLBACK_TOKEN is required')

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${callbackToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ toolName, args }),
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : text
    throw new Error(`Testing tool callback failed (${response.status}): ${message}`)
  }

  return payload as CallToolResult
}

export function createTestingMcpStdioServer(): McpServer {
  const server = new McpServer({ name: 'pylon-testing', version: '1.0.0' })

  server.registerTool(
    'report_finding',
    {
      description:
        'Report a bug or issue found during exploration. Call this whenever you discover unexpected behavior, visual issues, errors, or potential problems.',
      inputSchema: {
        title: z.string().describe('Short descriptive title'),
        description: z.string().describe('Detailed description'),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).describe('Severity level'),
        url: z.string().describe('URL where found'),
        reproduction_steps: z.array(z.string()).describe('Steps to reproduce'),
      },
    },
    async (args) => forwardTestingToolCall('report_finding', args),
  )

  server.registerTool(
    'save_playwright_test',
    {
      description:
        "Save a Playwright test file (.spec.ts) to the project's e2e directory. The test should be a complete, runnable Playwright test that can be executed with npx playwright test.",
      inputSchema: {
        filename: z.string().describe('Test file name (must end with .spec.ts)'),
        content: z.string().describe('Full Playwright test file content'),
      },
    },
    async (args) => forwardTestingToolCall('save_playwright_test', args),
  )

  server.registerTool(
    'report_goals',
    {
      description:
        'Report suggested testing goals based on your analysis of the project. Call this once after analyzing the codebase structure, README, docs, and route files.',
      inputSchema: {
        goals: z.array(
          z.object({
            id: z.string().describe('Unique ID for this goal'),
            title: z.string().describe('Short title'),
            description: z.string().describe('What to test'),
            area: z.string().optional().describe('Category'),
          }),
        ),
      },
    },
    async (args) => forwardTestingToolCall('report_goals', args),
  )

  return server
}

async function main(): Promise<void> {
  const server = createTestingMcpStdioServer()
  await server.connect(new StdioServerTransport())
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
