import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { EffortLevel, ProjectScan } from '../../shared/types'
import type { AgentProvider, ProviderSessionConfig } from '../providers'

const createSessionCalls: ProviderSessionConfig[] = []

const fakeProvider: AgentProvider = {
  id: 'codex',
  models: [
    {
      id: 'gpt-5.5',
      label: 'GPT 5.5',
      provider: 'codex',
      contextWindow: 1_000_000,
      supportsEffort: ['xhigh'],
    },
    {
      id: 'claude-opus-4-7',
      label: 'Claude Opus 4.7',
      provider: 'codex',
      contextWindow: 1_000_000,
      supportsEffort: ['high'],
    },
  ],
  capabilities: {
    interactivePermissions: false,
    askUserQuestion: false,
    reportsCostUsd: false,
    subagents: false,
    sessionResume: false,
    midSessionModelSwitch: false,
    fileCheckpointing: false,
    planMode: false,
  },
  createSession: (config: ProviderSessionConfig) => {
    createSessionCalls.push(config)
    return {
      nativeSessionId: null,
      async *send() {},
      async *sendTextOnly() {},
      stop: () => {},
    }
  },
}

mock.module('electron', () => ({
  app: { on: mock(() => {}) },
}))

mock.module('../providers', () => ({
  getProviderForModel: (model: string) =>
    model === 'gpt-5.5' || model === 'claude-opus-4-7' ? fakeProvider : undefined,
}))

mock.module('../test-mcp-bridge', () => ({
  buildTestingMcpServers: () => ({
    playwright: {
      command: 'bunx',
      args: ['@playwright/mcp@latest', '--headless'],
    },
    'pylon-testing': {
      command: process.execPath,
      args: ['/tmp/test-mcp-stdio-server.js'],
      env: {},
    },
  }),
  testingToolCallbackServer: {
    start: mock(() => Promise.resolve({ port: 49152, callbackUrl: 'http://127.0.0.1:49152/tool' })),
    registerExploration: mock(() => {}),
    unregisterExploration: mock(() => {}),
  },
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

const { testManager } = await import('../test-manager')

async function waitForCreateSessionCall(index = 0): Promise<ProviderSessionConfig> {
  for (let i = 0; i < 10; i++) {
    const call = createSessionCalls[index]
    if (call) return call
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`provider session call ${index} was not captured`)
}

function expectProviderAgentOptions(
  call: ProviderSessionConfig,
  model: string,
  effort: EffortLevel,
) {
  expect(call.model).toBe(model)
  expect(call.effort).toBe(effort)
}

describe('TestManager agent settings', () => {
  beforeEach(() => {
    createSessionCalls.length = 0
  })

  test('passes selected agent model and effort into goal suggestion provider session', async () => {
    await testManager.suggestGoals('/repo', 'gpt-5.5', 'xhigh')

    expectProviderAgentOptions(await waitForCreateSessionCall(), 'gpt-5.5', 'xhigh')
  })

  test('passes selected agent model and effort into exploration provider session', async () => {
    await testManager.startExploration({
      cwd: '/repo',
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    expectProviderAgentOptions(await waitForCreateSessionCall(), 'gpt-5.5', 'xhigh')
  })

  test('passes selected agent model and effort from batch starts into exploration provider session', async () => {
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

    expectProviderAgentOptions(await waitForCreateSessionCall(), 'gpt-5.5', 'xhigh')
  })
})
