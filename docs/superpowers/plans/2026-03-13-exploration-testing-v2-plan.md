# Exploration Testing V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve exploration testing into a multi-session, project-aware, AI-automated platform with server auto-detection and goal suggestions.

**Architecture:** Two-phase intelligence (deterministic pre-scan + AI goal analysis), per-exploration Records in Zustand, dedicated IPC channels for goal suggestions, project picker reusing existing `listProjects()`.

**Tech Stack:** Electron, React 19, Zustand, better-sqlite3, Claude Agent SDK, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-exploration-testing-v2-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `src/main/project-scanner.ts` | Deterministic project pre-scan: framework detection, package manager, dev command, port, route files, docs files |
| `src/main/__tests__/project-scanner.test.ts` | Unit tests for project scanner |

### Modified Files
| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `ProjectScan`, `SuggestedGoal`, `GoalSuggestionUpdate` types |
| `src/shared/ipc-channels.ts` | Add 3 new channel constants |
| `src/main/test-manager.ts` | Add `scanProject()`, `suggestGoals()` with AbortController, modify `buildPrompt()`, `startExploration()` signature |
| `src/main/test-tools.ts` | Add `createReportGoalsTool()` |
| `src/main/ipc-handlers.ts` | Add 2 new IPC handlers |
| `src/preload/index.ts` | Add `scanProject`, `suggestGoals`, `onGoalSuggestion` |
| `src/preload/index.d.ts` | Add type declarations |
| `src/renderer/src/store/test-store.ts` | Full rewrite: project state, Records for multi-exploration, goal handlers |
| `src/renderer/src/hooks/use-test-bridge.ts` | Add second IPC subscription for goal suggestions |
| `src/renderer/src/pages/TestView.tsx` | Full rewrite: project picker, server section, goal section, multi-exploration list |

---

## Chunk 1: Shared Types, IPC Channels, and Project Scanner

### Task 1: Add shared types

**Files:**
- Modify: `src/shared/types.ts` (after line 460, after `ExplorationUpdate`)

- [ ] **Step 1: Add ProjectScan, SuggestedGoal, and GoalSuggestionUpdate types**

Append after the closing `}` of `ExplorationUpdate` (line 460):

```ts
export type ProjectScan = {
  framework: string | null
  devCommand: string | null
  detectedPort: number | null
  detectedUrl: string | null
  packageManager: string | null
  serverRunning: boolean
  routeFiles: string[]
  hasPlaywrightConfig: boolean
  docsFiles: string[]
  error: string | null
}

export type SuggestedGoal = {
  id: string
  title: string
  description: string
  area?: string
  selected: boolean
}

export type GoalSuggestionUpdate = {
  cwd: string
  goals: Array<{ id: string; title: string; description: string; area?: string }>
  status: 'loading' | 'done' | 'error'
  error?: string
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add ProjectScan, SuggestedGoal, GoalSuggestionUpdate types"
```

### Task 2: Add IPC channel constants

**Files:**
- Modify: `src/shared/ipc-channels.ts` (add after line 77, before `} as const`)

- [ ] **Step 1: Add 3 new channel constants**

Add after `TEST_EXPLORATION_UPDATE: 'test:exploration-update',` (line 77) and before `} as const` (line 78):

```ts
  TEST_SCAN_PROJECT: 'test:scan-project',
  TEST_SUGGEST_GOALS: 'test:suggest-goals',
  TEST_GOAL_SUGGESTION: 'test:goal-suggestion',
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(ipc): add TEST_SCAN_PROJECT, TEST_SUGGEST_GOALS, TEST_GOAL_SUGGESTION channels"
```

### Task 3: Create project scanner with tests

