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
4. Polls `http://localhost:<port>` with retries (max ~30s, exponential backoff) until it gets an HTTP response
5. Returns `{ port, url, childProcess }`
6. `stopServer(port)` kills the child process and confirms the port is freed

**Framework-specific port override:**

| Framework | Override method |
|-----------|----------------|
| vite | `--port <N>` CLI flag |
| next | `-p <N>` CLI flag |
| remix | `--port <N>` CLI flag |
| cra | `PORT=<N>` env var |
| angular | `--port <N>` CLI flag |
| nuxt | `--port <N>` CLI flag |
| default | `PORT=<N>` env var |

**Cleanup guarantees:**

- Server processes tracked in a `Map<number, ChildProcess>` keyed by port
- Killed in `finally` blocks when explorations end (done/stopped/error)
- Killed on Electron `before-quit` event as a safety net
- `SIGTERM` first, `SIGKILL` after 5s timeout

### 2. Parallel Exploration with Concurrency Slider

**Concurrency model:** Simple fan-out. The user selects 1-5 agents via a dropdown next to the Launch buttons. Clicking "Start Exploration" spawns one exploration per selected goal, up to the agent count concurrently. Excess goals queue and start as earlier ones finish.

**Shared server:** All parallel agents share one dev server instance. Exploratory testing is read-only (navigating, clicking, observing), so concurrent access is safe. The Server Manager starts one server before the first exploration and stops it after all explorations in the batch complete.

**UI placement:** The agent count selector sits next to the "Start Exploration" button:

```
[Start Exploration]  Agents [1 v]
[Auto-explore everything]
```

Dropdown offers 1-5. Default is 1 (backward compatible).

**Store changes:** `test-store.ts` gains `agentCount: number` (default 1) and `setAgentCount` action. The existing `startExploration` action is called N times from the renderer — one per goal. No new IPC channels needed.

**Unified findings view:** All parallel explorations' findings appear in a single combined list in the right panel. Each finding gets a small pill showing its source goal text. The exploration list on the left still shows individual runs for drill-down.

### 3. Prompt and Server Section Updates

**Prompt changes in `buildPrompt()`:**

- The URL passed to the prompt is the real verified URL from the Server Manager (e.g., `http://localhost:5847`)
- New line added: `"The dev server has been started for you. Do not attempt to start or stop the server."`

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
| `src/shared/types.ts` | Add `portOverrideMethod` field to `ProjectScan` (either `'env'` or `'cli-flag'` with the flag string). |
| `src/renderer/src/store/test-store.ts` | Add `agentCount` state (default 1) and `setAgentCount` action. Update `startExploration` to fan out one call per goal up to `agentCount`. |
| `src/renderer/src/pages/TestView.tsx` | Add agent count dropdown next to Launch buttons. Simplify Server section with auto-start toggle. Add goal-source pill to findings in detail view. |

### Unchanged files

| File | Reason |
|------|--------|
| `src/main/test-tools.ts` | Each exploration already gets its own tool context |
| `src/renderer/src/hooks/use-test-bridge.ts` | Already handles updates keyed by exploration ID |
| `src/main/e2e-path-resolver.ts` | Unrelated to server/port management |
| `src/main/ipc-handlers.ts` | No new IPC channels — fan-out happens renderer-side |

## Key Decisions

1. **Pylon manages the server, not the agent.** Zero agent tokens wasted on server startup. Deterministic lifecycle with guaranteed cleanup.
2. **All parallel agents share one server.** Read-only testing is safe to share. Avoids spinning up N dev servers.
3. **Agent count resets to 1 on app restart.** Stored in Zustand only, not persisted to SQLite settings. Keeps it lightweight.
4. **Port discovery tries default + 10.** If all 11 ports are taken, fails with a clear error message rather than trying indefinitely.
5. **SIGTERM then SIGKILL.** Graceful shutdown first, forced kill after 5s. Prevents zombie processes.
