# Pylon Architecture Review

**Date:** 2026-03-28
**Codebase:** ~40k lines TypeScript/TSX across ~165 source files, 31 test files
**Stack:** Electron 39, React 19, Zustand, Tailwind CSS 4, SQLite (better-sqlite3)

---

## Architecture Overview

Pylon is an Electron desktop app structured as three isolated processes following `electron-vite` conventions:

```
src/
  main/           Node.js main process (25+ files)
                  Session orchestration, SDK integration, SQLite, git ops, PR review
  preload/        Context bridge (2 files)
                  Typed IPC surface exposed to renderer
  renderer/src/   React 19 browser process
                  Zustand stores, hooks, components
  shared/         Cross-process contracts (6 files)
                  IPC channel names, shared types, logger, model config
```

The overall pattern is **Layered (3-tier)** with an **Event-Driven** communication style over Electron IPC for the main-to-renderer direction. Dependencies flow strictly downward: `main` and `renderer` both import from `shared`, never from each other. Zero cross-boundary imports confirmed by grep scan.

---

## Dependency Graph

```
renderer/
  pages/*         --> components/*, hooks/*, store/*
  hooks/*         --> store/*, lib/*
  components/**   --> store/*
  lib/*           --> store/* (delta-batcher imports session-store directly)

preload/
  index.ts        --> shared/ipc-channels

main/
  index.ts        --> session-manager, ipc-handlers, providers/*, db
  ipc-handlers.ts --> session-manager, db, shared/types (71 handle registrations)
  git-ipc-handlers.ts --> git-*, shared/* (15 handle registrations)
  session-manager --> providers/*, db, shared/ipc-channels, shared/types
  providers/*     --> shared/types, shared/logger
  pr-review-mgr  --> session-manager, db, diff-chunker, gh-cli
  test-manager    --> session-manager, db, shared/types

shared/
  types.ts        <-- leaf: no internal imports
  ipc-channels.ts <-- leaf: no internal imports
  logger.ts       <-- leaf: lazy-loads fs/path
  model-context.ts<-- leaf: no internal imports
  git-types.ts    <-- leaf: no internal imports
```

**Direction:** All dependencies point toward stable abstractions (`shared/*`, `providers/types.ts`). No cycles detected. `shared/` imports nothing from `main/` or `renderer/`.

---

## Pattern Inventory

### 1. Strategy Pattern -- Provider Abstraction

**Where:** `src/main/providers/types.ts:217` (`AgentProvider` type), `src/main/providers/claude-provider.ts:73` (`ClaudeProvider implements AgentProvider`), `src/main/providers/codex-provider.ts` (`CodexProvider`)

`AgentProvider` defines a common interface: `createSession()`, `discoverModels()`, `capabilities`. Two concrete implementations are registered via `registerProvider()` in `src/main/providers/registry.ts:30`. The `SessionManager` consumes only `AgentProvider`/`AgentSession` interfaces.

The normalized event stream (`NormalizedEvent` discriminated union, 12 event kinds) uses a "Hybrid" design: structured data for common events, plus `raw_passthrough` for provider-specific rendering. Documented at `types.ts:1-11`.

**Consistency:** Strong. Uniformly applied. Adding a third provider requires only a new implementation file + `registerProvider()` call.

### 2. Registry Pattern -- Provider & Model Discovery

**Where:** `src/main/providers/registry.ts:19-134`

Module-level `Map<ProviderId, AgentProvider>` with `registerProvider()`, `getProvider()`, `getProviderForModel()`, `getAllModels()`. Model discovery uses 3-tier cache: static catalog, SQLite, live API refresh.

**Consistency:** Strong.

### 3. Observer Pattern -- IPC Event System

**Where:** `src/main/session-manager.ts:80-91` (`onMessage`/`notifyMessageListeners`), `src/main/index.ts:93-98` (`webContents.send`), `src/renderer/src/hooks/use-ipc-bridge.ts`, `use-pr-review-bridge.ts`, `use-git-bridge.ts`, `use-test-bridge.ts`

Bidirectional: renderer invokes via `window.api.methodName()` (request-response), main pushes via `webContents.send()` (events). Each feature domain has a dedicated bridge hook on the renderer side.

**Consistency:** Strong. Four bridge hooks all follow the same subscribe-and-route-to-Zustand pattern.

### 4. Facade Pattern -- IPC Handlers

**Where:** `src/main/ipc-handlers.ts` (71 `ipcMain.handle` calls), `src/main/git-ipc-handlers.ts` (15 calls)

Handler files act as facades: register IPC channels and delegate to underlying services. Renderer sees a flat API surface without knowing the internal service graph.

