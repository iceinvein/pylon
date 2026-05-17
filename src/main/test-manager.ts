import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type {
  EffortLevel,
  ExplorationAgentMessage,
  ExplorationMode,
  ExplorationStatus,
  ExplorationUpdate,
  GoalSuggestionUpdate,
  ProjectScan,
  TestExploration,
  TestFinding,
} from '../shared/types'
import { getDb } from './db'
import { resolveE2eOutputPath } from './e2e-path-resolver'
import { resolveFeatureAgent } from './feature-agent-resolver'
import { checkPortInUse, scanProject as runProjectScan } from './project-scanner'
import type { AgentSession, NormalizedEvent } from './providers'
import { serverManager } from './server-manager'
import { buildTestingMcpServers, testingToolCallbackServer } from './test-mcp-bridge'

const logger = log.child('test-manager')
const STREAM_THROTTLE_MS = 300
const GOAL_SUGGESTION_TIMEOUT_MS = 60_000 // 60s max for goal suggestion

class TestManager {
  private activeExplorations = new Map<
    string,
    {
      id: string
      abortController: AbortController
      session?: AgentSession
      streamedText: string
      pendingTextDelta: string
      emittedToolUseIds: Set<string>
      emittedToolResultIds: Set<string>
    }
  >()
  private goalSuggestionAbort: AbortController | null = null
  private window: BrowserWindow | null = null
  private batchCompletionCallbacks = new Map<string, { remaining: number; cwd: string }>()
  private serverCleanupRegistered = false
  private stoppedExplorations = new Set<string>()

  setWindow(window: BrowserWindow): void {
    this.window = window

    // Clean up servers on app quit (guard against multiple registrations)
    if (!this.serverCleanupRegistered) {
      this.serverCleanupRegistered = true
      app.on('before-quit', () => {
        serverManager.killAll()
      })
    }
  }

  private send(channel: string, data: unknown): void {
    this.window?.webContents.send(channel, data)
  }

  resolveE2ePath(cwd: string) {
    return resolveE2eOutputPath(cwd)
  }

  async scanProject(cwd: string): Promise<ProjectScan> {
    const scan = runProjectScan(cwd)
    if (scan.detectedPort) {
      scan.serverRunning = await checkPortInUse(scan.detectedPort)
    }
    return scan
  }

  async suggestGoals(cwd: string, agentModel?: string, agentEffort?: EffortLevel): Promise<void> {
    // Abort any in-flight suggestion
    if (this.goalSuggestionAbort) {
      this.goalSuggestionAbort.abort()
    }

    const abortController = new AbortController()
    this.goalSuggestionAbort = abortController

    // Send loading state
    this.send(IPC.TEST_GOAL_SUGGESTION, {
      cwd,
      goals: [],
      status: 'loading',
    } satisfies GoalSuggestionUpdate)

    let goalToolCallbackExecuted = false
    const callbackToken = randomUUID()

    try {
      const scan = runProjectScan(cwd)
      const prompt = this.buildGoalSuggestionPrompt(cwd, scan)
      const agent = resolveFeatureAgent({
        feature: 'testing',
        requestedModel: agentModel,
        requestedEffort: agentEffort,
      })
      const { port } = await testingToolCallbackServer.start()

      testingToolCallbackServer.registerExploration({
        callbackToken,
        explorationId: `goal-suggestion-${callbackToken}`,
        cwd,
        e2eOutputPath: '',
        window: this.window,
        onToolExecute: (toolName) => {
          if (this.isReportGoalsToolName(toolName)) {
            goalToolCallbackExecuted = true
          }
        },
      })

      const session = agent.provider.createSession({
        cwd,
        model: agent.model,
        effort: agent.effort,
        permissionMode: 'auto-approve',
        abortController,
        onPermissionRequest: async () => ({ behavior: 'allow' as const }),
        onQuestionRequest: async () => ({}),
        mcpServers: buildTestingMcpServers({
          callbackPort: port,
          callbackToken,
          explorationId: `goal-suggestion-${callbackToken}`,
          cwd,
          e2eOutputPath: '',
        }),
      })

      // Race against a timeout to prevent indefinite hangs
      const timeoutId = setTimeout(() => {
        logger.warn('Goal suggestion timed out, aborting')
        abortController.abort()
      }, GOAL_SUGGESTION_TIMEOUT_MS)

      try {
        for await (const event of session.send(prompt)) {
          if (event.type === 'error') throw new Error(event.message)
        }
      } finally {
        clearTimeout(timeoutId)
      }

      // If the callback did not complete, send done with empty goals.
      if (!abortController.signal.aborted && !goalToolCallbackExecuted) {
        this.send(IPC.TEST_GOAL_SUGGESTION, {
          cwd,
          goals: [],
          status: 'done',
        } satisfies GoalSuggestionUpdate)
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        // Aborted by timeout or user — send done with whatever we have
        logger.warn('Goal suggestion aborted (timeout or user cancel)')
        this.send(IPC.TEST_GOAL_SUGGESTION, {
          cwd,
          goals: [],
          status: 'done',
        } satisfies GoalSuggestionUpdate)
      } else {
        logger.error('Goal suggestion failed:', err)
        this.send(IPC.TEST_GOAL_SUGGESTION, {
          cwd,
          goals: [],
          status: 'error',
          error: String(err),
        } satisfies GoalSuggestionUpdate)
      }
    } finally {
      testingToolCallbackServer.unregisterExploration(callbackToken)
      if (this.goalSuggestionAbort === abortController) {
        this.goalSuggestionAbort = null
      }
    }
  }

