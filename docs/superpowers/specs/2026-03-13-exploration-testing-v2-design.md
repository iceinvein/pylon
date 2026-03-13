# Exploration Testing V2: Multi-Session, Project Picker, and Automation

## Overview

Evolves the exploration testing feature from a single-session, manual-config tool into a multi-session, project-aware, AI-automated testing platform. Users select a project, Claude auto-detects the dev server and suggests testing goals from repo analysis, and multiple explorations can run concurrently with switchable views.

## Goals

1. **Explicit project context** — project picker dropdown replaces implicit tab-based `cwd`
2. **Multi-session** — run multiple explorations simultaneously, switch between them
3. **Server auto-detection** — deterministic pre-scan finds framework, dev command, port
4. **AI goal suggestions** — Claude analyzes the repo and proposes testable areas
5. **Progressive automation** — default path requires minimal human input; every step has manual override

## Non-Goals

- Running explorations across different projects simultaneously in the same view (one project selected at a time, but multiple explorations within that project)
- Managing dev server lifecycle from the UI (agent handles starting via Bash tool)
- Replacing the existing exploration backend; this is a UI/store/prompt evolution

## Architecture

### Two-Phase Intelligence

**Phase 1: Instant pre-scan (deterministic, <100ms)**

New file `src/main/project-scanner.ts`. Runs synchronously when a project is selected.

```ts
type ProjectScan = {
  framework: string | null        // 'next' | 'vite' | 'remix' | 'cra' | 'astro' | null
  devCommand: string | null       // 'bun run dev'
  detectedPort: number | null     // from config, .env, or framework defaults
  detectedUrl: string | null      // full URL: 'http://localhost:3000'
  packageManager: string | null   // 'bun' | 'npm' | 'yarn' | 'pnpm'
  serverRunning: boolean          // check if port is already listening
  routeFiles: string[]            // discovered route/page entry points (capped at 50)
  hasPlaywrightConfig: boolean
  docsFiles: string[]             // README.md, docs/*.md paths found
  error: string | null            // non-null if scan failed (permissions, corrupted package.json)
}
```

