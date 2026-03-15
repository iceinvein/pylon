# Test Explorer Improvements

Three changes to the test explorer: Pylon-managed dev server lifecycle, port-aware server management, and parallel exploration with a concurrency slider.

## Problem

The test explorer has three issues:

1. **Wrong target** — The project scanner detects frameworks by reading `package.json` and maps them to default ports (e.g., `vite -> 5173`). Pylon's own electron-vite renderer dev server runs on port 5173. When `checkPortInUse(5173)` succeeds, it reports "server running" and the Playwright agent navigates to Pylon's UI instead of the user's web app.
2. **No port management** — No awareness of which ports are occupied or by what process. Multiple explorations could collide on the same port.
3. **No parallel agents** — Each exploration runs a single Claude agent. There is no way to run multiple agents concurrently, one per testing goal.

## Solution

### 1. Server Lifecycle Manager

A new module `src/main/server-manager.ts` that starts, health-checks, and stops dev servers for test explorations. This eliminates the port confusion bug entirely — the agent always gets a URL that Pylon started and verified.

**Flow:**

1. `startServer(cwd, projectScan)` reads `devCommand` from the scan result
2. Finds a free port: starts from `detectedPort`, increments if taken, max 10 attempts
3. Spawns the dev server process with the port override (env var or CLI flag depending on framework)
4. Polls `http://localhost:<port>` with retries until it gets an HTTP response. Polling schedule: initial 500ms, doubling each attempt, capped at 4s per attempt, 30s total timeout.
5. Returns `{ port, url, childProcess }`
6. `stopServer(port)` kills the child process and confirms the port is freed

**Reference counting:** The ServerManager tracks how many active explorations use each server via a `Map<string, { refCount: number, port: number, process: ChildProcess }>` keyed by `cwd`. When `refCount` drops to 0, the server is stopped. This handles both batch completion and overlapping batches naturally — a second batch reuses the existing server and increments `refCount`.

**Framework-specific port override:**

| Framework | Override method |
|-----------|----------------|
| vite | `--port <N>` CLI flag |
| next | `-p <N>` CLI flag |
| remix | `--port <N>` CLI flag |
| cra | `PORT=<N>` env var |
| angular | `--port <N>` CLI flag |
| nuxt | `--port <N>` CLI flag |
| svelte | `--port <N>` CLI flag |
| sveltekit | `--port <N>` CLI flag |
| astro | `--port <N>` CLI flag |
| default | `PORT=<N>` env var |

**Cleanup guarantees:**

- Single tracking map: `Map<string, { refCount: number, port: number, process: ChildProcess }>` keyed by `cwd`. This consolidates lifecycle management (refcount), port tracking, and process cleanup into one structure.
- When `refCount` drops to 0, the server is stopped
- On Electron `before-quit`, all entries are killed as a safety net
- `SIGTERM` first, `SIGKILL` after 5s timeout

### 2. Parallel Exploration with Concurrency Slider

**Concurrency model:** Simple fan-out. The user selects 1-5 agents via a dropdown next to the Launch buttons. Clicking "Start Exploration" spawns one exploration per selected goal, up to the agent count concurrently. Excess goals queue and start as earlier ones finish.

**Batch orchestration:** A new IPC method `startBatch` is added. The renderer sends the full list of goals and the agent count in a single IPC call to `test-manager.ts`. The TestManager:

1. Calls `serverManager.startServer(cwd, projectScan)` once (or reuses existing server via refcount)
2. Creates a concurrency-limited runner: takes the goal list, creates explorations for each, runs up to `agentCount` simultaneously using a simple semaphore (array of promises, `Promise.race` to fill slots as they complete)
3. When all explorations finish (or are stopped), decrements the server refcount

This keeps orchestration in the main process where it belongs. The renderer calls one IPC method and receives individual `ExplorationUpdate` events per exploration as they stream.

**Overlapping batches:** If the user starts a second batch while the first is running, the server is reused (refcount increments). Both batches' explorations run independently. Each batch's concurrency limit applies only to its own goals.

**Shared server:** All parallel agents share one dev server instance. Exploratory testing is read-only (navigating, clicking, observing), so concurrent access is safe.

