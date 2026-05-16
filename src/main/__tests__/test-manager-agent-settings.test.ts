import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { IPC } from '../../shared/ipc-channels'
import type { EffortLevel, ExplorationUpdate, ProjectScan } from '../../shared/types'
import type {
  AgentProvider,
  AgentSession,
  NormalizedEvent,
  ProviderSessionConfig,
} from '../providers'

const createSessionCalls: ProviderSessionConfig[] = []
const sessionStopCalls: AgentSession[] = []
const registeredExplorations = new Map<
  string,
  {
    callbackToken: string
    explorationId: string
    cwd: string
    e2eOutputPath: string
    window: { webContents?: { send?: (channel: string, data: unknown) => void } } | null
    onToolExecute?: (toolName: string, args: Record<string, unknown>) => void
  }
>()
let nextSessionEvents: ((config: ProviderSessionConfig) => AsyncIterable<NormalizedEvent>) | null =
  null

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
    const session: AgentSession = {
      nativeSessionId: null,
      send: () => nextSessionEvents?.(config) ?? emptyEvents(),
      sendTextOnly: () => emptyEvents(),
      stop: () => {
        sessionStopCalls.push(session)
      },
    }
    return session
  },
}

async function* emptyEvents(): AsyncIterable<NormalizedEvent> {}