  async startExploration(config: {
    cwd: string
    url: string
    goal: string
    mode: ExplorationMode
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    projectScan?: ProjectScan
    batchId?: string
    autoStartServer?: boolean
    agentModel?: string
    agentEffort?: EffortLevel
  }): Promise<TestExploration> {
    const id = randomUUID()
    const now = Date.now()

    const exploration: TestExploration = {
      id,
      batchId: config.batchId ?? null,
      cwd: config.cwd,
      url: config.url,
      goal: config.goal,
      mode: config.mode,
      requirements: config.requirements || null,
      e2eOutputPath: config.e2eOutputPath,
      e2ePathReason: config.e2ePathReason || null,
      status: 'running',
      errorMessage: null,
      findingsCount: 0,
      testsGenerated: 0,
      generatedTestPaths: [],
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
      startedAt: now,
      completedAt: null,
      createdAt: now,
    }

    // Insert into DB
    const db = getDb()
    db.prepare(
      `INSERT INTO test_explorations (id, batch_id, cwd, url, goal, mode, requirements, e2e_output_path, e2e_path_reason, status, started_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      config.batchId ?? null,
      config.cwd,
      config.url,
      config.goal,
      config.mode,
      config.requirements || null,
      config.e2eOutputPath,
      config.e2ePathReason || null,
      'running',
      now,
      now,
    )

    // Send initial update
    this.send(IPC.TEST_EXPLORATION_UPDATE, {
      explorationId: id,
      status: 'running',
    })

    // Run without awaiting (fire-and-forget, errors handled internally)
    this.runExploration(id, config).catch((err) => {
      logger.error('Exploration failed:', err)
    })

    return exploration
  }

  async startBatch(config: {
    cwd: string
    goals: string[]
    agentCount: number
    mode: ExplorationMode
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    customUrl?: string
    autoStartServer: boolean
    projectScan?: ProjectScan
    agentModel?: string
    agentEffort?: EffortLevel
  }): Promise<TestExploration[]> {
    const batchId = randomUUID()
    const { goals, agentCount } = config

    // Start server if auto-start is on
    let serverUrl = ''
    logger.info(
      `startBatch: autoStartServer=${config.autoStartServer}, projectScan=${!!config.projectScan}, devCommand=${config.projectScan?.devCommand ?? 'null'}, detectedPort=${config.projectScan?.detectedPort ?? 'null'}`,
    )
    if (config.autoStartServer && config.projectScan) {
      try {
        const { url } = await serverManager.acquire(config.cwd, config.projectScan)
        serverUrl = url
        logger.info(`Server acquired at ${url}`)
      } catch (err) {
        logger.error('Failed to start server:', err)
        throw new Error(`Server startup failed: ${String(err)}`)
      }
    } else {
      logger.warn(
        `Server auto-start SKIPPED: autoStartServer=${config.autoStartServer}, hasProjectScan=${!!config.projectScan}`,
      )
    }

    const effectiveUrl =
      serverUrl ||
      this.normalizeTargetUrl(config.customUrl) ||
      config.projectScan?.detectedUrl ||
      `http://localhost:3000`
    logger.info(`effectiveUrl=${effectiveUrl} (serverUrl=${serverUrl || 'empty'})`)

    // Create exploration records (but don't run yet — we control concurrency)
    const explorations: TestExploration[] = []
    for (const goal of goals) {
      const id = randomUUID()
      const now = Date.now()
      const exploration: TestExploration = {
        id,
        batchId,
        cwd: config.cwd,
        url: effectiveUrl,
        goal,
        mode: config.mode,
        requirements: config.requirements || null,
        e2eOutputPath: config.e2eOutputPath,
        e2ePathReason: config.e2ePathReason || null,
        status: 'pending',
        errorMessage: null,
        findingsCount: 0,
        testsGenerated: 0,
        generatedTestPaths: [],
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
        startedAt: null,
        completedAt: null,
        createdAt: now,
      }

      // Insert into DB
      const db = getDb()
      db.prepare(
        `INSERT INTO test_explorations (id, batch_id, cwd, url, goal, mode, requirements, e2e_output_path, e2e_path_reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        batchId,
        config.cwd,
        effectiveUrl,
        goal,
        config.mode,
        config.requirements || null,
        config.e2eOutputPath,
        config.e2ePathReason || null,
        'pending',
        now,
      )

      explorations.push(exploration)
    }

    // Track batch for server release
    if (config.autoStartServer && config.projectScan) {
      this.batchCompletionCallbacks.set(batchId, { remaining: goals.length, cwd: config.cwd })
    }

    // Semaphore-based concurrency: run up to agentCount simultaneously
    const queue = [...explorations]
    const running = new Set<Promise<void>>()

    const runNext = async () => {
      const exploration = queue.shift()
      if (!exploration) return

      if (this.stoppedExplorations.has(exploration.id)) {
        this.stoppedExplorations.delete(exploration.id)
        this.onExplorationComplete(batchId)
        if (queue.length > 0) {
          const next = runNext()
          if (next) running.add(next)
        }
        return
      }

      this.updateStatus(exploration.id, 'running', 0, 0)
      this.send(IPC.TEST_EXPLORATION_UPDATE, { explorationId: exploration.id, status: 'running' })

      const promise = this.runExploration(exploration.id, {
        cwd: config.cwd,
        url: effectiveUrl,
        goal: exploration.goal,
        mode: config.mode,
        requirements: config.requirements,
        e2eOutputPath: config.e2eOutputPath,
        projectScan: config.projectScan,
        autoStartServer: config.autoStartServer,
        agentModel: config.agentModel,
        agentEffort: config.agentEffort,
      })
        .catch((err) => {
          logger.error(`Exploration ${exploration.id} failed:`, err)
        })
        .finally(() => {
          running.delete(promise)
          // Notify batch completion tracker
          this.onExplorationComplete(batchId)
          // Start next in queue
          if (queue.length > 0) {
            const next = runNext()
            if (next) running.add(next)
          }
        })

      running.add(promise)
      return promise
    }

    // Kick off initial batch up to agentCount
    const initialCount = Math.min(agentCount, queue.length)
    for (let i = 0; i < initialCount; i++) {
      runNext()
    }

    return explorations
  }

  private onExplorationComplete(batchId: string): void {
    const tracker = this.batchCompletionCallbacks.get(batchId)
    if (!tracker) return

    tracker.remaining--
    if (tracker.remaining <= 0) {
      this.batchCompletionCallbacks.delete(batchId)
      serverManager.release(tracker.cwd)
      logger.info(`Batch ${batchId} complete, released server for ${tracker.cwd}`)
    }
  }

  private async runExploration(
    explorationId: string,
    config: {
      cwd: string
      url: string
      goal: string
      mode: ExplorationMode
      requirements?: string
      e2eOutputPath: string
      projectScan?: ProjectScan
      autoStartServer?: boolean
      agentModel?: string
      agentEffort?: EffortLevel
    },
  ): Promise<void> {
    const abortController = new AbortController()
    const callbackToken = randomUUID()
    this.activeExplorations.set(explorationId, {
      id: explorationId,
      abortController,
      streamedText: '',
      pendingTextDelta: '',
      emittedToolUseIds: new Set(),
      emittedToolResultIds: new Set(),
    })

    const prompt = this.buildPrompt({
      ...config,
      projectScan: config.projectScan,
      autoStartServer: config.autoStartServer,
    })
    let inputTokens = 0
    let outputTokens = 0
    let lastSendTime = 0
    let accumulatedMessages: ExplorationAgentMessage[] = []
    let hasUsageUpdate = false
    const active = this.activeExplorations.get(explorationId)
    if (!active) return

    const flushMessages = (
      status: ExplorationUpdate['status'],
      extra?: Partial<ExplorationUpdate>,
    ) => {
      const update: ExplorationUpdate = {
        explorationId,
        status,
        streamingText: active.streamedText,
        agentMessages: accumulatedMessages.length > 0 ? accumulatedMessages : undefined,
        inputTokens,
        outputTokens,
        ...extra,
      }
      this.send(IPC.TEST_EXPLORATION_UPDATE, update)
      accumulatedMessages = []
    }

    try {
      const agent = resolveFeatureAgent({
        feature: 'testing',
        requestedModel: config.agentModel,
        requestedEffort: config.agentEffort,
      })
      const { port } = await testingToolCallbackServer.start()

      testingToolCallbackServer.registerExploration({
        callbackToken,
        explorationId,
        cwd: config.cwd,
        e2eOutputPath: config.e2eOutputPath,
        window: this.window,
      })

      const session = agent.provider.createSession({
        cwd: config.cwd,
        model: agent.model,
        effort: agent.effort,
        permissionMode: 'auto-approve',
        abortController,
        onPermissionRequest: async () => ({ behavior: 'allow' as const }),
        onQuestionRequest: async () => ({}),
        mcpServers: buildTestingMcpServers({
          callbackPort: port,
          callbackToken,
          explorationId,
          cwd: config.cwd,
          e2eOutputPath: config.e2eOutputPath,
        }),
      })
      active.session = session
      if (abortController.signal.aborted) {
        session.stop()
        throw new Error('Exploration stopped')
      }

      for await (const event of session.send(prompt)) {
        if (event.type === 'error') throw new Error(event.message)

        if (event.type === 'usage_update') {
          hasUsageUpdate = true
          inputTokens += event.inputTokens
          outputTokens += event.outputTokens
        } else if (event.type === 'turn_complete') {
          if (hasUsageUpdate) {
            inputTokens = Math.max(inputTokens, event.inputTokens)
            outputTokens = Math.max(outputTokens, event.outputTokens)
          } else {
            inputTokens += event.inputTokens
            outputTokens += event.outputTokens
          }
        } else {
          this.appendExplorationAgentEvent(event, active, (message) => {
            accumulatedMessages.push(message)
          })
        }

        // Throttled IPC update — accumulates messages between sends
        const now = Date.now()
        if (now - lastSendTime > STREAM_THROTTLE_MS) {
          lastSendTime = now
          flushMessages('running')
        }
      }

      // Success — flush any remaining messages
      this.updateStatus(explorationId, 'done', inputTokens, outputTokens)
      flushMessages('done')
    } catch (err) {
      if (abortController.signal.aborted) {
        this.updateStatus(explorationId, 'stopped', inputTokens, outputTokens)
        flushMessages('stopped')
      } else {
        const errMsg = String(err)
        this.updateStatus(explorationId, 'error', inputTokens, outputTokens, errMsg)
        flushMessages('error', { error: errMsg })
      }
    } finally {
      testingToolCallbackServer.unregisterExploration(callbackToken)
      this.activeExplorations.delete(explorationId)
    }
  }

  private appendExplorationAgentEvent(
    event: NormalizedEvent,
    active: {
      streamedText: string
      pendingTextDelta: string
      emittedToolUseIds: Set<string>
      emittedToolResultIds: Set<string>
    },
    pushMessage: (message: ExplorationAgentMessage) => void,
  ): void {
    switch (event.type) {
      case 'text_delta':
        active.streamedText += event.text
        active.pendingTextDelta += event.text
        pushMessage({ type: 'text', text: event.text })
        break
      case 'thinking_delta':
        pushMessage({ type: 'thinking', text: event.text })
        break
      case 'tool_use':
        if (active.emittedToolUseIds.has(event.toolId)) break
        active.emittedToolUseIds.add(event.toolId)
        pushMessage({
          type: 'tool_use',
          id: event.toolId,
          name: event.toolName,
          input: this.toRecord(event.input),
        })
        break
      case 'tool_result':
        if (active.emittedToolResultIds.has(event.toolId)) break
        active.emittedToolResultIds.add(event.toolId)
        pushMessage({
          type: 'tool_result',
          toolUseId: event.toolId,
          content: event.output.slice(0, 2000),
        })
        break
      case 'message_complete':
        this.appendCompleteMessage(event, active, pushMessage)
        break
    }
  }

  private appendCompleteMessage(
    event: Extract<NormalizedEvent, { type: 'message_complete' }>,
    active: {
      streamedText: string
      pendingTextDelta: string
      emittedToolUseIds: Set<string>
      emittedToolResultIds: Set<string>
    },
    pushMessage: (message: ExplorationAgentMessage) => void,
  ): void {
    for (const block of event.content) {
      if (block.type === 'text' && event.role === 'assistant') {
        if (active.pendingTextDelta.startsWith(block.text)) {
          active.pendingTextDelta = active.pendingTextDelta.slice(block.text.length)
          continue
        }

        active.streamedText += `${block.text}\n`
        pushMessage({ type: 'text', text: block.text })
      }
      if (block.type === 'thinking' && event.role === 'assistant') {
        pushMessage({ type: 'thinking', text: block.text })
      }
      if (block.type === 'tool_use' && event.role === 'assistant') {
        if (active.emittedToolUseIds.has(block.toolId)) continue
        active.emittedToolUseIds.add(block.toolId)
        pushMessage({
          type: 'tool_use',
          id: block.toolId,
          name: block.toolName,
          input: this.toRecord(block.input),
        })
      }
      if (block.type === 'tool_result' && event.role === 'user') {
        if (active.emittedToolResultIds.has(block.toolId)) continue
        active.emittedToolResultIds.add(block.toolId)
        pushMessage({
          type: 'tool_result',
          toolUseId: block.toolId,
          content: block.output.slice(0, 2000),
        })
      }
    }

    if (event.role === 'assistant') {
      active.pendingTextDelta = ''
    }
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  }

  private isReportGoalsToolName(toolName: string): boolean {
    return toolName === 'report_goals' || toolName.endsWith('__report_goals')
  }

  private buildGoalSuggestionPrompt(cwd: string, scan: ProjectScan): string {
    const prompt = `You are analyzing a web application project to suggest testing goals.

Project path: ${cwd}
${scan.framework ? `Framework: ${scan.framework}` : 'Framework: unknown'}
${scan.devCommand ? `Dev command: ${scan.devCommand}` : ''}
${scan.routeFiles.length > 0 ? `Route files found:\n${scan.routeFiles.map((f) => `  - ${f}`).join('\n')}` : ''}
${scan.docsFiles.length > 0 ? `Documentation files:\n${scan.docsFiles.map((f) => `  - ${f}`).join('\n')}` : ''}

Instructions:
1. Read the project's README and any documentation files listed above
2. Examine the route/page structure to understand the application's features
3. Call report_goals with a list of 3-8 testable areas of the application
4. Each goal should be specific and actionable (not generic like "test everything")
5. Focus on user-facing features and critical user flows
6. Prioritize: authentication, forms, data display, navigation, error states`

    return prompt
  }

  private buildPrompt(config: {
    url: string
    goal: string
    mode: ExplorationMode
    requirements?: string
    projectScan?: ProjectScan
    autoStartServer?: boolean
  }): string {
    let prompt = `You are an expert QA engineer performing exploratory testing on a web application.

Target: ${config.url}
Goal: ${config.goal}
${
  config.projectScan
    ? `
Project Info:
${config.projectScan.framework ? `Framework: ${config.projectScan.framework}` : ''}
${config.projectScan.devCommand ? `Dev command: ${config.projectScan.devCommand}` : ''}
${config.autoStartServer ? `The dev server has been started for you at ${config.url}. Do not attempt to start or stop the server.` : `Navigate to ${config.url} to test the application. The server is managed externally.`}
`
    : ''
}
Instructions:
1. Navigate to the target URL using the browser
2. Systematically explore the application guided by the goal
3. For every bug or issue you find, call report_finding with details
4. When you discover important user flows worth preserving as regression tests,
   write a Playwright test and call save_playwright_test
5. Generated tests must be standard Playwright — import from @playwright/test,
   use test() and expect(), include descriptive test names
6. Test edge cases: empty inputs, special characters, boundary values,
   error states, accessibility
7. Be thorough but focused on the goal

Generated test file conventions:
- Use TypeScript (.spec.ts)
- Import { test, expect } from '@playwright/test'
- Use descriptive test.describe() and test() names
- Include comments explaining what each test verifies
- Use stable selectors (data-testid preferred, then aria roles, then CSS)
- Each test file should be independently runnable`

    if (config.mode === 'requirements' && config.requirements) {
      prompt += `\n\n## Requirements to Validate\n\n${config.requirements}\n\nFor each requirement above, validate whether the application meets it and generate Playwright tests covering the specification.`
    }

    return prompt
  }

  stopExploration(explorationId: string): void {
    const active = this.activeExplorations.get(explorationId)
    if (active) {
      active.abortController.abort()
      active.session?.stop()
      return
    }

    this.stoppedExplorations.add(explorationId)
    this.updateStatus(explorationId, 'stopped', 0, 0)
    this.send(IPC.TEST_EXPLORATION_UPDATE, {
      explorationId,
      status: 'stopped',
    } satisfies ExplorationUpdate)
  }

  private updateStatus(
    explorationId: string,
    status: ExplorationStatus,
    inputTokens: number,
    outputTokens: number,
    errorMessage?: string,
  ): void {
    const db = getDb()
    const completedAt = status === 'running' || status === 'pending' ? null : Date.now()
    db.prepare(
      `UPDATE test_explorations
       SET status = ?, error_message = ?, input_tokens = ?, output_tokens = ?,
           completed_at = ?
       WHERE id = ?`,
    ).run(status, errorMessage || null, inputTokens, outputTokens, completedAt, explorationId)
  }

  // ── Persistence queries ──

  listExplorations(cwd: string): TestExploration[] {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM test_explorations WHERE cwd = ? ORDER BY created_at DESC LIMIT 50')
      .all(cwd) as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToExploration(r))
  }

  getExploration(id: string): (TestExploration & { findings: TestFinding[] }) | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM test_explorations WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!row) return null