**Files:**
- Create: `src/main/project-scanner.ts`
- Create: `src/main/__tests__/project-scanner.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/main/__tests__/project-scanner.test.ts`. Follow the same temp-dir pattern used in `src/main/__tests__/e2e-path-resolver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProject } from '../project-scanner'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `scan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('scanProject', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns defaults for empty directory', () => {
    const result = scanProject(tmpDir)
    expect(result.framework).toBeNull()
    expect(result.devCommand).toBeNull()
    expect(result.detectedPort).toBeNull()
    expect(result.detectedUrl).toBeNull()
    expect(result.packageManager).toBeNull()
    expect(result.serverRunning).toBe(false)
    expect(result.routeFiles).toEqual([])
    expect(result.hasPlaywrightConfig).toBe(false)
    expect(result.docsFiles).toEqual([])
    expect(result.error).toBeNull()
  })

  test('detects Next.js from package.json dependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'next dev' },
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('next')
    expect(result.detectedPort).toBe(3000)
    expect(result.detectedUrl).toBe('http://localhost:3000')
  })

  test('detects Vite from package.json devDependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { vite: '^5.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('vite')
    expect(result.detectedPort).toBe(5173)
  })

  test('detects bun package manager from bun.lock', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    writeFileSync(join(tmpDir, 'bun.lock'), '')
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('bun')
    expect(result.devCommand).toBe('bun run dev')
  })

  test('detects yarn package manager from yarn.lock', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    writeFileSync(join(tmpDir, 'yarn.lock'), '')
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('yarn')
    expect(result.devCommand).toBe('yarn run dev')
  })

  test('detects pnpm package manager from pnpm-lock.yaml', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '')
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('pnpm')
    expect(result.devCommand).toBe('pnpm run dev')
  })

  test('defaults to npm when no lockfile found', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('npm')
    expect(result.devCommand).toBe('npm run dev')
  })

  test('prefers dev script over start and serve', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node index.js', dev: 'next dev', serve: 'serve' } }),
    )
    const result = scanProject(tmpDir)
    expect(result.devCommand).toContain('dev')
  })

  test('falls back to start when no dev script', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node index.js' } }),
    )
    const result = scanProject(tmpDir)
    expect(result.devCommand).toContain('start')
  })

  test('detects port from .env file', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.js' } }))
    writeFileSync(join(tmpDir, '.env'), 'PORT=4000\nOTHER=value')
    const result = scanProject(tmpDir)
    expect(result.detectedPort).toBe(4000)
    expect(result.detectedUrl).toBe('http://localhost:4000')
  })

  test('detects Playwright config', () => {
    writeFileSync(join(tmpDir, 'playwright.config.ts'), 'export default {}')
    const result = scanProject(tmpDir)
    expect(result.hasPlaywrightConfig).toBe(true)
  })

  test('finds README.md in docsFiles', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# Hello')
    const result = scanProject(tmpDir)
    expect(result.docsFiles).toContain('README.md')
  })

  test('finds docs/ directory files', () => {
    mkdirSync(join(tmpDir, 'docs'))
    writeFileSync(join(tmpDir, 'docs', 'guide.md'), '# Guide')
    const result = scanProject(tmpDir)
    expect(result.docsFiles).toContain('docs/guide.md')
  })

  test('finds route files for Next.js app/ directory', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0' } }),
    )
    mkdirSync(join(tmpDir, 'app', 'dashboard'), { recursive: true })
    writeFileSync(join(tmpDir, 'app', 'page.tsx'), 'export default function() {}')
    writeFileSync(join(tmpDir, 'app', 'dashboard', 'page.tsx'), 'export default function() {}')
    const result = scanProject(tmpDir)
    expect(result.routeFiles.length).toBeGreaterThanOrEqual(2)
  })

  test('caps routeFiles at 50 entries', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { next: '^14.0.0' } }))
    const appDir = join(tmpDir, 'app')
    mkdirSync(appDir)
    for (let i = 0; i < 60; i++) {
      const subDir = join(appDir, `page-${i}`)
      mkdirSync(subDir)
      writeFileSync(join(subDir, 'page.tsx'), `export default function P${i}() {}`)
    }
    const result = scanProject(tmpDir)
    expect(result.routeFiles.length).toBeLessThanOrEqual(50)
  })

  test('returns error for corrupted package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ invalid json !!!}')
    const result = scanProject(tmpDir)
    expect(result.error).not.toBeNull()
    // Should still return partial results, not throw
    expect(result.framework).toBeNull()
  })

  test('detects Remix from dependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'remix dev' },
        dependencies: { '@remix-run/react': '^2.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('remix')
  })

  test('detects CRA from react-scripts dependency', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { start: 'react-scripts start' },
        dependencies: { 'react-scripts': '^5.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('cra')
    expect(result.detectedPort).toBe(3000)
  })

  test('detects Astro from dependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'astro dev' },
        dependencies: { astro: '^4.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('astro')
    expect(result.detectedPort).toBe(4321)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/main/__tests__/project-scanner.test.ts`
Expected: FAIL — `scanProject` does not exist yet

- [ ] **Step 3: Implement the project scanner**

Create `src/main/project-scanner.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createConnection } from 'node:net'
import type { ProjectScan } from '../shared/types'

const FRAMEWORK_DEPS: Record<string, { name: string; defaultPort: number }> = {
  next: { name: 'next', defaultPort: 3000 },
  vite: { name: 'vite', defaultPort: 5173 },
  '@remix-run/react': { name: 'remix', defaultPort: 5173 },
  '@remix-run/dev': { name: 'remix', defaultPort: 5173 },
  astro: { name: 'astro', defaultPort: 4321 },
  'react-scripts': { name: 'cra', defaultPort: 3000 },
  nuxt: { name: 'nuxt', defaultPort: 3000 },
  '@angular/core': { name: 'angular', defaultPort: 4200 },
  svelte: { name: 'svelte', defaultPort: 5173 },
  '@sveltejs/kit': { name: 'sveltekit', defaultPort: 5173 },
}

const ROUTE_PATTERNS: Record<string, string[]> = {
  next: ['app/**/page.tsx', 'app/**/page.jsx', 'app/**/page.ts', 'app/**/page.js', 'pages/**/*.tsx', 'pages/**/*.jsx', 'src/app/**/page.tsx', 'src/pages/**/*.tsx'],
  remix: ['app/routes/**/*.tsx', 'app/routes/**/*.jsx'],
  nuxt: ['pages/**/*.vue'],
  angular: ['src/app/**/*.component.ts'],
  sveltekit: ['src/routes/**/+page.svelte'],
  default: ['src/pages/**/*', 'src/routes/**/*', 'src/views/**/*'],
}

const ROUTE_FILE_CAP = 50

export function scanProject(cwd: string): ProjectScan {
  const result: ProjectScan = {
    framework: null,
    devCommand: null,
    detectedPort: null,
    detectedUrl: null,
    packageManager: null,
    serverRunning: false,
    routeFiles: [],
    hasPlaywrightConfig: false,
    docsFiles: [],
    error: null,
  }

  // Detect package manager from lockfiles
  result.packageManager = detectPackageManager(cwd)

  // Parse package.json
  let pkg: Record<string, unknown> | null = null
  try {
    const pkgPath = join(cwd, 'package.json')
    if (existsSync(pkgPath)) {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    }
  } catch (err) {
    result.error = `Failed to parse package.json: ${String(err)}`
  }

  if (pkg) {
    // Detect framework
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    }
    for (const [depName, info] of Object.entries(FRAMEWORK_DEPS)) {
      if (deps[depName]) {
        result.framework = info.name
        result.detectedPort = info.defaultPort
        break
      }
    }

    // Detect dev command
    const scripts = pkg.scripts as Record<string, string> | undefined
    if (scripts) {
      const scriptName = scripts.dev ? 'dev' : scripts.start ? 'start' : scripts.serve ? 'serve' : null
      if (scriptName && result.packageManager) {
        result.devCommand = `${result.packageManager} run ${scriptName}`
      }
    }
  }

  // Read port from .env
  const envPort = readPortFromEnv(cwd)
  if (envPort) {
    result.detectedPort = envPort
  }

  // Construct URL
  if (result.detectedPort) {
    result.detectedUrl = `http://localhost:${result.detectedPort}`
  }

  // Detect Playwright config
  result.hasPlaywrightConfig =
    existsSync(join(cwd, 'playwright.config.ts')) ||
    existsSync(join(cwd, 'playwright.config.js')) ||
    existsSync(join(cwd, 'playwright.config.mjs'))

  // Find docs files
  result.docsFiles = findDocsFiles(cwd)

  // Find route files
  result.routeFiles = findRouteFiles(cwd, result.framework)

  return result
}