async function* stopOnAbortEvents(config: ProviderSessionConfig): AsyncIterable<NormalizedEvent> {
  if (!config.abortController.signal.aborted) {
    await new Promise<void>((resolve) => {
      config.abortController.signal.addEventListener('abort', () => resolve(), { once: true })
    })
  }
  throw new Error('aborted')
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
    registerExploration: mock(
      (exploration: {
        callbackToken: string
        explorationId: string
        cwd: string
        e2eOutputPath: string
        window: { webContents?: { send?: (channel: string, data: unknown) => void } } | null
        onToolExecute?: (toolName: string, args: Record<string, unknown>) => void
      }) => {
        registeredExplorations.set(exploration.callbackToken, exploration)
      },
    ),
    unregisterExploration: mock((callbackToken: string) => {
      registeredExplorations.delete(callbackToken)
    }),
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

async function waitForExplorationStatus(
  sent: Array<{ channel: string; data: unknown }>,
  status: ExplorationUpdate['status'],
): Promise<ExplorationUpdate> {
  for (let i = 0; i < 20; i++) {
    const update = sent
      .filter((entry) => entry.channel === IPC.TEST_EXPLORATION_UPDATE)
      .map((entry) => entry.data as ExplorationUpdate)
      .find((entry) => entry.status === status)
    if (update) return update
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`exploration update with status ${status} was not captured`)
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
    sessionStopCalls.length = 0
    registeredExplorations.clear()
    nextSessionEvents = null
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

  test('does not send fallback empty goals after report_goals runs through the callback path', async () => {
    const sent: Array<{ channel: string; data: unknown }> = []
    testManager.setWindow({
      webContents: {
        send: (channel: string, data: unknown) => sent.push({ channel, data }),
      },
    } as never)
    nextSessionEvents = () =>
      (async function* () {
        const exploration = [...registeredExplorations.values()][0]
        exploration?.window?.webContents?.send?.(IPC.TEST_GOAL_SUGGESTION, {
          cwd: '/repo',
          goals: [{ id: 'login', title: 'Login', description: 'Check login' }],
          status: 'done',
        })
        exploration?.onToolExecute?.('report_goals', {
          goals: [{ id: 'login', title: 'Login', description: 'Check login' }],
        })
        yield { type: 'raw_passthrough', message: { type: 'mcp_call_begin' }, persist: false }
      })()

    await testManager.suggestGoals('/repo', 'gpt-5.5', 'xhigh')

    const goalUpdates = sent.filter((entry) => entry.channel === IPC.TEST_GOAL_SUGGESTION)
    expect(goalUpdates.map((entry) => entry.data)).toEqual([
      { cwd: '/repo', goals: [], status: 'loading' },
      {
        cwd: '/repo',
        goals: [{ id: 'login', title: 'Login', description: 'Check login' }],
        status: 'done',
      },
    ])
  })

  test('sends fallback empty goals when report_goals is only observed as provider activity', async () => {
    const sent: Array<{ channel: string; data: unknown }> = []
    testManager.setWindow({
      webContents: {
        send: (channel: string, data: unknown) => sent.push({ channel, data }),
      },
    } as never)
    nextSessionEvents = () =>
      (async function* () {
        yield { type: 'tool_use', toolId: 'tool-1', toolName: 'report_goals', input: {} }
      })()

    await testManager.suggestGoals('/repo', 'gpt-5.5', 'xhigh')

    const goalUpdates = sent.filter((entry) => entry.channel === IPC.TEST_GOAL_SUGGESTION)
    expect(goalUpdates.map((entry) => entry.data)).toEqual([
      { cwd: '/repo', goals: [], status: 'loading' },
      { cwd: '/repo', goals: [], status: 'done' },
    ])
  })

  test('stopExploration stops the provider session as well as aborting it', async () => {
    nextSessionEvents = (config) => stopOnAbortEvents(config)

    const exploration = await testManager.startExploration({
      cwd: '/repo',
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    const call = await waitForCreateSessionCall()
    testManager.stopExploration(exploration.id)

    expect(call.abortController.signal.aborted).toBe(true)
    expect(sessionStopCalls).toHaveLength(1)
  })

  test('complete text mapping does not dedupe against unrelated prior streamed text', async () => {
    const sent: Array<{ channel: string; data: unknown }> = []
    testManager.setWindow({
      webContents: {
        send: (channel: string, data: unknown) => sent.push({ channel, data }),
      },
    } as never)
    nextSessionEvents = () =>
      (async function* () {
        yield { type: 'text_delta', text: 'prefix hello suffix' }
        yield {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
          raw: {},
        }
      })()

    await testManager.startExploration({
      cwd: '/repo',
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    const done = await waitForExplorationStatus(sent, 'done')
    expect(done.streamingText).toBe('prefix hello suffixhello\n')
    expect(done.agentMessages).toContainEqual({ type: 'text', text: 'hello' })
  })

  test('complete text mapping surfaces distinct complete messages with identical text', async () => {
    const sent: Array<{ channel: string; data: unknown }> = []
    testManager.setWindow({
      webContents: {
        send: (channel: string, data: unknown) => sent.push({ channel, data }),
      },
    } as never)
    nextSessionEvents = () =>
      (async function* () {
        yield {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: 'repeat' }],
          raw: {},
        }
        yield {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'text', text: 'repeat' }],
          raw: {},
        }
      })()

    await testManager.startExploration({
      cwd: '/repo',
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    const done = await waitForExplorationStatus(sent, 'done')
    expect(done.streamingText).toBe('repeat\nrepeat\n')
    const textMessages = sent
      .filter((entry) => entry.channel === IPC.TEST_EXPLORATION_UPDATE)
      .flatMap((entry) => (entry.data as ExplorationUpdate).agentMessages ?? [])
      .filter((message) => message.type === 'text' && message.text === 'repeat')
    expect(textMessages).toHaveLength(2)
  })

  test('complete message mapping does not repeat tool uses already emitted by id', async () => {
    const sent: Array<{ channel: string; data: unknown }> = []
    testManager.setWindow({
      webContents: {
        send: (channel: string, data: unknown) => sent.push({ channel, data }),
      },
    } as never)
    nextSessionEvents = () =>
      (async function* () {
        yield { type: 'tool_use', toolId: 'tool-1', toolName: 'report_finding', input: {} }
        yield {
          type: 'message_complete',
          role: 'assistant',
          content: [{ type: 'tool_use', toolId: 'tool-1', toolName: 'report_finding', input: {} }],
          raw: {},
        }
      })()

    await testManager.startExploration({
      cwd: '/repo',
      url: 'http://localhost:3000',
      goal: 'Login',
      mode: 'manual',
      e2eOutputPath: 'e2e',
      agentModel: 'gpt-5.5',
      agentEffort: 'xhigh',
    })

    await waitForExplorationStatus(sent, 'done')
    const toolUseMessages = sent
      .filter((entry) => entry.channel === IPC.TEST_EXPLORATION_UPDATE)
      .flatMap((entry) => (entry.data as ExplorationUpdate).agentMessages ?? [])
      .filter((message) => message.type === 'tool_use' && message.id === 'tool-1')
    expect(toolUseMessages).toHaveLength(1)
  })
})