**Consistency:** Strong. The git handler split (`git-ipc-handlers.ts`) demonstrates a pattern ready to be extended to other domains.

### 5. Singleton Pattern -- Module-Level Instances

**Where:**
- `src/main/session-manager.ts:995` -- `export const sessionManager`
- `src/main/pr-review-manager.ts:1314` -- `export const prReviewManager`
- `src/main/test-manager.ts:775` -- `export const testManager`
- `src/main/server-manager.ts:244` -- `export const serverManager`
- `src/main/pr-polling-service.ts:204` -- `export const prPollingService`

All receive `BrowserWindow` via `.setWindow()` after app init. This creates temporal coupling.

**Consistency:** Uniform across all 5 services.

### 6. Flux Pattern -- Zustand Stores

**Where:** `src/renderer/src/store/session-store.ts`, `tab-store.ts`, `ui-store.ts`, `pr-review-store.ts`, `git-commit-store.ts`, `git-graph-store.ts`, `git-ops-store.ts`, `ast-store.ts`, `test-store.ts`, `draft-store.ts`

Ten Zustand stores, each focused on a single domain. Flat `create<T>((set, get) => ({...}))` pattern. Session-keyed data uses `Map` for dynamic keys.

**Consistency:** Strong.

### 7. Decorator Pattern -- Delta Batcher (Performance)

**Where:** `src/renderer/src/lib/delta-batcher.ts:30` (`DeltaBatcher` class)

Accumulates streaming text deltas outside React. Flushes via `requestAnimationFrame` at ~60fps. Dependency-injected via `DeltaBatcherDeps` type for testability. Separates reusable class from default singleton.

**Consistency:** Strong. Well-engineered and fully tested.

### 8. Dispatcher Pattern -- Tool Rendering

**Where:** `src/renderer/src/components/tools/ToolUseBlock.tsx:38-60`

`getToolInfo()` and `ToolRenderer` dispatch to specific tool components via `if (name.includes(...))` chains. `GenericTool` as fallback.

**Consistency:** Adequate. Works but ordering-dependent (e.g., `todowrite` must be checked before `write`).

### 9. Adapter Pattern -- Normalized Events

**Where:** `src/main/providers/types.ts:80-213`

`NormalizedEvent` union adapts SDK-specific events into common vocabulary. The "Option C Hybrid" carries both normalized structured data and optional `raw` field. Well-documented design decision.

**Consistency:** Strong.

### 10. State Machine Pattern -- Session Status

**Where:** `src/shared/types.ts:1` -- `SessionStatus = 'empty' | 'starting' | 'running' | 'waiting' | 'done' | 'error'`

Status transitions managed by `SessionManager.updateStatus()`. No explicit transition table or invalid-transition enforcement.

**Consistency:** Adequate. Implicit transitions, no guard against invalid state changes.

---

## Smell Inventory

### Warning

**W1: God Object -- `session-manager.ts` (1,639 lines)**

Mixes: session CRUD, SDK orchestration, git worktree management (create/remove/merge/rename -- lines 422-636), diff computation (lines 728-885), permission/question flow, title derivation, PR creation, message persistence, model/effort setters, and context window caching. The dependency graph shows 23 downstream call edges from SessionManager alone.

**W2: God Object -- `pr-review-manager.ts` (1,314 lines)**

Conflates review orchestration, diff chunking, parallel agent spawning, finding extraction, DB persistence, and GitHub posting.

**W3: IPC Handler Monolith -- `ipc-handlers.ts` (842 lines, 71 handles)**

Every new feature adds IPC registrations here. Only git handlers have been extracted to a separate file so far. Merge conflict magnet.

**W4: Hidden Temporal Coupling -- Module Singletons**

All 5 singletons receive `BrowserWindow` via `.setWindow()` at runtime. If called before window init, methods silently drop messages. No fail-fast.

### Info

**I1: Inline Schema Migrations -- `db.ts`**

Column additions use `PRAGMA table_info` checks + `ALTER TABLE` per column. No migration versioning. Currently ~15 individual checks.

**I2: `unknown` Message Types in Session Store**

`session-store.ts:46-53` stores messages as `unknown[]`. Type safety lost at consumption boundary.

**I3: Test Coverage Gap on Core Orchestrators**

31 test files, but `session-manager.ts` (1,639 lines) and `pr-review-manager.ts` (1,314 lines) have zero direct tests. Test coverage strong for `lib/` utilities.

---

## Strengths

