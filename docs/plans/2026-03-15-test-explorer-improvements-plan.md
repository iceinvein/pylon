# Test Explorer Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the test explorer's wrong-target bug by adding Pylon-managed dev server lifecycle, add port-aware server management, and enable parallel exploration with a concurrency slider.

**Architecture:** A new `ServerManager` class handles dev server start/stop with reference counting. `TestManager` gains a `startBatch()` method that orchestrates concurrent explorations with a semaphore. The renderer adds a concurrency slider and unified findings view.

**Tech Stack:** Electron (main process), Node.js child_process, Zustand, React, TypeScript

**Spec:** `docs/plans/2026-03-15-test-explorer-improvements-design.md`

---

## Chunk 1: Types, IPC Channels, and Server Manager

### Task 1: Add new types and IPC channels

**Files:**
- Modify: `src/shared/types.ts:406-490`
- Modify: `src/shared/ipc-channels.ts:70-81`

- [ ] **Step 1: Add `portOverrideMethod` to `ProjectScan`**

In `src/shared/types.ts`, add the discriminated union and update `ProjectScan`:

```typescript
// Add after the E2ePathResolution type (line 413)
export type PortOverrideMethod =
  | { type: 'env' }
  | { type: 'cli-flag'; flag: string }
```

Then add `portOverrideMethod` to `ProjectScan`:

```typescript
export type ProjectScan = {
  framework: string | null
  devCommand: string | null
  detectedPort: number | null
  detectedUrl: string | null
  packageManager: string | null
  portOverrideMethod: PortOverrideMethod | null  // NEW
  serverRunning: boolean
  routeFiles: string[]
  hasPlaywrightConfig: boolean
  docsFiles: string[]
  error: string | null
}
```

- [ ] **Step 2: Add `batchId` to `TestExploration`**

In `src/shared/types.ts`, update `TestExploration` — add `batchId` after `id`:

```typescript
export type TestExploration = {
  id: string
  batchId: string | null  // NEW — groups parallel runs
  cwd: string
  // ... rest unchanged
}
```

> **Note:** `ExplorationUpdate.status` remains required. The existing `runExploration` always sends status, and tool-originated updates (like `report_finding`) go through separate tool handler callbacks, not the `ExplorationUpdate` channel.

- [ ] **Step 3: Add `TEST_START_BATCH` IPC channel**

In `src/shared/ipc-channels.ts`, add after line 80 (`TEST_GOAL_SUGGESTION`):

```typescript
  TEST_START_BATCH: 'test:start-batch',
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: May show errors in files that reference the changed types — that's fine, we'll fix them in later tasks.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts
git commit -m "feat(test): add batch types, port override method, and IPC channel"
```

---

### Task 2: Export port override mapping from project-scanner

**Files:**
- Modify: `src/main/project-scanner.ts:6-17`

- [ ] **Step 1: Add the `PORT_OVERRIDE_MAP` export**

In `src/main/project-scanner.ts`, add after the existing `FRAMEWORK_DEPS` constant (after line 17):

```typescript
export const PORT_OVERRIDE_MAP: Record<string, PortOverrideMethod> = {
  next: { type: 'cli-flag', flag: '-p' },
  vite: { type: 'cli-flag', flag: '--port' },
  remix: { type: 'cli-flag', flag: '--port' },
  cra: { type: 'env' },
  angular: { type: 'cli-flag', flag: '--port' },
  nuxt: { type: 'cli-flag', flag: '--port' },
  svelte: { type: 'cli-flag', flag: '--port' },
  sveltekit: { type: 'cli-flag', flag: '--port' },
  astro: { type: 'cli-flag', flag: '--port' },
}
```

Add the import at the top:

```typescript
import type { PortOverrideMethod } from '../shared/types'
```

- [ ] **Step 2: Populate `portOverrideMethod` in `scanProject()`**

In the `scanProject` function, where `result.framework` is set (inside the `for` loop around line 72-76), also set `portOverrideMethod`:

```typescript
        result.framework = info.name
        result.detectedPort = info.defaultPort
        result.portOverrideMethod = PORT_OVERRIDE_MAP[info.name] ?? { type: 'env' }
        break
```

Also initialize it in the result object at the top of `scanProject`:

