import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { EffortLevel, ProjectScan } from '../../shared/types'

const queryCalls: unknown[] = []

async function* emptyQuery(args: unknown) {
  queryCalls.push(args)
}

mock.module('electron', () => ({
  app: { on: mock(() => {}) },
}))

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: (config: unknown) => ({ type: 'sdk', config }),
  query: (args: unknown) => emptyQuery(args),
}))

mock.module('../claude-code-executable', () => ({
  getClaudeCodeSdkRuntimeOptions: () => ({}),
}))

mock.module('../db', () => ({
  getDb: () => ({
    prepare: () => ({
      run: () => {},
      all: () => [],
      get: () => undefined,
    }),
  }),
}))

const scan: ProjectScan = {
  framework: 'vite',
  devCommand: 'bun run dev',
  detectedPort: 3000,
  detectedUrl: 'http://localhost:3000',
  packageManager: 'bun',
  portOverrideMethod: null,
  serverRunning: false,
  routeFiles: [],
  hasPlaywrightConfig: false,
  docsFiles: [],
  error: null,
}

mock.module('../project-scanner', () => ({
  scanProject: () => scan,
  checkPortInUse: () => Promise.resolve(false),
}))

mock.module('../server-manager', () => ({
  serverManager: {
    acquire: mock(() => Promise.resolve({ url: 'http://localhost:3000' })),
    release: mock(() => {}),
    killAll: mock(() => {}),
  },
}))

mock.module('../test-tools', () => ({
  createReportFindingTool: () => ({
    name: 'report_finding',
    description: 'Report finding',
    execute: mock(() => Promise.resolve({ content: [] })),
  }),
  createReportGoalsTool: () => ({
    name: 'report_goals',
    description: 'Report goals',
    execute: mock(() => Promise.resolve({ content: [] })),
  }),
  createSavePlaywrightTestTool: () => ({
    name: 'save_playwright_test',
    description: 'Save test',
    execute: mock(() => Promise.resolve({ content: [] })),
  }),
}))

const { testManager } = await import('../test-manager')

async function waitForQueryCall(index = 0): Promise<Record<string, unknown>> {
  for (let i = 0; i < 10; i++) {
    const call = queryCalls[index]
    if (call && typeof call === 'object') return call as Record<string, unknown>
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`query call ${index} was not captured`)
}

function expectQueryAgentOptions(call: Record<string, unknown>, model: string, effort: EffortLevel) {
  const options = call.options as Record<string, unknown>
  expect(options.model).toBe(model)
  expect(options.effort).toBe(effort)
}

describe('TestManager agent settings', () => {
  beforeEach(() => {
    queryCalls.length = 0
  })

  test('passes selected agent model and effort into goal suggestion query options', async () => {
    await testManager.suggestGoals('/repo', 'gpt-5.5', 'xhigh')

    expectQueryAgentOptions(await waitForQueryCall(), 'gpt-5.5', 'xhigh')
  })

  test('passes selected agent model and effort into exploration query options', async () => {
    await testManager.startExploration({
      cwd: '/repo',
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    expectQueryAgentOptions(await waitForQueryCall(), 'gpt-5.5', 'xhigh')
  })

  test('passes selected agent model and effort from batch starts into exploration query options', async () => {
    await testManager.startBatch({
      cwd: '/repo',
      goals: ['Login'],
      agentCount: 1,
      mode: 'manual',
      e2eOutputPath: 'e2e',
      autoStartServer: false,
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    expectQueryAgentOptions(await waitForQueryCall(), 'gpt-5.5', 'xhigh')
  })
})
