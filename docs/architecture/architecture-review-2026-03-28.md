# Pylon Architecture Review

**Original review date:** 2026-03-28
**Last updated:** 2026-05-09
**Codebase:** ~63k lines TypeScript/TSX across 317 source files, 65 test files
**Stack:** Electron 42, React 19.2, TypeScript 6.0, Zustand 5, Tailwind CSS 4.3, native Node/Electron SQLite (`node:sqlite`)

---

## Architecture Overview

Pylon is an Electron desktop app structured around `electron-vite`'s three-process model:

```text
src/
  main/           Node.js main process
                  Provider orchestration, persistence, git, PR review, testing, AST analysis
  preload/        Context bridge
                  Typed IPC surface exposed to renderer
  renderer/src/   React browser process
                  Modes, stores, hooks, components, visualization
  shared/         Cross-process contracts
                  IPC names, shared types, git types, model limits, logger, PR context schema
```

The app is organized as a layered Electron system with event-driven communication over IPC. `main` and `renderer` both import from `shared`, but do not import from each other. Feature domains have increasingly been split into dedicated services and IPC handler modules rather than concentrating everything in one handler file.

---

## Current Product Modes

- **Sessions:** Claude/Codex agent sessions with streaming output, tool renderers, permission prompts, plan approval, worktree isolation, changes panel, usage tracking, and session persistence.
- **PR Review:** GitHub CLI-backed PR selection, diff chunking, code-intelligence context bundles, parallel Claude/Codex review agents, finding dedupe, peer review, active issue tracking, revalidation, and GitHub posting.
- **Testing:** Project scanning, local server launch or manual URL input, queued exploration agents, live monitoring, findings, generated Playwright tests, and comparison across runs.
- **Code:** Multi-language AST parsing, repo graph, file AST viewer, minimap, impact explorer, cached analysis freshness, and AST chat.
- **Git:** Slide-over panel with commit graph, branch list, staged changes, commit message planning, natural-language git operations, and conflict-resolution UI.

---

## Dependency Graph

```text
renderer/
  App.tsx         --> pages/*, layout, bridge hooks, stores
  pages/*         --> components/*, hooks/*, store/*
  hooks/*         --> store/*, lib/*
  components/**   --> store/*, lib/*
  lib/*           --> mostly pure helpers; delta-batcher integrates with session-store

preload/
  index.ts        --> shared/ipc-channels

main/
  index.ts        --> db, providers/*, session-manager, feature IPC handlers, services
  ipc-handlers.ts --> session-manager, db, provider registry, shared/*
  *-ipc-handlers  --> feature services, shared/*
  session-manager --> providers/*, db, shared/*, git worktree/diff services
  providers/*     --> shared/types, shared/logger
  pr-review-mgr   --> session-manager, db, gh-cli, diff-chunker, PR context, review helpers
  test-manager    --> session-manager, db, server-manager, test tools
  ast-*           --> tree-sitter parsers, impact index, repo graph/cache

shared/
  types.ts        <-- cross-process domain types
  ipc-channels.ts <-- channel constants
  git-types.ts    <-- git domain types
  model-context.ts<-- model limit helpers
  logger.ts       <-- main/renderer logging facade
```

---

## Pattern Inventory

### 1. Strategy Pattern: Provider Abstraction

**Where:** `src/main/providers/types.ts`, `src/main/providers/claude-provider.ts`, `src/main/providers/codex-provider.ts`

`AgentProvider` and `AgentSession` normalize Claude Agent SDK and OpenAI Codex SDK sessions behind a common interface. `NormalizedEvent` provides a shared stream vocabulary while raw passthrough events preserve renderer fidelity during migration.

**Status:** Strong. Adding another provider is localized to a provider implementation plus registration.

### 2. Registry Pattern: Provider and Model Discovery

**Where:** `src/main/providers/registry.ts`

Providers are registered at startup. Models come from static catalogs, SQLite cache, and live discovery where supported. Static models win on ID collisions so newly shipped models are available immediately.

**Status:** Strong.

### 3. Observer Pattern: IPC Event Bridges

**Where:** `src/main/*-ipc-handlers.ts`, `src/preload/index.ts`, `src/renderer/src/hooks/use-*-bridge.ts`

Renderer calls request/response IPC methods via `window.api`. Main pushes event updates with `webContents.send`. Each feature has a bridge hook that subscribes and routes updates into Zustand.

**Status:** Strong. The pattern is consistent across sessions, PR review, testing, AST, git, and worktree setup.

### 4. Facade Pattern: Feature IPC Handlers

**Where:** `src/main/ipc-handlers.ts`, `git-ipc-handlers.ts`, `pr-review-ipc-handlers.ts`, `test-ipc-handlers.ts`, `ast-ipc-handlers.ts`

IPC registration is now split by feature domain. The core handler still owns session/settings/plugin channels, while git, PR review, test, and AST are dedicated modules.