Detects framework from `package.json` dependencies. Detects package manager from lockfiles (`bun.lock` → bun, `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm, else npm). Finds dev command from `package.json` scripts (prefers `dev`, falls back to `start`, `serve`), prefixed with detected package manager. Reads port from framework config files (`vite.config.ts`, `next.config.js`, `.env`). Constructs `detectedUrl` as `http://localhost:{port}`. Checks if port is already in use via `net.createConnection`. Scans for route files (capped at 50 entries) and docs files.

On filesystem errors (permissions, missing/corrupted files), returns a partial `ProjectScan` with `error` set rather than throwing.

**Phase 2: Claude deep analysis (agent-driven, background)**

A lightweight Claude `query()` call with the pre-scan results as context. Claude reads README, docs, route files, and component structure, then calls a `report_goals` MCP tool to send suggested testing areas back to the UI.

This runs as a separate short-lived agent call — not the exploration itself. The exploration agent starts only when the user clicks Start.

**Goal suggestion cancellation:** The `TestManager` maintains an `AbortController` for the active goal suggestion call, keyed by project path. When `suggestGoals()` is called for a new project (or `selectProject` changes), any in-flight suggestion call is aborted before starting the new one. The `query()` call receives the `AbortSignal` and cancels cleanly.

### New MCP Tool: `report_goals`

Registered on the goal-suggestion agent call. Schema:

```ts
{
  name: 'report_goals',
  inputSchema: {
    type: 'object',
    properties: {
      goals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            area: { type: 'string' }   // e.g. 'auth', 'dashboard', 'api'
          },
          required: ['id', 'title', 'description']
        }
      }
    },
    required: ['goals']
  }
}
```

### Modified Exploration Prompt

`buildPrompt()` in `test-manager.ts` receives pre-scan results and includes them as agent context:

```
Project: Next.js app at /Users/.../my-webapp
Dev command: bun run dev (port 3000)
Server status: not running — start it before navigating
Route files found: app/page.tsx, app/dashboard/page.tsx, app/auth/login/page.tsx
Selected testing goals:
1. Auth flow (login, signup, reset)
2. Dashboard charts + filters
```

The agent can start the dev server via its existing Bash tool access if needed.

## Store Changes

### `test-store.ts` — Full Rewrite

Current single-exploration state becomes per-exploration Records (plain objects, not Maps — avoids Zustand reference-equality pitfalls with Map mutations):

```ts
type SuggestedGoal = {
  id: string
  title: string
  description: string
  area?: string
  selected: boolean
}

type TestStore = {
  // Project context
  selectedProject: string | null
  projects: Array<{ path: string; lastUsed: number }>

  // Project scan results
  projectScan: ProjectScan | null
  scanLoading: boolean

  // AI goal suggestions
  suggestedGoals: SuggestedGoal[]
  goalsLoading: boolean
  customGoals: string[]

  // Server override
  customUrl: string | null   // null = use detected URL, string = manual override

  // Multi-exploration state
  selectedExplorationId: string | null
  explorations: TestExploration[]
  streamingTexts: Record<string, string>           // explorationId → streaming text
  findingsByExploration: Record<string, TestFinding[]>  // explorationId → findings
  testsByExploration: Record<string, string[]>     // explorationId → test paths

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
  deleteExploration: (id: string) => Promise<void>
  handleExplorationUpdate: (data: ExplorationUpdate) => void
  handleGoalSuggestion: (data: GoalSuggestionUpdate) => void
}
```

**Key changes from v1:**
- `Record<string, T>` instead of `Map<string, T>` — spreading a Record creates a new object, triggering Zustand re-renders correctly. Maps require explicit `new Map(prev)` on every mutation which is error-prone.
- `handleExplorationUpdate` keys into Records by `explorationId` instead of overwriting single state.
- `handleGoalSuggestion` is a separate handler for goal updates (see IPC section).
- Switching explorations changes `selectedExplorationId`; the detail panel reads from the Records for that ID.

### State Reset on Project Switch

When `selectProject(cwd)` is called:
1. Abort any in-flight goal suggestion call
2. Reset: `suggestedGoals: []`, `customGoals: []`, `projectScan: null`, `goalsLoading: false`, `customUrl: null`
3. Trigger `scanProject(cwd)` and `suggestGoals(cwd)` for the new project
4. Reload `explorations` for the new project (existing explorations for previous project are not lost in DB, just not displayed)
5. Clear `selectedExplorationId` (but do NOT clear `streamingTexts`/`findingsByExploration`/`testsByExploration` — running explorations from the previous project may still be streaming updates; the Records are keyed by ID so no conflicts)

### Deletion of Running Explorations

`deleteExploration(id)` must:
1. Check if the exploration is running (`explorations.find(e => e.id === id)?.status === 'running'`)
2. If running, call `stopExploration(id)` first and wait for it to resolve
3. Clean up Record entries: remove `streamingTexts[id]`, `findingsByExploration[id]`, `testsByExploration[id]`
4. Remove from `explorations` list
5. If `selectedExplorationId === id`, clear selection
6. Delete from DB via IPC

## IPC Changes

### New Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `TEST_SCAN_PROJECT` | renderer → main | Trigger project pre-scan, returns `ProjectScan` |
| `TEST_SUGGEST_GOALS` | renderer → main | Trigger AI goal analysis (fire-and-forget) |
| `TEST_GOAL_SUGGESTION` | main → renderer | Streams goal suggestions back to renderer |

Goal suggestions use a **separate IPC channel** (`TEST_GOAL_SUGGESTION`) rather than overloading `TEST_EXPLORATION_UPDATE`. This avoids making `explorationId` optional on `ExplorationUpdate` (which would break existing handling logic) and follows the pattern where PR reviews have their own `GH_REVIEW_UPDATE` channel.

### New Types

```ts
type GoalSuggestionUpdate = {
  cwd: string                    // which project these goals are for (guards against stale updates)
  goals: Array<{ id: string; title: string; description: string; area?: string }>
  status: 'loading' | 'done' | 'error'
  error?: string
}
```

### `ExplorationUpdate` — Unchanged

The existing `ExplorationUpdate` type with required `explorationId: string` remains unchanged.

### New Preload API Methods

```ts
scanProject(cwd: string): Promise<ProjectScan>
suggestGoals(cwd: string): Promise<void>              // fire-and-forget
onGoalSuggestion(cb: (data: GoalSuggestionUpdate) => void): () => void  // subscription
```

### Existing API — Reused

Project list uses the existing `FOLDER_LIST_PROJECTS` channel via `window.api.listProjects()`, which delegates to `sessionManager.getProjectFolders()`. The return type `Array<{ path: string; lastUsed: number }>` matches the existing implementation.

## UI Changes

### TestView Layout (Revised)

```
+---------------------+----------------------------------+
| [Project Picker v]  |                                  |
| ~/path/to/project   |  Detail panel for selected       |
|---------------------|  exploration (streaming text,     |
| Server              |  findings, generated tests)      |
| v Next.js on :3000  |                                  |
| . Running           |  OR                              |
|---------------------|                                  |
| What to Test        |  Empty state (onboarding)        |
| @ Analyzing...      |                                  |
| [x] Auth flow       |                                  |
| [x] Dashboard       |                                  |
| [ ] Settings        |                                  |
| [+ Custom goal]     |                                  |
|---------------------|                                  |
| > Advanced          |                                  |
|---------------------|                                  |
| [> Start]           |                                  |
| [z Auto-explore]    |                                  |
|---------------------|                                  |
| > Running (2)       |                                  |
|   * checkout-flow   |                                  |
|   * dashboard-test  |                                  |
| > Completed (3)     |                                  |
|   o login-tests     |                                  |
+---------------------+----------------------------------+
```

### Config Form Sections

**Project picker** — Dropdown at top, populated from `window.api.listProjects()` (reuses existing `FOLDER_LIST_PROJECTS` channel). Shows folder basename as label, full path below. Selecting triggers pre-scan + goal suggestion + exploration list reload + state reset.

**Server section** — Shows pre-scan results immediately. Three states:
- Detected, not running: Shows framework + command. Agent starts server when exploration begins.
- Already running: Green status dot, auto-populated URL.
- Manual override: "Use Custom URL" link toggles to text input.

Port status is re-checked at exploration start time (not just at scan time) since the server state may have changed between scan and launch.

**What to Test section** — While analyzing, shows spinner. Once done, shows checkable goal list. User can toggle goals, add custom goals via text input, or select all.

**Advanced section** — Collapsed by default. Contains e2e output path (auto-resolved) and exploration strategy toggle (Open Explore vs Requirements).

**Launch buttons**:
- "Start Exploration" — uses selected/custom goals
- "Auto-explore everything" — maps to `mode: 'manual'` with a generic goal of "Explore the entire application freely, testing all accessible pages and interactions." Ignores goal selections.

**Exploration list** — Below config form. Grouped: Running first (pulse indicator), then Completed. Each row shows goal text (truncated), status dot, findings count. Clicking selects in detail panel. Delete button is disabled while exploration is running (must stop first).

### Config Form Behavior

The config form is **never disabled** by running explorations. It always represents a new exploration. Starting one adds it to the running list and auto-selects it.

## New Files

| File | Purpose |
|------|---------|
| `src/main/project-scanner.ts` | Deterministic project pre-scan |
| `src/main/__tests__/project-scanner.test.ts` | Tests for project scanner |

## Modified Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `ProjectScan`, `SuggestedGoal`, `GoalSuggestionUpdate` types |
| `src/shared/ipc-channels.ts` | Add `TEST_SCAN_PROJECT`, `TEST_SUGGEST_GOALS`, `TEST_GOAL_SUGGESTION` channels |
| `src/main/test-manager.ts` | Add `scanProject()`, `suggestGoals()` methods with AbortController; modify `buildPrompt()` to include pre-scan context |
| `src/main/test-tools.ts` | Add `createReportGoalsTool()` |
| `src/main/ipc-handlers.ts` | Add handlers for new channels |
| `src/preload/index.ts` | Add `scanProject`, `suggestGoals`, `onGoalSuggestion` API methods |
| `src/preload/index.d.ts` | Add type declarations for new API methods |
| `src/renderer/src/store/test-store.ts` | Full rewrite: project state, Records for multi-exploration, goal state, separate goal suggestion handler |
| `src/renderer/src/pages/TestView.tsx` | Full rewrite: project picker, server section, goal section, advanced collapse, multi-exploration list |
| `src/renderer/src/hooks/use-test-bridge.ts` | Add second IPC subscription for `onGoalSuggestion` channel |

## Edge Cases

### Goal Suggestion Cost Tracking

The goal suggestion Claude call is lightweight but not free. Token usage from the `query()` response is logged via the existing logger but not surfaced in the UI or attributed to any exploration. This is intentional — goal suggestions are a project-level cost, not an exploration-level cost.

### Port Status Staleness

The pre-scan checks if the detected port is in use at scan time. By the time the user starts an exploration (potentially minutes later), the server may have started or stopped. To mitigate:
- The exploration agent's prompt includes the pre-scan server status as a hint, not a guarantee
- The agent verifies the server is reachable before navigating (part of its normal Playwright flow)
- If the server is not running, the agent starts it using the detected `devCommand`

### Concurrent Explorations Across Project Switches

When the user switches projects, running explorations from the previous project continue in the background. Their streaming updates still flow into `streamingTexts`/`findingsByExploration`/`testsByExploration` Records (keyed by exploration ID, no conflicts). However, they are not visible in the exploration list (which filters by selected project). If the user switches back to the original project, the list reloads from DB and the running exploration reappears.

## Testing Strategy

- `project-scanner.test.ts` — unit tests for framework detection, port parsing, route file discovery, package manager detection, error handling
- Existing `e2e-path-resolver.test.ts` — unchanged, still valid
- Manual testing for the full flow: project select → scan → goals → start → switch between explorations

## Migration

No database schema changes needed. The existing `test_explorations` and `test_findings` tables work as-is. The `cwd` column in `test_explorations` already supports filtering by project. Store changes are purely in-memory (Zustand).