```typescript
  const result: ProjectScan = {
    framework: null,
    devCommand: null,
    detectedPort: null,
    detectedUrl: null,
    packageManager: null,
    portOverrideMethod: null,  // NEW
    serverRunning: false,
    routeFiles: [],
    hasPlaywrightConfig: false,
    docsFiles: [],
    error: null,
  }
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (or only unrelated errors from files we haven't updated yet)

- [ ] **Step 4: Commit**

```bash
git add src/main/project-scanner.ts
git commit -m "feat(test): export port override mapping from project scanner"
```

---

### Task 3: Create ServerManager

**Files:**
- Create: `src/main/server-manager.ts`
- Test: `src/main/__tests__/server-manager.test.ts`

- [ ] **Step 1: Write the test for `findFreePort`**

Create `src/main/__tests__/server-manager.test.ts`:

```typescript
import { test, expect, describe, mock, beforeEach } from 'bun:test'

// We'll test the exported helper functions individually
// The full ServerManager integration is tested via test-manager

describe('ServerManager', () => {
  describe('findFreePort', () => {
    test('returns the starting port if it is free', async () => {
      const { findFreePort } = await import('../server-manager')
      // Use a high port that's almost certainly free
      const port = await findFreePort(59123)
      expect(port).toBe(59123)
    })

    test('increments port if starting port is taken', async () => {
      const net = await import('node:net')
      // Occupy a port
      const server = net.createServer()
      await new Promise<void>((resolve) => server.listen(59200, resolve))

      try {
        const { findFreePort } = await import('../server-manager')
        const port = await findFreePort(59200)
        expect(port).toBeGreaterThan(59200)
        expect(port).toBeLessThanOrEqual(59210)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })

    test('throws after max attempts', async () => {
      const { findFreePort } = await import('../server-manager')
      // Port 0 is reserved, but the test is really about the loop limit
      // We can't easily block 11 ports, so we test the error path differently
      // by passing a very high port close to the max
      expect(findFreePort(65530)).rejects.toThrow()
    })
  })

  describe('buildServerCommand', () => {
    test('appends CLI flag for vite framework', async () => {
      const { buildServerCommand } = await import('../server-manager')
      const result = buildServerCommand('bun run dev', { type: 'cli-flag', flag: '--port' }, 3456)
      expect(result.command).toBe('bun run dev -- --port 3456')
      expect(result.env).toEqual({})
    })

    test('sets PORT env var for CRA framework', async () => {
      const { buildServerCommand } = await import('../server-manager')
      const result = buildServerCommand('npm run start', { type: 'env' }, 3456)
      expect(result.command).toBe('npm run start')
      expect(result.env).toEqual({ PORT: '3456' })
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/main/__tests__/server-manager.test.ts`
Expected: FAIL — `server-manager` module does not exist

- [ ] **Step 3: Create `src/main/server-manager.ts`**

```typescript
import { type ChildProcess, spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { log } from '../shared/logger'
import type { PortOverrideMethod, ProjectScan } from '../shared/types'

const logger = log.child('server-manager')

const MAX_PORT_ATTEMPTS = 11
const HEALTH_CHECK_INITIAL_MS = 500
const HEALTH_CHECK_MAX_MS = 4000
const HEALTH_CHECK_TIMEOUT_MS = 30_000
const KILL_TIMEOUT_MS = 5000

type ManagedServer = {
  refCount: number
  port: number
  process: ChildProcess
  url: string
}

class ServerManager {
  private servers = new Map<string, ManagedServer>()

  /**
   * Start (or reuse) a dev server for the given project.
   * Returns the URL the server is listening on.
   * Increments refCount — caller MUST call release() when done.
   */
  async acquire(cwd: string, scan: ProjectScan): Promise<{ url: string; port: number }> {
    const existing = this.servers.get(cwd)
    if (existing) {
      existing.refCount++
      logger.info(`Reusing server for ${cwd} (refCount=${existing.refCount})`)
      return { url: existing.url, port: existing.port }
    }

    if (!scan.devCommand) {
      throw new Error('No dev command detected. Use manual server mode instead.')
    }

    const port = await findFreePort(scan.detectedPort ?? 3000)
    const overrideMethod = scan.portOverrideMethod ?? { type: 'env' as const }
    const { command, env } = buildServerCommand(scan.devCommand, overrideMethod, port)

    logger.info(`Starting server: ${command} (port ${port})`)

    const child = spawn(command, [], {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'pipe',
      shell: true, // shell: true accepts command as a single string
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      logger.debug(`[server:${port}] ${chunk.toString().trim()}`)
    })

    const url = `http://localhost:${port}`

    // Wait for server to be ready
    await waitForServer(url, child)

    const managed: ManagedServer = { refCount: 1, port, process: child, url }
    this.servers.set(cwd, managed)

    logger.info(`Server ready at ${url}`)
    return { url, port }
  }

  /**
   * Decrement refCount for a project's server.
   * Stops the server when refCount reaches 0.
   */
  release(cwd: string): void {
    const server = this.servers.get(cwd)
    if (!server) return

    server.refCount--
    logger.info(`Released server for ${cwd} (refCount=${server.refCount})`)

    if (server.refCount <= 0) {
      this.killServer(cwd, server)
    }
  }

  /** Kill all managed servers. Called on app quit. */
  killAll(): void {
    for (const [cwd, server] of this.servers) {
      this.killServer(cwd, server)
    }
  }

  private killServer(cwd: string, server: ManagedServer): void {
    logger.info(`Stopping server on port ${server.port}`)
    this.servers.delete(cwd)

    try {
      server.process.kill('SIGTERM')
    } catch {
      // already dead
    }

    // Force-kill after timeout
    setTimeout(() => {
      try {
        if (!server.process.killed) {
          server.process.kill('SIGKILL')
        }
      } catch {
        // already dead
      }
    }, KILL_TIMEOUT_MS)
  }
}

// ── Exported helpers (also used in tests) ──

/**
 * Build a shell command with port override.
 *
 * NOTE: The `--` separator before the flag is required because `devCommand`
 * is typically an npm/bun script (e.g. `bun run dev`). The `--` passes
 * subsequent args through to the underlying tool (vite, next, etc.).
 * If the devCommand runs the tool directly (e.g. `vite`), the extra `--`
 * is harmless — most CLI parsers ignore it.
 */
export function buildServerCommand(
  devCommand: string,
  overrideMethod: PortOverrideMethod,
  port: number,
): { command: string; env: Record<string, string> } {
  if (overrideMethod.type === 'cli-flag') {
    return {
      command: `${devCommand} -- ${overrideMethod.flag} ${port}`,
      env: {},
    }
  }
  return {
    command: devCommand,
    env: { PORT: String(port) },
  }
}

export async function findFreePort(startPort: number): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i
    if (port > 65535) break
    const inUse = await checkPort(port)
    if (!inUse) return port
  }
  throw new Error(
    `Could not find a free port starting from ${startPort} (tried ${MAX_PORT_ATTEMPTS} ports)`,
  )
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection({ port, host: '127.0.0.1' })
    conn.on('connect', () => {
      conn.destroy()
      resolve(true)
    })
    conn.on('error', () => resolve(false))
    conn.setTimeout(500, () => {
      conn.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  const start = Date.now()
  let delay = HEALTH_CHECK_INITIAL_MS

  while (Date.now() - start < HEALTH_CHECK_TIMEOUT_MS) {
    // Check if child process died
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited with code ${child.exitCode} before becoming ready`)
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok || response.status < 500) {
        return // Server is ready
      }
    } catch {
      // Not ready yet — retry
    }

    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, HEALTH_CHECK_MAX_MS)
  }

  throw new Error(`Dev server did not respond at ${url} within ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`)
}

export const serverManager = new ServerManager()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/main/__tests__/server-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `bun run lint`
Expected: PASS (fix any issues)

- [ ] **Step 6: Commit**

```bash
git add src/main/server-manager.ts src/main/__tests__/server-manager.test.ts
git commit -m "feat(test): add ServerManager for dev server lifecycle"
```

---

## Chunk 2: TestManager Batch Orchestration and IPC

### Task 4: Add `startBatch` to TestManager

**Files:**
- Modify: `src/main/test-manager.ts:181-247` (startExploration), `src/main/test-manager.ts:421-467` (buildPrompt)
- Modify: `src/main/db.ts:124-140` (schema)

- [ ] **Step 1: Add `batch_id` column to the DB schema**

In `src/main/db.ts`, in the `test_explorations` CREATE TABLE statement, add after the `id` column:

```sql
      batch_id TEXT,
```

Also add a migration for existing databases. After the CREATE TABLE/INDEX statements (before `return db`), add:

```typescript
  // Migration: add batch_id column to test_explorations
  const explorationCols = db.pragma('table_info(test_explorations)') as Array<{ name: string }>
  if (!explorationCols.some((c) => c.name === 'batch_id')) {
    db.exec('ALTER TABLE test_explorations ADD COLUMN batch_id TEXT')
  }
```

- [ ] **Step 2: Add `autoStartServer` to `startExploration` config**

In `src/main/test-manager.ts`, update the `startExploration` method's config type (around line 181):

```typescript
  async startExploration(config: {
    cwd: string
    url: string
    goal: string
    mode: ExplorationMode
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    projectScan?: ProjectScan
    batchId?: string         // NEW
    autoStartServer?: boolean // NEW
  }): Promise<TestExploration> {
```

Update the exploration object creation to include `batchId`:

```typescript
    const exploration: TestExploration = {
      id,
      batchId: config.batchId ?? null,  // NEW
      cwd: config.cwd,
      // ... rest unchanged
```

Update the DB INSERT to include `batch_id`:

```sql
INSERT INTO test_explorations (id, batch_id, cwd, url, goal, mode, requirements, e2e_output_path, e2e_path_reason, status, started_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

And add `config.batchId ?? null` to the `.run()` args.

- [ ] **Step 3: Add `startBatch` method to TestManager**

Add this method to the TestManager class, after `startExploration`:

```typescript
  // Track pending batch completion callbacks
  private batchCompletionCallbacks = new Map<string, { remaining: number; cwd: string }>()

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
    if (config.autoStartServer && config.projectScan) {
      try {
        const { url } = await serverManager.acquire(config.cwd, config.projectScan)
        serverUrl = url
      } catch (err) {
        logger.error('Failed to start server:', err)
        throw new Error(`Server startup failed: ${String(err)}`)
      }
    }

    const effectiveUrl = serverUrl || config.projectScan?.detectedUrl || `http://localhost:3000`

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
      ).run(id, batchId, config.cwd, effectiveUrl, goal, config.mode, config.requirements || null, config.e2eOutputPath, config.e2ePathReason || null, 'pending', now)

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
      }).catch((err) => {
        logger.error(`Exploration ${exploration.id} failed:`, err)
      }).finally(() => {
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
```

Add the import at the top of the file:

```typescript
import { serverManager } from './server-manager'
```

- [ ] **Step 4: Update `buildPrompt` for server mode awareness**

In the `buildPrompt` method, update the server status section (around line 438):

Replace the existing `config.projectScan` block with:

```typescript
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
```

Update the `buildPrompt` config type to include `autoStartServer`:

```typescript
  private buildPrompt(config: {
    url: string
    goal: string
    mode: ExplorationMode
    requirements?: string
    projectScan?: ProjectScan
    autoStartServer?: boolean  // NEW
  }): string {
```

And pass it through from `runExploration`:

```typescript
    const prompt = this.buildPrompt({ ...config, projectScan: config.projectScan, autoStartServer: config.autoStartServer })
```

Also update `runExploration`'s config type to include `autoStartServer`:

```typescript
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
      autoStartServer?: boolean  // NEW
    },
  ): Promise<void> {
```

- [ ] **Step 5: Update `rowToExploration` to include `batchId`**

In the `rowToExploration` method, add:

```typescript
  private rowToExploration(row: Record<string, unknown>): TestExploration {
    return {
      id: row.id as string,
      batchId: (row.batch_id as string) ?? null,  // NEW
      cwd: row.cwd as string,
      // ... rest unchanged
```

- [ ] **Step 6: Register cleanup on app quit**

In `src/main/test-manager.ts`, add `app` to the existing electron import at the top of the file:

```typescript
import { app } from 'electron'
```

Then update the `setWindow` method:

```typescript
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
```

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (or only errors in files not yet updated — preload, ipc-handlers)

- [ ] **Step 8: Commit**

```bash
git add src/main/test-manager.ts src/main/db.ts
git commit -m "feat(test): add batch orchestration and server-managed explorations"
```

---

### Task 5: Wire up IPC handler and preload

**Files:**
- Modify: `src/main/ipc-handlers.ts:500-570`
- Modify: `src/preload/index.ts:100-130`

- [ ] **Step 1: Add `startBatch` IPC handler**

In `src/main/ipc-handlers.ts`, add after the existing `TEST_START_EXPLORATION` handler (after line 521):

```typescript
  ipcMain.handle(
    IPC.TEST_START_BATCH,
    async (
      _e,
      args: {
        cwd: string
        goals: string[]
        agentCount: number
        mode: string
        requirements?: string
        e2eOutputPath: string
        e2ePathReason?: string
        autoStartServer: boolean
        projectScan?: import('../shared/types').ProjectScan
      },
    ) => {
      const { testManager } = await import('./test-manager')
      return testManager.startBatch({
        ...args,
        mode: args.mode as 'manual' | 'requirements',
      })
    },
  )
```

- [ ] **Step 2: Add `startBatch` to preload API**

In `src/preload/index.ts`, add after the existing `startExploration` method (after line 109):

```typescript
  startBatch: (args: {
    cwd: string
    goals: string[]
    agentCount: number
    mode: string
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    autoStartServer: boolean
    projectScan?: unknown
  }) => ipcRenderer.invoke(IPC.TEST_START_BATCH, args),
```

- [ ] **Step 3: Update preload type declarations**

In `src/preload/index.d.ts`, add the `startBatch` method to the `Window['api']` type. Look for where `startExploration` is declared and add after it:

```typescript
  startBatch: (args: {
    cwd: string
    goals: string[]
    agentCount: number
    mode: string
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    autoStartServer: boolean
    projectScan?: unknown
  }) => Promise<import('../shared/types').TestExploration[]>
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(test): wire startBatch IPC handler and preload bridge"
```

---

## Chunk 3: Store and UI Updates

### Task 6: Update test-store with batch support

**Files:**
- Modify: `src/renderer/src/store/test-store.ts`

- [ ] **Step 1: Add `agentCount`, `autoStartServer`, and `startBatch` to the store**

In `src/renderer/src/store/test-store.ts`, add to the `TestStore` type:

```typescript
  // Concurrency
  agentCount: number
  autoStartServer: boolean
  // Actions
  setAgentCount: (count: number) => void
  setAutoStartServer: (enabled: boolean) => void
  startBatch: (cwd: string, config: BatchConfig) => Promise<void>
```

Add the `BatchConfig` type above the store:

```typescript
type BatchConfig = {
  goals: string[]
  agentCount: number
  mode: ExplorationMode
  requirements?: string
  e2eOutputPath: string
  e2ePathReason?: string
  autoStartServer: boolean
  projectScan?: ProjectScan
}
```

Add initial state values:

```typescript
  agentCount: 1,
  autoStartServer: true,
```

Add the action implementations:

```typescript
  setAgentCount: (count) => set({ agentCount: Math.max(1, Math.min(5, count)) }),

  setAutoStartServer: (enabled) => set({ autoStartServer: enabled }),

  startBatch: async (cwd, config) => {
    try {
      const explorations = await window.api.startBatch({
        cwd,
        goals: config.goals,
        agentCount: config.agentCount,
        mode: config.mode,
        requirements: config.requirements,
        e2eOutputPath: config.e2eOutputPath,
        e2ePathReason: config.e2ePathReason,
        autoStartServer: config.autoStartServer,
        projectScan: config.projectScan,
      })

      set((s) => {
        const newStreamingTexts = { ...s.streamingTexts }
        const newFindings = { ...s.findingsByExploration }
        const newTests = { ...s.testsByExploration }

        for (const exp of explorations) {
          newStreamingTexts[exp.id] = ''
          newFindings[exp.id] = []
          newTests[exp.id] = []
        }

        return {
          explorations: [...explorations, ...s.explorations],
          selectedExplorationId: explorations[0]?.id ?? s.selectedExplorationId,
          streamingTexts: newStreamingTexts,
          findingsByExploration: newFindings,
          testsByExploration: newTests,
        }
      })
    } catch (err) {
      console.error('startBatch failed:', err)
    }
  },
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/test-store.ts
git commit -m "feat(test): add agentCount, autoStartServer, and startBatch to test store"
```

---

### Task 7: Update TestView — Server Section with auto-start toggle

**Files:**
- Modify: `src/renderer/src/pages/TestView.tsx:356-451` (ServerSection)

- [ ] **Step 1: Simplify ServerSection with auto-start toggle**

Replace the `ServerSectionProps` type and the `ServerSection` component:

```tsx
type ServerSectionProps = {
  projectScan: import('../../../shared/types').ProjectScan | null
  scanLoading: boolean
  autoStartServer: boolean
  onSetAutoStartServer: (enabled: boolean) => void
  customUrl: string | null
  onSetCustomUrl: (url: string | null) => void
}

function ServerSection({
  projectScan,
  scanLoading,
  autoStartServer,
  onSetAutoStartServer,
  customUrl,
  onSetCustomUrl,
}: ServerSectionProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [inputValue, setInputValue] = useState(customUrl ?? '')

  const handleToggleCustom = () => {
    if (showCustomInput) {
      setShowCustomInput(false)
      onSetCustomUrl(null)
      onSetAutoStartServer(true)
      setInputValue('')
    } else {
      setShowCustomInput(true)
      onSetAutoStartServer(false)
      setInputValue(customUrl ?? '')
    }
  }

  const handleCustomUrlChange = (v: string) => {
    setInputValue(v)
    onSetCustomUrl(v || null)
  }

  return (
    <div className="border-stone-800 border-b p-3">
      <h3 className="mb-2 font-semibold text-stone-400 text-xs uppercase tracking-wider">Server</h3>

      {scanLoading && (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Scanning project...</span>
        </div>
      )}

      {!scanLoading && !showCustomInput && projectScan && !projectScan.error && (
        <div className="space-y-1">
          {projectScan.framework && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-300">{projectScan.framework}</span>
              {projectScan.detectedUrl && (
                <span className="truncate text-stone-500">{projectScan.detectedUrl}</span>
              )}
            </div>
          )}
          {autoStartServer && projectScan.devCommand && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
              <span className="text-blue-400">Auto-start enabled</span>
            </div>
          )}
          {!autoStartServer && !showCustomInput && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-stone-500" />
              <span className="text-stone-400">Manual mode</span>
            </div>
          )}
        </div>
      )}

      {!scanLoading && !showCustomInput && (!projectScan || projectScan.error) && (
        <p className="text-stone-500 text-xs">
          {projectScan?.error ? projectScan.error : 'No project selected'}
        </p>
      )}

      {showCustomInput && (
        <input
          type="url"
          value={inputValue}
          onChange={(e) => handleCustomUrlChange(e.target.value)}
          placeholder="https://localhost:3000"
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-blue-500 focus:outline-none"
        />
      )}

      <button
        type="button"
        onClick={handleToggleCustom}
        className="mt-2 text-blue-400 text-xs transition-colors hover:text-blue-300"
      >
        {showCustomInput ? 'Use auto-start server' : 'Use custom URL'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update the `TestView` component to pass new props**

In the `TestView` root component, destructure the new store values:

```tsx
  const {
    // ... existing destructuring ...
    autoStartServer,
    agentCount,
    setAutoStartServer,
    setAgentCount,
    startBatch,
  } = useTestStore()
```

Update the `ServerSection` usage:

```tsx
        <ServerSection
          projectScan={projectScan}
          scanLoading={scanLoading}
          autoStartServer={autoStartServer}
          onSetAutoStartServer={setAutoStartServer}
          customUrl={customUrl}
          onSetCustomUrl={setCustomUrl}
        />
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/TestView.tsx
git commit -m "feat(test): update ServerSection with auto-start toggle"
```

---

### Task 8: Add agent count selector to LaunchButtons

**Files:**
- Modify: `src/renderer/src/pages/TestView.tsx:631-672` (LaunchButtons)

- [ ] **Step 1: Update LaunchButtons with agent count dropdown**

Update the `LaunchButtonsProps` type and component:

```tsx
type LaunchButtonsProps = {
  canStart: boolean
  hasProject: boolean
  hasUrl: boolean
  agentCount: number
  onSetAgentCount: (count: number) => void
  onStart: () => void
  onAutoExplore: () => void
}

function LaunchButtons({
  canStart,
  hasProject,
  hasUrl,
  agentCount,
  onSetAgentCount,
  onStart,
  onAutoExplore,
}: LaunchButtonsProps) {
  const autoExploreEnabled = hasProject && hasUrl

  return (
    <div className="space-y-2 border-stone-800 border-b p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-500 disabled:bg-stone-700 disabled:text-stone-500"
        >
          <Play className="h-4 w-4" />
          Start
        </button>
        <div className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1.5">
          <span className="text-stone-500 text-xs">Agents</span>
          <select
            value={agentCount}
            onChange={(e) => onSetAgentCount(Number(e.target.value))}
            className="appearance-none bg-transparent pr-1 text-center text-sm text-stone-100 focus:outline-none"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={onAutoExplore}
        disabled={!autoExploreEnabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-medium text-sm text-stone-300 transition-colors hover:bg-stone-700 disabled:opacity-40"
      >
        <Zap className="h-4 w-4 text-yellow-400" />
        Auto-explore everything
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update LaunchButtons usage in TestView**

Pass the new props:

```tsx
        <LaunchButtons
          canStart={canStart}
          hasProject={!!selectedProject}
          hasUrl={!!effectiveUrl}
          agentCount={agentCount}
          onSetAgentCount={setAgentCount}
          onStart={handleStart}
          onAutoExplore={handleAutoExplore}
        />
```

- [ ] **Step 3: Update `handleStart` and `handleAutoExplore` to always use `startBatch`**

Replace both handlers in `TestView`. Using `startBatch` for ALL paths ensures server management is always active (fixing the original wrong-target bug even for single-goal runs):

```tsx
  const handleStart = () => {
    if (!canStart || !selectedProject || !effectiveUrl) return
    const selectedGoalTexts = suggestedGoals.filter((g) => g.selected).map((g) => g.title)
    const allGoals = [...selectedGoalTexts, ...customGoals]

    if (allGoals.length === 0) return // canStart guard should prevent this, but be safe
    // Always use startBatch — even for single goals — so server management is always active
    startBatch(selectedProject, {
      goals: allGoals,
      agentCount,
      mode,
      e2eOutputPath: e2ePath,
      e2ePathReason: e2eReason,
      autoStartServer,
      projectScan: projectScan ?? undefined,
    })
  }

  const handleAutoExplore = () => {
    if (!selectedProject || !effectiveUrl) return
    startBatch(selectedProject, {
      goals: ['Explore the entire application freely, testing all accessible pages and interactions'],
      agentCount: 1,
      mode: 'manual',
      e2eOutputPath: e2ePath,
      e2ePathReason: e2eReason,
      autoStartServer,
      projectScan: projectScan ?? undefined,
    })
  }
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/TestView.tsx
git commit -m "feat(test): add agent count selector to launch buttons"
```

---

### Task 9: Add goal-source pill to findings

**Files:**
- Modify: `src/renderer/src/pages/TestView.tsx:859-916` (ExplorationDetail), `src/renderer/src/pages/TestView.tsx:977-1021` (FindingCard)

- [ ] **Step 1: Add `goalText` prop to FindingCard**

Update the `FindingCard` component to accept and display a goal pill:

```tsx
function FindingCard({
  finding,
  goalText,
}: {
  finding: import('../../../shared/types').TestFinding
  goalText?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = SEVERITY_ICONS[finding.severity]

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-800/50 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-stone-400" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-medium text-xs ${SEVERITY_COLORS[finding.severity]}`}
            >
              {finding.severity}
            </span>
            {goalText && (
              <span className="truncate rounded bg-stone-700/60 px-1.5 py-0.5 text-[10px] text-stone-400">
                {goalText}
              </span>
            )}
            <span className="truncate font-medium text-sm text-stone-100">{finding.title}</span>
          </div>
          {/* ... rest of FindingCard unchanged ... */}
```

- [ ] **Step 2: Pass `goalText` from ExplorationDetail**

In the `ExplorationDetail` component, when mapping findings, pass the exploration goal:

```tsx
          <div className="space-y-2">
            {findings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                goalText={exploration.goal.length > 50 ? `${exploration.goal.slice(0, 50)}...` : exploration.goal}
              />
            ))}
          </div>
```

- [ ] **Step 3: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/TestView.tsx
git commit -m "feat(test): add goal-source pill to finding cards"
```

---

### Task 10: Add unified batch findings view

**Files:**
- Modify: `src/renderer/src/pages/TestView.tsx` (ExplorationDetail area)
- Modify: `src/renderer/src/store/test-store.ts`

- [ ] **Step 1: Add `batchFindings` computed helper to the store**

In `src/renderer/src/store/test-store.ts`, add a helper method to the store that aggregates findings across all explorations in the same batch:

```typescript
  getBatchFindings: (batchId: string) => {
    const state = get()
    const batchExplorations = state.explorations.filter((e) => e.batchId === batchId)
    const allFindings: Array<TestFinding & { goalText: string }> = []

    for (const exp of batchExplorations) {
      const findings = state.findingsByExploration[exp.id] ?? []
      for (const f of findings) {
        allFindings.push({
          ...f,
          goalText: exp.goal.length > 50 ? `${exp.goal.slice(0, 50)}...` : exp.goal,
        })
      }
    }

    return allFindings
  },
```

Add the action signature to the `TestStore` type:

```typescript
  getBatchFindings: (batchId: string) => Array<TestFinding & { goalText: string }>
```

- [ ] **Step 2: Add batch findings tab to ExplorationDetail**

In `ExplorationDetail`, when the selected exploration has a `batchId`, add a toggle to switch between "This exploration" and "All in batch" views. Use Zustand selectors (not `getState()`) so the UI reactively updates as new findings arrive from other explorations in the batch:

```tsx
  const [viewMode, setViewMode] = useState<'single' | 'batch'>('single')

  // Use reactive selectors so batch findings update as explorations complete
  const batchFindings = useTestStore((s) => {
    if (!exploration.batchId) return null
    return s.getBatchFindings(exploration.batchId)
  })
  const batchExplorationCount = useTestStore((s) => {
    if (!exploration.batchId) return 0
    return s.explorations.filter((e) => e.batchId === exploration.batchId).length
  })

  // Show toggle only if this exploration belongs to a batch with multiple explorations
  const showBatchToggle = exploration.batchId && batchExplorationCount > 1
```

Add the toggle UI above the findings list:

```tsx
  {showBatchToggle && (
    <div className="mb-2 flex items-center gap-1 rounded-lg bg-stone-800 p-0.5">
      <button
        type="button"
        onClick={() => setViewMode('single')}
        className={`rounded px-2 py-1 text-xs ${
          viewMode === 'single'
            ? 'bg-stone-700 text-stone-100'
            : 'text-stone-400 hover:text-stone-300'
        }`}
      >
        This exploration
      </button>
      <button
        type="button"
        onClick={() => setViewMode('batch')}
        className={`rounded px-2 py-1 text-xs ${
          viewMode === 'batch'
            ? 'bg-stone-700 text-stone-100'
            : 'text-stone-400 hover:text-stone-300'
        }`}
      >
        All in batch ({batchFindings?.length ?? 0})
      </button>
    </div>
  )}
```

Then conditionally render either `findings` (single mode) or `batchFindings` (batch mode):

```tsx
  const displayFindings = viewMode === 'batch' && batchFindings ? batchFindings : findings
```

Map over `displayFindings` instead of `findings`, passing `goalText`:

```tsx
  {displayFindings.map((f) => (
    <FindingCard
      key={f.id}
      finding={f}
      goalText={'goalText' in f ? f.goalText : (exploration.goal.length > 50 ? `${exploration.goal.slice(0, 50)}...` : exploration.goal)}
    />
  ))}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/TestView.tsx src/renderer/src/store/test-store.ts
git commit -m "feat(test): add unified batch findings view with goal-source pills"
```

---

## Chunk 4: Final Integration and Verification

### Task 11: Final typecheck, lint, and test pass

**Files:** All modified files

- [ ] **Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 2: Run full lint**

Run: `bun run lint`
Expected: PASS with no warnings. Fix any issues.

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: PASS with no failures

- [ ] **Step 4: Fix any issues found**

Address any typecheck, lint, or test failures.

- [ ] **Step 5: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix(test): resolve typecheck and lint issues from test explorer improvements"
```