**S1: Zero Cross-Boundary Imports.** `shared/` is a pure leaf. Main and renderer never import each other. Confirmed: grep for `from '.*main/'` in `shared/` and `renderer/` returns 0 results. This is the most important invariant in an Electron app.

**S2: Provider Abstraction Is the Architectural Crown Jewel.** `AgentProvider` + `NormalizedEvent` + the Hybrid design (Option C) makes adding SDK providers a one-file operation. The `ProviderCapabilities` type allows the UI to adapt without provider-specific branching.

**S3: Performance-Conscious Streaming.** The `DeltaBatcher` (dependency-injected, fully tested) plus `useSessionStore.getState()` for non-reactive reads in IPC callbacks prevents render storms during high-frequency LLM token streaming.

**S4: Comprehensive IPC Channel Constants.** `IPC` object in `shared/ipc-channels.ts` with 100+ channel names as `as const`. Eliminates string typos, provides autocomplete.

**S5: Strong Lib/Utility Test Coverage.** Nearly every function in `src/renderer/src/lib/` has co-located tests. Pure functions tested in isolation.

**S6: Consistent Logging Architecture.** Unified logger across both processes with file rotation, lazy filesystem loading (Vite compat), and hierarchical `log.child('scope')` scoping.

**S7: Modern React Patterns.** React 19 `<Activity>` for tab preservation (avoids remount on switch). Dedicated bridge hooks per feature domain with cleanup returns.

---

## Health Score

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| **Dependency direction** | **strong** | All deps point toward `shared/*` abstractions. Zero cross-boundary imports. No circular deps. |
| **Module cohesion** | **adequate** | Provider system and stores are focused. `SessionManager` and `PrReviewManager` each have 5+ distinct responsibilities. |
| **Coupling** | **adequate** | Process boundaries are clean. Within main, singletons introduce temporal coupling via `setWindow()`. |
| **Boundary clarity** | **strong** | Preload layer well-defined. Provider barrel export enforces encapsulation. IPC channels centralized. |
| **Pattern consistency** | **strong** | Strategy, Observer, Facade, Singleton, Flux all applied uniformly. Tool dispatcher is the exception. |
| **Abstraction quality** | **strong** | No dead abstractions. `NormalizedEvent` hybrid design earns its keep. `DeltaBatcher` DI is well-motivated. |

---

## Prescriptions

### High Priority

**P1: Decompose SessionManager (W1)**

Extract 3 services from `session-manager.ts`:
- `GitWorktreeService` -- lines 422-636 (worktree create/remove/merge/rename/branch)
- `DiffService` -- lines 692-885 (baseline capture, git root, file diffs, file statuses)
- `MessagePersistence` -- persistMessage, getSessionMessages, getStoredSessions

Keep `SessionManager` as thin orchestrator that delegates. Apply **Facade pattern** from `patterns-reference.md` -- simplified interface over the extracted subsystem.

**Impact:** ~1,000 lines move out. Each service becomes independently testable. Low risk -- pure method extraction with no interface changes to callers.

### Medium Priority

**P2: Split IPC Handlers by Feature Domain (W3)**

Follow the `git-ipc-handlers.ts` precedent. Create:
- `pr-ipc-handlers.ts` -- PR review channels
- `test-ipc-handlers.ts` -- test runner channels
- `settings-ipc-handlers.ts` -- settings channels
- `plugin-ipc-handlers.ts` -- plugin channels

Each exports `registerXxxHandlers(win)`. Main `index.ts` calls them all.

**Impact:** Low effort, reduces merge conflicts, makes IPC surface discoverable by domain.

**P3: Add Tests for SessionManager (I3)**

Before or after decomposition, test the `handleProviderEvent` switch and `sendMessage` flow with a mock provider. The `AgentProvider` interface makes this feasible.

**Impact:** Medium effort, high value -- the two most critical files have zero test coverage.

**P4: Version Schema Migrations (I1)**

Replace inline `PRAGMA table_info` checks with a `schema_version` table and numbered migration array. Currently 15+ individual column checks that will only grow.

**Impact:** Low effort. Becomes important as schema evolves.

### Low Priority

**P5: Replace Tool Dispatcher String Chains (W3)**

Convert `getToolInfo()` and `ToolRenderer` from `if (name.includes(...))` chains to a registry array. Eliminates ordering dependencies.

**P6: Type the Message Store (I2)**

Replace `unknown[]` in `session-store.ts` with a discriminated union for messages. Restores type safety at consumption sites.

**P7: Reduce Singleton Temporal Coupling (W4)**

Options: pass `BrowserWindow` at construction, use a deferred getter that throws on premature access, or use an init-gate pattern.