**Each agent gets its own Playwright browser.** Each `runExploration` spawns its own Playwright MCP server (`bunx @playwright/mcp@latest --headless`), meaning each agent gets an independent headless Chromium instance. This is intentional — agents navigate independently and would conflict if sharing a browser. With 5 agents, expect ~5 headless browser processes.

**UI placement:** The agent count selector sits next to the "Start Exploration" button:

```
[Start Exploration]  Agents [1 v]
[Auto-explore everything]
```

Dropdown offers 1-5. Default is 1 (backward compatible).

**Store changes:** `test-store.ts` gains `agentCount: number` (default 1) and `setAgentCount` action. A new `startBatch` action calls the `startBatch` IPC method, passing all goals and the agent count. The old `startExploration` still works for single-goal runs.

**Unified findings view:** All parallel explorations' findings appear in a single combined list in the right panel. Each finding gets a small pill showing its source goal text. This is a renderer-side merge: the component collects all `findingsByExploration` entries whose exploration IDs are in the current batch, flattening them into one list sorted by creation time. The exploration list on the left still shows individual runs for drill-down.

### 3. Prompt and Server Section Updates

**Prompt changes in `buildPrompt()`:**

- The URL passed to the prompt is the real verified URL from the Server Manager (e.g., `http://localhost:5847`)
- When auto-start is on: `"The dev server has been started for you at {url}. Do not attempt to start or stop the server."`
- When manual mode is on: `"Navigate to {url} to test the application. The server is managed externally."` (no mention of starting/stopping)

**Server section UI simplification:**

The current Server section shows a green/yellow "Running/Not running" dot based on `checkPortInUse`. This becomes a toggle:

- **Auto-start server** (default on) — Pylon manages the server. UI shows detected framework and dev command as informational text.
- **Manual server** — User provides their own URL. Pylon skips server management. For staging environments or custom setups.

## File Changes

### New files

| File | Purpose |
|------|---------|
| `src/main/server-manager.ts` | Dev server lifecycle: start, health-check, stop, port discovery |

### Modified files

| File | Change |
|------|--------|
| `src/main/test-manager.ts` | Integrate ServerManager: start server before `runExploration`, pass real URL to prompt, stop server in `finally`. Update `buildPrompt()` to tell agent not to manage servers. Support batch of concurrent explorations sharing one server. |
| `src/main/project-scanner.ts` | Export framework-to-port-flag mapping for ServerManager to consume. |
| `src/shared/types.ts` | Add `portOverrideMethod` to `ProjectScan` as a discriminated union: `{ type: 'env' } \| { type: 'cli-flag'; flag: string }`. Add `autoStartServer: boolean` to exploration config. Add `batchId: string \| null` to `TestExploration` for grouping parallel runs. Make `ExplorationUpdate.status` optional (tool-originated updates like `report_finding` send updates without status). |
| `src/renderer/src/store/test-store.ts` | Add `agentCount` state (default 1) and `setAgentCount` action. Add `startBatch` action that calls the `startBatch` IPC method with all goals and agent count. Existing `startExploration` retained for single-goal runs. |
| `src/renderer/src/pages/TestView.tsx` | Add agent count dropdown next to Launch buttons. Simplify Server section with auto-start toggle. Add goal-source pill to findings in detail view. |
| `src/preload/index.ts` | Expose `startBatch` IPC method via contextBridge. |
| `src/main/ipc-handlers.ts` | Add `startBatch` IPC handler that delegates to TestManager's batch orchestration. |

### Unchanged files

| File | Reason |
|------|--------|
| `src/main/test-tools.ts` | Each exploration already gets its own tool context |
| `src/renderer/src/hooks/use-test-bridge.ts` | Already handles updates keyed by exploration ID |
| `src/main/e2e-path-resolver.ts` | Unrelated to server/port management |

## Key Decisions

1. **Pylon manages the server, not the agent.** Zero agent tokens wasted on server startup. Deterministic lifecycle with guaranteed cleanup.
2. **All parallel agents share one server.** Read-only testing is safe to share. Avoids spinning up N dev servers.
3. **Agent count resets to 1 on app restart.** Stored in Zustand only, not persisted to SQLite settings. Keeps it lightweight.
4. **Port discovery tries default + 10.** If all 11 ports are taken, fails with a clear error message rather than trying indefinitely.
5. **SIGTERM then SIGKILL.** Graceful shutdown first, forced kill after 5s. Prevents zombie processes.