/** Check if a port is in use. Returns a Promise — call separately and assign to result. */
export function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection({ port, host: '127.0.0.1' })
    conn.on('connect', () => {
      conn.destroy()
      resolve(true)
    })
    conn.on('error', () => {
      resolve(false)
    })
    conn.setTimeout(500, () => {
      conn.destroy()
      resolve(false)
    })
  })
}

function detectPackageManager(cwd: string): string | null {
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  // Only default to npm if there's a package.json (otherwise no package manager)
  if (existsSync(join(cwd, 'package.json'))) return 'npm'
  return null
}

function readPortFromEnv(cwd: string): number | null {
  try {
    const envPath = join(cwd, '.env')
    if (!existsSync(envPath)) return null
    const content = readFileSync(envPath, 'utf-8')
    const match = content.match(/^PORT\s*=\s*(\d+)/m)
    if (match) return parseInt(match[1], 10)
  } catch {
    // ignore
  }
  return null
}

function findDocsFiles(cwd: string): string[] {
  const docs: string[] = []

  // Check for README
  for (const name of ['README.md', 'readme.md', 'README.MD']) {
    if (existsSync(join(cwd, name))) {
      docs.push(name)
      break
    }
  }

  // Check for docs/ directory
  const docsDir = join(cwd, 'docs')
  if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
    try {
      const files = readdirSync(docsDir, { recursive: false })
      for (const file of files) {
        const fileName = String(file)
        if (fileName.endsWith('.md')) {
          docs.push(`docs/${fileName}`)
        }
      }
    } catch {
      // ignore
    }
  }

  return docs
}

function findRouteFiles(cwd: string, framework: string | null): string[] {
  const patterns = framework && ROUTE_PATTERNS[framework]
    ? ROUTE_PATTERNS[framework]
    : ROUTE_PATTERNS.default
  const files: string[] = []

  for (const pattern of patterns) {
    // Parse glob pattern: "app/**/page.tsx" → baseDir="app", filePattern="page.tsx"
    // "src/routes/**/*" → baseDir="src/routes", filePattern="*" (match all)
    const parts = pattern.split('/**/')
    const baseDir = join(cwd, parts[0])
    const filePattern = parts.length > 1 ? parts[1] : '*'
    if (!existsSync(baseDir)) continue

    collectFiles(baseDir, cwd, filePattern, files)
    if (files.length >= ROUTE_FILE_CAP) break
  }

  return files.slice(0, ROUTE_FILE_CAP)
}

function matchesFilePattern(fileName: string, pattern: string): boolean {
  if (pattern === '*') return true
  // Handle patterns like "*.tsx" or "page.tsx" or "+page.svelte"
  if (pattern.startsWith('*')) {
    return fileName.endsWith(pattern.slice(1))
  }
  return fileName === pattern
}