**Status:** Improved since the original review. Remaining opportunity: split settings/plugin/worktree recipe channels from core `ipc-handlers.ts`.

### 5. Singleton Services

**Where:** `sessionManager`, `prReviewManager`, `testManager`, `serverManager`, `prPollingService`, `gitWorktreeService`, `worktreeRecipeService`, `diffService`

Main-process services are module-level singletons. Window-aware services receive `BrowserWindow` via `.setWindow()` during app startup.

**Status:** Consistent, but still temporally coupled. This is acceptable for the desktop app shape, but service construction is harder to test than dependency-injected alternatives.

### 6. Flux Pattern: Zustand Stores

**Where:** `src/renderer/src/store/`

Stores are split by domain: sessions, UI/nav, drafts, PR review, PR raise, testing, AST, git graph, git ops, git commits, and worktree setup.

**Status:** Strong. Domain stores have scaled better than the old tab-centric model.

### 7. Adapter Pattern: Native SQLite Compatibility

**Where:** `src/main/sqlite-adapter.ts`

The app now uses `node:sqlite` through a local adapter that exposes the prepare/get/all/run/transaction API expected by the persistence layer, including pragmas and transaction helpers.

**Status:** Strong. This removed an extra native database dependency while keeping DB call sites stable.

### 8. Analyzer/Index Pattern: AST and Impact Explorer

**Where:** `src/main/ast-analyzer.ts`, `src/main/ast-impact.ts`, `src/main/ast-parsers/`, `src/renderer/src/components/ast/`

Tree-sitter parsers build file ASTs and repo graphs. The impact index derives entities, imports, reverse imports, references, calls, test links, snapshot hashes, and freshness metadata for renderer exploration.

**Status:** Strong, with good unit coverage around parsers, layout, and impact utilities.

---

## Current Health

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| **Dependency direction** | **strong** | Process boundaries remain clean; shared contracts are centralized. |
| **Module cohesion** | **adequate** | Git, diff, AST, test, and PR context have split services. `pr-review-manager.ts` remains very large. |
| **Coupling** | **adequate** | IPC and provider boundaries are clean. Main-process singletons still use runtime `.setWindow()` wiring. |
| **Boundary clarity** | **strong** | Provider barrel export, typed preload surface, channel constants, and shared types keep contracts explicit. |
| **Pattern consistency** | **strong** | Provider registry, IPC bridges, Zustand stores, and feature services follow stable local conventions. |
| **Test coverage** | **adequate** | 65 test files cover many pure utilities and services; giant orchestrators still rely more on integration-style behavior than direct unit coverage. |

---

## Original Prescriptions Status

- **Decompose SessionManager:** Partially complete. Worktree, diff, git, test, AST, and PR-context work have moved into dedicated services. `session-manager.ts` is now ~1,025 lines, down from the original ~1,639, but it remains central.
- **Split IPC handlers:** Mostly complete. Git, PR review, testing, and AST have dedicated handler modules. Core `ipc-handlers.ts` is still ~547 lines.
- **Add SessionManager tests:** Some surrounding behavior is covered, but deeper direct tests for provider-event handling would still be valuable.
- **Version schema migrations:** Still open. `db.ts` continues to use inline table/column checks rather than numbered migrations.
- **Replace tool dispatcher string chains:** Still open. `ToolUseBlock` remains dispatch-based.
- **Type message store:** Still open. Some raw SDK messages are intentionally preserved, so fully typed renderer messages remain a migration project.
- **Reduce singleton temporal coupling:** Still open.

---

## Current Risks and Follow-Ups

### High Priority

**P1: Decompose PR Review Manager**

`src/main/pr-review-manager.ts` is now ~2,797 lines. It owns PR loading, diff preparation, review orchestration, finding parsing, dedupe, peer review, revalidation, history persistence, and posting. Extract review-run orchestration, finding lifecycle, and GitHub posting into smaller services before adding more PR review behavior.

### Medium Priority

**P2: Add Numbered DB Migrations**

The schema is now broad enough that ad hoc `PRAGMA table_info` checks are becoming difficult to audit. Move to a `schema_version` table with ordered migration functions.

**P3: Test Provider Event Handling Directly**

`AgentProvider` makes it feasible to inject a mock provider and test `SessionManager` behavior for normalized text, tool, task, usage, file-change, permission, and error events.

**P4: Finish IPC Domain Split**

Move settings, plugin management, PR raise, and worktree recipe IPC registrations out of core `ipc-handlers.ts` once those areas grow again.

### Low Priority

**P5: Registry-Based Tool Rendering**

Convert the tool renderer from ordered name checks to a registry of matchers and renderers. This will make provider-specific tool aliases easier to add without ordering hazards.

**P6: Message Typing Migration**

Introduce a discriminated renderer message model while keeping raw SDK payloads as an optional provider-specific field. This would reduce `unknown` usage without losing passthrough fidelity.