    const findings = db
      .prepare('SELECT * FROM test_findings WHERE exploration_id = ? ORDER BY created_at DESC')
      .all(id) as Array<Record<string, unknown>>

    return {
      ...this.rowToExploration(row),
      findings: findings.map((f) => this.rowToFinding(f)),
    }
  }

  deleteExploration(id: string): void {
    const db = getDb()
    db.prepare('DELETE FROM test_explorations WHERE id = ?').run(id)
  }

  readGeneratedTest(cwd: string, relativePath: string): string | null {
    try {
      const root = resolve(cwd)
      const fullPath = resolve(root, relativePath)
      // Security: ensure the resolved path is within cwd
      if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) return null
      return readFileSync(fullPath, 'utf-8')
    } catch {
      return null
    }
  }

  private normalizeTargetUrl(value?: string): string | null {
    const trimmed = value?.trim()
    if (!trimmed) return null
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    try {
      const parsed = new URL(withProtocol)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
    } catch {
      return null
    }
  }

  private rowToExploration(row: Record<string, unknown>): TestExploration {
    return {
      id: row.id as string,
      batchId: (row.batch_id as string | null) ?? null,
      cwd: row.cwd as string,
      url: row.url as string,
      goal: row.goal as string,
      mode: row.mode as ExplorationMode,
      requirements: row.requirements as string | null,
      e2eOutputPath: row.e2e_output_path as string,
      e2ePathReason: row.e2e_path_reason as string | null,
      status: row.status as ExplorationStatus,
      errorMessage: row.error_message as string | null,
      findingsCount: row.findings_count as number,
      testsGenerated: row.tests_generated as number,
      generatedTestPaths: JSON.parse((row.generated_test_paths as string) || '[]'),
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      totalCostUsd: row.total_cost_usd as number,
      startedAt: row.started_at as number | null,
      completedAt: row.completed_at as number | null,
      createdAt: row.created_at as number,
    }
  }

  private rowToFinding(row: Record<string, unknown>): TestFinding {
    return {
      id: row.id as string,
      explorationId: row.exploration_id as string,
      title: row.title as string,
      description: row.description as string,
      severity: row.severity as TestFinding['severity'],
      url: row.url as string,
      screenshotPath: row.screenshot_path as string | null,
      reproductionSteps: JSON.parse((row.reproduction_steps as string) || '[]'),
      createdAt: row.created_at as number,
    }
  }
}

export const testManager = new TestManager()