function collectFiles(dir: string, cwd: string, filePattern: string, out: string[]): void {
  if (out.length >= ROUTE_FILE_CAP) return
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (out.length >= ROUTE_FILE_CAP) return
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip node_modules, .git, .next etc.
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        collectFiles(fullPath, cwd, filePattern, out)
      } else if (entry.isFile() && matchesFilePattern(entry.name, filePattern)) {
        out.push(relative(cwd, fullPath))
      }
    }
  } catch {
    // ignore permission errors
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/main/__tests__/project-scanner.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full verification**

Run: `bun run typecheck && bun run lint && bun test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/main/project-scanner.ts src/main/__tests__/project-scanner.test.ts
git commit -m "feat: add project scanner with framework/port/route detection"
```

---

## Chunk 2: Test Manager Updates and IPC Wiring

### Task 4: Add report_goals MCP tool

**Files:**
- Modify: `src/main/test-tools.ts` (append after `createSavePlaywrightTestTool`)

- [ ] **Step 1: Add createReportGoalsTool function**

Append to `src/main/test-tools.ts`:

```ts
type GoalToolContext = {
  cwd: string
  window: BrowserWindow | null
}

export function createReportGoalsTool(ctx: GoalToolContext) {
  return {
    name: 'report_goals',
    description:
      'Report suggested testing goals based on your analysis of the project. Call this once after analyzing the codebase structure, README, docs, and route files.',
    inputSchema: {
      type: 'object',
      properties: {
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique ID for this goal' },
              title: { type: 'string', description: 'Short title (e.g. "Authentication flow")' },
              description: {
                type: 'string',
                description: 'What to test (e.g. "Login, signup, password reset, session handling")',
              },
              area: { type: 'string', description: 'Category (e.g. "auth", "dashboard", "api")' },
            },
            required: ['id', 'title', 'description'],
          },
        },
      },
      required: ['goals'],
    },
    execute: async (args: Record<string, unknown>) => {
      const goals = args.goals as Array<{
        id: string
        title: string
        description: string
        area?: string
      }>

      ctx.window?.webContents.send(IPC.TEST_GOAL_SUGGESTION, {
        cwd: ctx.cwd,
        goals,
        status: 'done',
      })

      return {
        content: [{ type: 'text', text: `Reported ${goals.length} testing goals` }],
      }
    },
  }
}
```

- [ ] **Step 2: Add IPC import for TEST_GOAL_SUGGESTION**

The `IPC` import at the top of `test-tools.ts` already exists. The new `TEST_GOAL_SUGGESTION` constant was added in Task 2, so it's available. Verify the import covers it.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/test-tools.ts
git commit -m "feat: add createReportGoalsTool MCP tool for goal suggestions"
```

### Task 5: Add suggestGoals and scanProject to TestManager

**Files:**
- Modify: `src/main/test-manager.ts`

- [ ] **Step 1: Add import for project-scanner and new types**

At the top of `test-manager.ts`, add to the existing imports:

```ts
import type { GoalSuggestionUpdate, ProjectScan } from '../shared/types'
import { checkPortInUse, scanProject as runProjectScan } from './project-scanner'
import { createReportGoalsTool } from './test-tools'
```

Note: `createReportGoalsTool` is already imported via `test-tools` — just add it to the existing import if not there. `scanProject` is renamed to `runProjectScan` to avoid collision with the method name.

- [ ] **Step 2: Add goalSuggestionAbort to the class**

Add a new property after `private activeExplorations`:

```ts
private goalSuggestionAbort: AbortController | null = null
```

- [ ] **Step 3: Add scanProject method**

Add after the `resolveE2ePath` method:

```ts
async scanProject(cwd: string): Promise<ProjectScan> {
  const scan = runProjectScan(cwd)

  // Async port check
  if (scan.detectedPort) {
    scan.serverRunning = await checkPortInUse(scan.detectedPort)
  }

  return scan
}
```

- [ ] **Step 4: Add suggestGoals method**

Add after `scanProject`:

```ts
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

  try {
    const scan = runProjectScan(cwd)

    const goalToolCtx = { cwd, window: this.window }
    const reportGoalsTool = createReportGoalsTool(goalToolCtx)

    const toolsServer = createSdkMcpServer({
      name: 'pylon-goal-analysis',
      tools: [
        {
          name: reportGoalsTool.name,
          description: reportGoalsTool.description,
          inputSchema: {},
          handler: (args: Record<string, unknown>) => reportGoalsTool.execute(args),
        },
      ],
    })

    const prompt = this.buildGoalSuggestionPrompt(cwd, scan)

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

    // If the tool wasn't called, send done with empty goals
    if (!abortController.signal.aborted) {
      this.send(IPC.TEST_GOAL_SUGGESTION, {
        cwd,
        goals: [],
        status: 'done',
      } satisfies GoalSuggestionUpdate)
    }
  } catch (err) {
    if (!abortController.signal.aborted) {
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
```

- [ ] **Step 5: Add buildGoalSuggestionPrompt method**

Add as a private method:

```ts
private buildGoalSuggestionPrompt(cwd: string, scan: ProjectScan): string {
  let prompt = `You are analyzing a web application project to suggest testing goals.

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
```

- [ ] **Step 6: Modify buildPrompt to accept ProjectScan context**

Update the `buildPrompt` method signature and body to accept and include scan context. Change the method signature from:

```ts
private buildPrompt(config: {
  url: string
  goal: string
  mode: ExplorationMode
  requirements?: string
}): string {
```

To:

```ts
private buildPrompt(config: {
  url: string
  goal: string
  mode: ExplorationMode
  requirements?: string
  projectScan?: ProjectScan
}): string {
```

Add project context after the existing `Target:` line:

```ts
${config.projectScan ? `
Project Info:
${config.projectScan.framework ? `Framework: ${config.projectScan.framework}` : ''}
${config.projectScan.devCommand ? `Dev command: ${config.projectScan.devCommand}` : ''}
${config.projectScan.serverRunning ? 'Server status: running' : config.projectScan.devCommand ? `Server status: not running — start it with: ${config.projectScan.devCommand}` : ''}
` : ''}
```

- [ ] **Step 7: Update startExploration to accept projectScan**

Add `projectScan?: ProjectScan` to the `startExploration` config parameter and pass it through to `runExploration` and `buildPrompt`.

- [ ] **Step 8: Add a `goalSuggestionReported` flag to prevent duplicate `done` events**

In `suggestGoals`, track whether the `report_goals` tool was called. Add a `let goalToolCalled = false` flag before the `query()` loop. In `createReportGoalsTool`, the tool already sends `status: 'done'` via IPC. After the `query()` loop, only send the fallback `done` event if the tool was NOT called:

```ts
// After the for-await loop:
if (!abortController.signal.aborted && !goalToolCalled) {
  this.send(IPC.TEST_GOAL_SUGGESTION, {
    cwd,
    goals: [],
    status: 'done',
  } satisfies GoalSuggestionUpdate)
}
```

Pass a callback into the tool context or use a closure to set the flag when the tool executes.

- [ ] **Step 9: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/main/test-manager.ts
git commit -m "feat(test-manager): add scanProject, suggestGoals with AbortController, enhanced buildPrompt"
```

### Task 6: Add IPC handlers and preload API

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add IPC handlers**

In `src/main/ipc-handlers.ts`, add after the `TEST_READ_GENERATED_TEST` handler (around line 555):

```ts
  ipcMain.handle(IPC.TEST_SCAN_PROJECT, async (_e, args: { cwd: string }) => {
    const { testManager } = await import('./test-manager')
    return testManager.scanProject(args.cwd)
  })

  ipcMain.handle(IPC.TEST_SUGGEST_GOALS, async (_e, args: { cwd: string }) => {
    const { testManager } = await import('./test-manager')
    // Fire and forget — results come back via TEST_GOAL_SUGGESTION channel
    testManager.suggestGoals(args.cwd).catch((err) => {
      console.error('suggestGoals failed:', err)
    })
    return true
  })
```

- [ ] **Step 2: Add preload API methods**

In `src/preload/index.ts`, add after the `onExplorationUpdate` method (around line 124):

```ts
  scanProject: (cwd: string) => ipcRenderer.invoke(IPC.TEST_SCAN_PROJECT, { cwd }),
  suggestGoals: (cwd: string) => ipcRenderer.invoke(IPC.TEST_SUGGEST_GOALS, { cwd }),
  onGoalSuggestion: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.TEST_GOAL_SUGGESTION, handler)
    return () => ipcRenderer.removeListener(IPC.TEST_GOAL_SUGGESTION, handler)
  },
```

- [ ] **Step 3: Update startExploration preload to pass projectScan**

The existing `startExploration` in `src/preload/index.ts` (around line 108) passes the args object through to the IPC handler. Since it uses spread (`{ cwd, ...config }`), the `projectScan` field from the store will automatically pass through. However, the IPC handler in `src/main/ipc-handlers.ts` must destructure and forward it. Verify the handler at ~line 504 includes `projectScan` in its args type and passes it to `testManager.startExploration()`.

Update the existing `startExploration` handler args type to include:
```ts
projectScan?: import('../shared/types').ProjectScan
```

- [ ] **Step 4: Add new type declarations**

In `src/preload/index.d.ts`, add after the existing test exploration declarations (find the block with `startExploration`, `stopExploration`, etc.):

```ts
  scanProject: (cwd: string) => Promise<import('../shared/types').ProjectScan>
  suggestGoals: (cwd: string) => Promise<void>
  onGoalSuggestion: (
    callback: (data: import('../shared/types').GoalSuggestionUpdate) => void,
  ) => () => void
```

Also update the existing `startExploration` type declaration to include `projectScan?: import('../shared/types').ProjectScan` in its args.

- [ ] **Step 4: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(ipc): add scanProject, suggestGoals handlers and preload API"
```

---

## Chunk 3: Store Rewrite and Bridge Hook

### Task 7: Rewrite test-store for multi-exploration and project state

**Files:**
- Rewrite: `src/renderer/src/store/test-store.ts`

- [ ] **Step 1: Full rewrite of test-store.ts**

Replace the entire file content with the new multi-exploration store. Key changes:
- Add project state (`selectedProject`, `projects`)
- Add scan state (`projectScan`, `scanLoading`)
- Add goal state (`suggestedGoals`, `goalsLoading`, `customGoals`)
- Replace single exploration state with Records (`streamingTexts`, `findingsByExploration`, `testsByExploration`)
- Replace `activeExploration` with `selectedExplorationId`
- Add `handleGoalSuggestion` handler
- Update `handleExplorationUpdate` to key into Records
- Update `deleteExploration` to stop running explorations first and clean up Records
- Add `selectProject` with state reset logic
- Use `Record<string, T>` not `Map<string, T>` for Zustand compatibility

```ts
import { create } from 'zustand'
import type {
  E2ePathResolution,
  ExplorationMode,
  ExplorationUpdate,
  GoalSuggestionUpdate,
  ProjectScan,
  SuggestedGoal,
  TestExploration,
  TestFinding,
} from '../../../shared/types'

type ExplorationConfig = {
  url: string
  goal: string
  mode: ExplorationMode
  requirements?: string
  e2eOutputPath: string
  e2ePathReason?: string
  projectScan?: ProjectScan
}

type TestStore = {
  // Project context
  selectedProject: string | null
  projects: Array<{ path: string; lastUsed: number }>

  // Project scan
  projectScan: ProjectScan | null
  scanLoading: boolean

  // Goal suggestions
  suggestedGoals: SuggestedGoal[]
  goalsLoading: boolean
  customGoals: string[]

  // Server override
  customUrl: string | null

  // Multi-exploration
  selectedExplorationId: string | null
  explorations: TestExploration[]
  streamingTexts: Record<string, string>
  findingsByExploration: Record<string, TestFinding[]>
  testsByExploration: Record<string, string[]>

  // Actions
  loadProjects: () => Promise<void>
  selectProject: (cwd: string) => void
  scanProject: (cwd: string) => Promise<void>
  suggestGoals: (cwd: string) => Promise<void>
  toggleGoal: (goalId: string) => void
  addCustomGoal: (goal: string) => void
  removeCustomGoal: (index: number) => void
  setCustomUrl: (url: string | null) => void
  startExploration: (cwd: string, config: ExplorationConfig) => Promise<void>
  stopExploration: (id: string) => Promise<void>
  selectExploration: (id: string) => void
  loadExplorations: (cwd: string) => Promise<void>
  loadExploration: (id: string) => Promise<void>
  deleteExploration: (id: string) => Promise<void>
  resolveE2ePath: (cwd: string) => Promise<E2ePathResolution>
  readGeneratedTest: (cwd: string, path: string) => Promise<string | null>
  handleExplorationUpdate: (data: ExplorationUpdate) => void
  handleGoalSuggestion: (data: GoalSuggestionUpdate) => void
}

export const useTestStore = create<TestStore>((set, get) => ({
  // Initial state
  selectedProject: null,
  projects: [],
  projectScan: null,
  scanLoading: false,
  suggestedGoals: [],
  goalsLoading: false,
  customGoals: [],
  customUrl: null,
  selectedExplorationId: null,
  explorations: [],
  streamingTexts: {},
  findingsByExploration: {},
  testsByExploration: {},

  loadProjects: async () => {
    try {
      const projects = await window.api.listProjects()
      set({ projects })
    } catch (err) {
      console.error('loadProjects failed:', err)
    }
  },

  selectProject: (cwd) => {
    set({
      selectedProject: cwd,
      projectScan: null,
      scanLoading: false,
      suggestedGoals: [],
      goalsLoading: false,
      customGoals: [],
      customUrl: null,
      selectedExplorationId: null,
    })
    // Trigger async operations
    get().scanProject(cwd)
    get().suggestGoals(cwd)
    get().loadExplorations(cwd)
  },

  scanProject: async (cwd) => {
    set({ scanLoading: true })
    try {
      const scan = await window.api.scanProject(cwd)
      // Only apply if still same project
      if (get().selectedProject === cwd) {
        set({ projectScan: scan, scanLoading: false })
      }
    } catch (err) {
      console.error('scanProject failed:', err)
      if (get().selectedProject === cwd) {
        set({ scanLoading: false })
      }
    }
  },

  suggestGoals: async (cwd) => {
    set({ goalsLoading: true })
    try {
      await window.api.suggestGoals(cwd)
      // Results arrive via handleGoalSuggestion
    } catch (err) {
      console.error('suggestGoals failed:', err)
      if (get().selectedProject === cwd) {
        set({ goalsLoading: false })
      }
    }
  },

  toggleGoal: (goalId) => {
    set((s) => ({
      suggestedGoals: s.suggestedGoals.map((g) =>
        g.id === goalId ? { ...g, selected: !g.selected } : g,
      ),
    }))
  },

  addCustomGoal: (goal) => {
    set((s) => ({ customGoals: [...s.customGoals, goal] }))
  },

  removeCustomGoal: (index) => {
    set((s) => ({ customGoals: s.customGoals.filter((_, i) => i !== index) }))
  },

  setCustomUrl: (url) => set({ customUrl: url }),

  startExploration: async (cwd, config) => {
    try {
      const exploration = await window.api.startExploration({ cwd, ...config })
      set((s) => ({
        explorations: [exploration, ...s.explorations],
        selectedExplorationId: exploration.id,
        streamingTexts: { ...s.streamingTexts, [exploration.id]: '' },
        findingsByExploration: { ...s.findingsByExploration, [exploration.id]: [] },
        testsByExploration: { ...s.testsByExploration, [exploration.id]: [] },
      }))
    } catch (err) {
      console.error('startExploration failed:', err)
    }
  },

  stopExploration: async (id) => {
    try {
      await window.api.stopExploration(id)
    } catch (err) {
      console.error('stopExploration failed:', err)
    }
  },

  selectExploration: (id) => {
    set({ selectedExplorationId: id })
    // Load full data if not already in Records
    const state = get()
    if (!state.findingsByExploration[id]) {
      get().loadExploration(id)
    }
  },

  loadExplorations: async (cwd) => {
    try {
      const explorations = await window.api.listExplorations(cwd)
      set({ explorations })
    } catch (err) {
      console.error('loadExplorations failed:', err)
    }
  },

  loadExploration: async (id) => {
    try {
      const result = await window.api.getExploration(id)
      if (!result) return
      set((s) => ({
        selectedExplorationId: id,
        findingsByExploration: { ...s.findingsByExploration, [id]: result.findings },
        testsByExploration: { ...s.testsByExploration, [id]: result.generatedTestPaths },
        streamingTexts: { ...s.streamingTexts, [id]: '' },
        // Update the exploration in the list if it exists
        explorations: s.explorations.map((e) => (e.id === id ? { ...e, ...result } : e)),
      }))
    } catch (err) {
      console.error('loadExploration failed:', err)
    }
  },

  deleteExploration: async (id) => {
    try {
      // Stop if running
      const exploration = get().explorations.find((e) => e.id === id)
      if (exploration?.status === 'running') {
        await get().stopExploration(id)
      }

      await window.api.deleteExploration(id)
      set((s) => {
        const { [id]: _st, ...restStreaming } = s.streamingTexts
        const { [id]: _fi, ...restFindings } = s.findingsByExploration
        const { [id]: _te, ...restTests } = s.testsByExploration
        return {
          explorations: s.explorations.filter((e) => e.id !== id),
          selectedExplorationId: s.selectedExplorationId === id ? null : s.selectedExplorationId,
          streamingTexts: restStreaming,
          findingsByExploration: restFindings,
          testsByExploration: restTests,
        }
      })
    } catch (err) {
      console.error('deleteExploration failed:', err)
    }
  },

  resolveE2ePath: async (cwd) => {
    return window.api.resolveE2ePath(cwd)
  },

  readGeneratedTest: async (cwd, path) => {
    return window.api.readGeneratedTest(cwd, path)
  },

  handleExplorationUpdate: (data) => {
    set((s) => {
      const id = data.explorationId
      const updates: Partial<TestStore> = {}

      // Update streaming text
      if (data.streamingText !== undefined) {
        updates.streamingTexts = { ...s.streamingTexts, [id]: data.streamingText }
      }

      // Append new findings
      if (data.findings && data.findings.length > 0) {
        const existing = s.findingsByExploration[id] ?? []
        const existingIds = new Set(existing.map((f) => f.id))
        const newFindings = data.findings.filter((f) => !existingIds.has(f.id))
        if (newFindings.length > 0) {
          updates.findingsByExploration = {
            ...s.findingsByExploration,
            [id]: [...existing, ...newFindings],
          }
        }
      }

      // Append new test paths
      if (data.generatedTests && data.generatedTests.length > 0) {
        const existing = s.testsByExploration[id] ?? []
        const existingSet = new Set(existing)
        const newPaths = data.generatedTests.filter((p) => !existingSet.has(p))
        if (newPaths.length > 0) {
          updates.testsByExploration = {
            ...s.testsByExploration,
            [id]: [...existing, ...newPaths],
          }
        }
      }

      // Update exploration in the list
      updates.explorations = s.explorations.map((e) => {
        if (e.id !== id) return e
        const updated = { ...e }
        if (data.status) updated.status = data.status
        if (data.findingsCount !== undefined) updated.findingsCount = data.findingsCount
        if (data.testsGenerated !== undefined) updated.testsGenerated = data.testsGenerated
        if (data.inputTokens !== undefined) updated.inputTokens = data.inputTokens
        if (data.outputTokens !== undefined) updated.outputTokens = data.outputTokens
        if (data.totalCostUsd !== undefined) updated.totalCostUsd = data.totalCostUsd
        if (data.error) updated.errorMessage = data.error
        return updated
      })

      return updates
    })
  },

  handleGoalSuggestion: (data) => {
    set((s) => {
      // Guard against stale updates from a different project
      if (s.selectedProject !== data.cwd) return s

      if (data.status === 'loading') {
        return { goalsLoading: true }
      }

      if (data.status === 'error') {
        return { goalsLoading: false }
      }

      // status === 'done'
      const goals: SuggestedGoal[] = data.goals.map((g) => ({
        ...g,
        selected: true, // default all selected
      }))

      // Merge with any existing goals (in case tool was called multiple times)
      const existingIds = new Set(s.suggestedGoals.map((g) => g.id))
      const newGoals = goals.filter((g) => !existingIds.has(g.id))

      return {
        goalsLoading: false,
        suggestedGoals: newGoals.length > 0 ? [...s.suggestedGoals, ...newGoals] : s.suggestedGoals,
      }
    })
  },
}))
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/test-store.ts
git commit -m "feat(store): rewrite test-store for multi-exploration with Records, project/goal state"
```

### Task 8: Update use-test-bridge hook

**Files:**
- Modify: `src/renderer/src/hooks/use-test-bridge.ts`

- [ ] **Step 1: Add goal suggestion subscription**

Replace the entire file:

```ts
import { useEffect } from 'react'
import type { ExplorationUpdate, GoalSuggestionUpdate } from '../../../shared/types'
import { useTestStore } from '../store/test-store'

export function useTestBridge() {
  const handleExplorationUpdate = useTestStore((s) => s.handleExplorationUpdate)
  const handleGoalSuggestion = useTestStore((s) => s.handleGoalSuggestion)

  useEffect(() => {
    const unsub = window.api.onExplorationUpdate((data) => {
      handleExplorationUpdate(data as ExplorationUpdate)
    })
    return unsub
  }, [handleExplorationUpdate])

  useEffect(() => {
    const unsub = window.api.onGoalSuggestion((data) => {
      handleGoalSuggestion(data as GoalSuggestionUpdate)
    })
    return unsub
  }, [handleGoalSuggestion])
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/use-test-bridge.ts
git commit -m "feat(bridge): add goal suggestion IPC subscription to test bridge"
```

---

## Chunk 4: TestView UI Rewrite

### Task 9: Rewrite TestView with project picker, server section, goals, and multi-exploration

**Files:**
- Rewrite: `src/renderer/src/pages/TestView.tsx`

This is the largest task. The full TestView rewrite includes:

1. **Project picker dropdown** at top of left panel
2. **Server section** showing pre-scan results with 3 states
3. **What to Test section** with AI-suggested checkable goals + custom goal input
4. **Advanced section** (collapsed) with e2e path and strategy toggle
5. **Two launch buttons**: Start Exploration + Auto-explore everything
6. **Exploration list** grouped by running/completed status
7. **Detail panel** reading from per-exploration Records
8. **Updated empty state**

- [ ] **Step 1: Rewrite the TestView component**

Replace the entire `TestView.tsx` file with the new implementation. The key structural changes:

**TestView (root):**
- Calls `loadProjects()` on mount
- Reads from `useTestStore` for all state
- Derives `selectedExploration` from `explorations.find(e => e.id === selectedExplorationId)`
- Derives `streamingText`, `findings`, `tests` from Records using `selectedExplorationId`
- Passes project selection to `selectProject` action
- Handles Start with goals from `suggestedGoals.filter(g => g.selected)` + `customGoals`
- Auto-explore builds a generic goal string

**ProjectPicker:**
- Dropdown using `<select>` or custom popover
- Shows project basename as display, full path as tooltip
- Triggers `selectProject(cwd)` on change

**ServerSection:**
- Shows `projectScan` data when available, spinner while `scanLoading`
- Three visual states: detected+running (green dot), detected+not running (yellow), manual override (text input)
- "Use Custom URL" toggle switches to manual URL input via `setCustomUrl`

**GoalSection:**
- Shows spinner while `goalsLoading`
- Renders `suggestedGoals` as checkboxes with toggle
- Shows `customGoals` list with remove buttons
- Text input + button to add custom goals
- "Select all" / "Deselect all" toggles

**AdvancedSection:**
- Collapsed by default (`useState(false)`)
- E2E output path input (value from `resolveE2ePath` result, auto-populated on project select)
- Exploration strategy toggle (same as current Manual/Requirements)

**ExplorationList:**
- Groups explorations by status: running first, then completed/stopped/error
- Each row: status dot + goal text (truncated) + findings count + delete button (disabled if running)
- Click selects in detail panel

**ExplorationDetail:**
- Reads `streamingTexts[selectedExplorationId]`, `findingsByExploration[selectedExplorationId]`, `testsByExploration[selectedExplorationId]`
- Same layout as current (status bar, streaming panel, findings, generated tests)

The implementer should reference the current `TestView.tsx` for the existing component patterns (FindingCard, GeneratedTestItem, StreamingPanel, etc.) and adapt them. The sub-components for findings, generated tests, and streaming should be kept largely as-is — only the container/layout changes.

**Important implementation notes:**
- The config form is **never disabled** by running explorations
- `canStart` requires: `selectedProject` is set AND (either `customUrl` or `projectScan.detectedUrl`) is truthy AND at least one goal selected or custom goal exists
- For "Auto-explore everything": use `mode: 'manual'`, goal: "Explore the entire application freely, testing all accessible pages and interactions"
- The e2e path should be auto-resolved when project changes (call `resolveE2ePath`)

- [ ] **Step 2: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: Lint may have class-sorting or label warnings. Fix with `bun run lint:fix` if needed.

- [ ] **Step 3: Run lint:fix if needed**

Run: `bun run lint:fix`

- [ ] **Step 4: Run full verification**

Run: `bun run typecheck && bun run lint && bun test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/TestView.tsx
git commit -m "feat(ui): rewrite TestView with project picker, server detection, AI goals, multi-exploration"
```

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: All pass, including new project-scanner tests

- [ ] **Step 2: Verify file count**

Check that all expected files were created/modified:
```bash
git diff --stat HEAD~9  # Should show ~10 files changed
```

---

## Task Dependency Graph

```
Task 1 (types) ──┐
Task 2 (IPC)  ───┤
                  ├──→ Task 3 (scanner + tests) ──→ Task 4 (report_goals tool)
                  │                                        │
                  │                                        ▼
                  │                               Task 5 (test-manager updates)
                  │                                        │
                  │                                        ▼
                  │                               Task 6 (IPC handlers + preload)
                  │                                        │
                  │                                        ▼
                  └───────────────────────────────→ Task 7 (store rewrite)
                                                          │
                                                          ▼
                                                  Task 8 (bridge hook)
                                                          │
                                                          ▼
                                                  Task 9 (TestView rewrite)
                                                          │
                                                          ▼
                                                  Task 10 (verification)
```

**Parallelizable groups:**
- Tasks 1 + 2 (independent, both modify shared/)
- Tasks 3 + 4 (scanner and tool are independent, both depend on Tasks 1+2)
- Task 8 depends on Task 7 (imports `handleGoalSuggestion` from rewritten store)
