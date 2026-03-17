import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk'
import { app, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type {
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
import { checkPortInUse, scanProject as runProjectScan } from './project-scanner'
import { serverManager } from './server-manager'
import {
  createReportFindingTool,
  createReportGoalsTool,
  createSavePlaywrightTestTool,
} from './test-tools'

const logger = log.child('test-manager')
const STREAM_THROTTLE_MS = 300
const GOAL_SUGGESTION_TIMEOUT_MS = 60_000 // 60s max for goal suggestion

class TestManager {
  private activeExplorations = new Map<
    string,
    {
      id: string
      abortController: AbortController
      streamedText: string
    }
  >()
  private goalSuggestionAbort: AbortController | null = null
  private window: BrowserWindow | null = null
  private batchCompletionCallbacks = new Map<string, { remaining: number; cwd: string }>()
  private serverCleanupRegistered = false

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

  async suggestGoals(cwd: string): Promise<void> {
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

    let goalToolCalled = false

    try {
      const scan = runProjectScan(cwd)

      const goalToolCtx = { cwd, window: this.window }
      const reportGoalsTool = createReportGoalsTool(goalToolCtx)

      // Wrap the tool to track if it was called
      const wrappedExecute = async (args: Record<string, unknown>) => {
        goalToolCalled = true
        return reportGoalsTool.execute(args)
      }

      const toolsServer = createSdkMcpServer({
        name: 'pylon-goal-analysis',
        tools: [
          {
            name: reportGoalsTool.name,
            description: reportGoalsTool.description,
            inputSchema: {
              goals: z.array(
                z.object({
                  id: z.string().describe('Unique ID for this goal'),
                  title: z.string().describe('Short title (e.g. "Authentication flow")'),
                  description: z
                    .string()
                    .describe(
                      'What to test (e.g. "Login, signup, password reset, session handling")',
                    ),
                  area: z
                    .string()
                    .optional()
                    .describe('Category (e.g. "auth", "dashboard", "api")'),
                }),
              ),
            },
            handler: (args: Record<string, unknown>) => wrappedExecute(args),
          },
        ],
      })

      const prompt = this.buildGoalSuggestionPrompt(cwd, scan)

      // Race against a timeout to prevent indefinite hangs
      const timeoutId = setTimeout(() => {
        logger.warn('Goal suggestion timed out, aborting')
        abortController.abort()
      }, GOAL_SUGGESTION_TIMEOUT_MS)

      try {
        for await (const _message of query({
          prompt,
          options: {
            maxTurns: 5,
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
            abortController,
            mcpServers: {
              'pylon-goal-analysis': toolsServer,
            },
          },
        })) {
          // Just consume messages — the report_goals tool call sends goals via IPC
        }
      } finally {
        clearTimeout(timeoutId)
      }

      // If the tool wasn't called, send done with empty goals
      if (!abortController.signal.aborted && !goalToolCalled) {
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
    autoStartServer: boolean
    projectScan?: ProjectScan
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

    const effectiveUrl = serverUrl || config.projectScan?.detectedUrl || `http://localhost:3000`
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
    },
  ): Promise<void> {
    const abortController = new AbortController()
    this.activeExplorations.set(explorationId, {
      id: explorationId,
      abortController,
      streamedText: '',
    })

    const toolContext = {
      explorationId,
      cwd: config.cwd,
      e2eOutputPath: config.e2eOutputPath,
      window: this.window,
    }

    // Create tool definitions and wrap them for the SDK MCP server
    const reportFindingTool = createReportFindingTool(toolContext)
    const savePlaywrightTestTool = createSavePlaywrightTestTool(toolContext)

    const toolsServer = createSdkMcpServer({
      name: 'pylon-testing',
      tools: [
        {
          name: reportFindingTool.name,
          description: reportFindingTool.description,
          inputSchema: {
            title: z.string().describe('Short descriptive title'),
            description: z.string().describe('Detailed description'),
            severity: z
              .enum(['critical', 'high', 'medium', 'low', 'info'])
              .describe('Severity level'),
            url: z.string().describe('URL where found'),
            reproduction_steps: z.array(z.string()).describe('Steps to reproduce'),
          },
          handler: (args: Record<string, unknown>) => reportFindingTool.execute(args),
        },
        {
          name: savePlaywrightTestTool.name,
          description: savePlaywrightTestTool.description,
          inputSchema: {
            filename: z.string().describe('Test file name (must end with .spec.ts)'),
            content: z.string().describe('Full Playwright test file content'),
          },
          handler: (args: Record<string, unknown>) => savePlaywrightTestTool.execute(args),
        },
      ],
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
      for await (const message of query({
        prompt,
        options: {
          maxTurns: 100,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          abortController,
          mcpServers: {
            playwright: {
              command: 'bunx',
              args: ['@playwright/mcp@latest', '--headless'],
            },
            'pylon-testing': toolsServer,
          },
        },
      })) {
        // Track token usage
        const msg = message as Record<string, unknown>
        const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined
        if (usage) {
          if (usage.input_tokens) inputTokens += usage.input_tokens
          if (usage.output_tokens) outputTokens += usage.output_tokens
        }

        // Extract structured messages from assistant turns
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const block of msg.content as Array<Record<string, unknown>>) {
            if (block.type === 'text' && typeof block.text === 'string') {
              active.streamedText += `${block.text}\n`
              accumulatedMessages.push({ type: 'text', text: block.text as string })
            }
            if (block.type === 'thinking' && typeof block.thinking === 'string') {
              accumulatedMessages.push({ type: 'thinking', text: block.thinking as string })
            }
            if (block.type === 'tool_use' && typeof block.name === 'string') {
              accumulatedMessages.push({
                type: 'tool_use',
                id: (block.id as string) ?? '',
                name: block.name as string,
                input: (block.input as Record<string, unknown>) ?? {},
              })
            }
          }
        }

        // Extract tool results from user messages
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          for (const block of msg.content as Array<Record<string, unknown>>) {
            if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
              const text =
                typeof block.content === 'string'
                  ? block.content
                  : Array.isArray(block.content)
                    ? (block.content as Array<{ type: string; text?: string }>)
                        .filter((b) => b.type === 'text')
                        .map((b) => b.text ?? '')
                        .join('\n')
                    : ''
              accumulatedMessages.push({
                type: 'tool_result',
                toolUseId: block.tool_use_id as string,
                content: text.slice(0, 2000),
              })
            }
          }
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
      this.activeExplorations.delete(explorationId)
    }
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
    }
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
      const fullPath = join(cwd, relativePath)
      // Security: ensure the resolved path is within cwd
      if (!fullPath.startsWith(cwd)) return null
      return readFileSync(fullPath, 'utf-8')
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
