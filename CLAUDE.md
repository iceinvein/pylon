# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Pylon — an Electron desktop app that wraps the `@anthropic-ai/claude-agent-sdk` to provide a native chat interface for Claude. Built with Electron 39, React 19, Zustand, Tailwind CSS 4, and SQLite (better-sqlite3).

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start Electron in dev mode (HMR)
bun run build            # Production build
bun run start            # Preview production build
bun run typecheck        # Typecheck both main + renderer
bun run typecheck:node   # Typecheck main/preload only
bun run typecheck:web    # Typecheck renderer only
```

Biome handles linting + formatting. Tests use `bun test`:

```bash
bun test                 # Run all tests
bun test src/renderer    # Run renderer tests only
bun test src/main        # Run main process tests only
```

Test files live alongside source (`*.test.ts`) in `src/renderer/src/lib/`, `src/renderer/src/store/`, and `src/main/__tests__/`.

```bash
bun run lint             # Check lint + format violations
bun run lint:fix         # Auto-fix safe violations
bun run format           # Format all source files
```

## Architecture

This is an **electron-vite** project with three processes:

### Main Process (`src/main/`)
- **index.ts** — App bootstrap, BrowserWindow creation, DB init, IPC handler registration
- **session-manager.ts** — Core orchestrator: session lifecycle, Claude Agent SDK `query()` calls, tool permission flow, git worktree management, message streaming, diff computation. This is the largest and most important file.
- **ipc-handlers.ts** — Registers IPC `ipcMain.handle()` channels that delegate to session-manager and pr-review-manager
- **db.ts** — SQLite schema (sessions, messages, settings tables) with WAL mode
- **pr-review-manager.ts** — PR review orchestration: fetches PR diffs via GitHub CLI, runs parallel Claude review agents, streams findings back
- **gh-cli.ts** — GitHub CLI wrapper for PR operations (list, diff, post comments)
- **diff-chunker.ts** — Smart diff chunking: splits large PR diffs into reviewable chunks for parallel agents

### Preload (`src/preload/`)
- **index.ts** — `contextBridge.exposeInMainWorld('api', ...)` — typed API surface for renderer
- **index.d.ts** — Global `window.api` type declarations

### Renderer (`src/renderer/src/`)
- **App.tsx** — Route dispatch (HomePage vs SessionView), keyboard shortcuts (Cmd+N, Cmd+1..9), IPC bridge init
- **pages/SessionView.tsx** — Main chat page: lazy session creation on first message, model/permission selectors, attachment handling
- **pages/HomePage.tsx** — Landing page with folder picker + session history
- **pages/PrReviewView.tsx** — PR review page: select PRs, view diffs, run AI reviews, post findings to GitHub

**State (Zustand stores in `store/`):**
- `session-store.ts` — Sessions, messages, streaming text, subagent blocks, tasks, changed files, diffs, pending permissions/questions
- `tab-store.ts` — Tab management (add/close/switch)
- `ui-store.ts` — Command palette, settings overlay, sidebar view
- `pr-review-store.ts` — PR review state: PR list, selected PR, review findings, review progress

**Key hooks (`hooks/`):**
- `use-ipc-bridge.ts` — Bridges IPC event channels into Zustand. Parses SDK messages, accumulates streaming deltas, extracts TodoWrite tasks, tracks changed files
- `use-folder-open.ts` — Native folder picker with git dirty-state detection → worktree dialog
- `use-shiki.ts` — Lazy Shiki highlighter with caching
- `use-pr-review-bridge.ts` — Bridges PR review IPC events (findings, progress, errors) into pr-review-store
- `use-agent-grouping.ts` — Groups agent/subagent messages for flow visualization

**Lib (`lib/`):**
- `delta-batcher.ts` — Module-level Map accumulates text deltas from SDK stream events; `requestAnimationFrame` flushes to Zustand at ~60fps to avoid overwhelming React renders
- `extract-changed-files.ts` — Parses tool results to track files modified by Claude
- `extract-tasks.ts` — Extracts TodoWrite tasks from SDK messages
- `detect-choices.ts` — Detects inline choice prompts from assistant messages
- `group-agent-messages.ts` — Groups messages by agent/subagent for flow visualization
- `flow-graph.ts` / `flow-types.ts` — Agent flow graph construction and types
- `diff-utils.ts` — Diff display helpers
- `parse-plan.ts` — Parses structured plans from assistant messages
- `ansi.ts` — ANSI escape code handling for terminal output
- `utils.ts` — General utilities

**Components:**
- `components/messages/` — ChatView, AssistantMessage, UserMessage, SystemMessage, ResultMessage, TextBlock (markdown+shiki), ThinkingBlock, PermissionPrompt, QuestionPrompt, ChoiceButtons
- `components/tools/` — ToolUseBlock (dispatcher), BashTool, ReadTool, EditTool, WriteTool, GlobGrepTool, TodoWriteTool, WebSearchTool, AskUserQuestionTool, GenericTool, CollapsibleOutput, SubagentBlock, CommitCard, PlanCard
- `components/layout/` — Layout (shell), NavRail, TabBar, TasksPanel
- `components/flow/` — FlowPanel, FlowNode — agent execution flow visualization
- `components/review/` — ReviewPanel, ReviewSection — inline code review UI
- `components/pr-review/` — PrList, PrCard, PrDetail, PrFilesChanged, SplitDiffView, DiffPane, DiffFileTree, DiffFindingAnnotation, FindingCard, FindingsList, ReviewModal, ReviewHistory, ReviewProgress, PostActions, GhSetupGuide
- `components/` — InputBar, ChangesPanel, DiffView, HistoryPanel, SessionHistory, SettingsOverlay, CommandPalette, WorktreeDialog, StatusBar, ErrorBoundary, ThinkingIndicator, UsageDashboard, ProjectsPopover

### Shared (`src/shared/`)
- **ipc-channels.ts** — IPC channel name constants (SESSION_*, FOLDER_*, SETTINGS_*, PR_REVIEW_*, etc.)
- **types.ts** — Shared types: SessionStatus, Session, Tab, Message, Attachments, PermissionRequest/Response, QuestionRequest/Response, AppSettings, FileDiff, PR review types
- **logger.ts** — Centralized logging utility

## Key Patterns

**Main ↔ Renderer IPC:** Renderer invokes via `window.api.methodName()` → `ipcMain.handle()`. Main pushes events via `window.webContents.send()` → renderer subscribes with `window.api.onEventName()`.

**Session lifecycle:** Tab created → first message triggers lazy `createSession(cwd, model, useWorktree)` → main starts SDK `query()` → messages stream back via IPC → persisted to SQLite.

**Tool permissions:** SDK's `canUseTool` callback → main sends IPC event → renderer shows PermissionPrompt → user responds → promise resolves back to SDK. Two modes: `'default'` (ask each time) and `'auto-approve'`.

**Git worktrees:** Created at `~/.pylon/worktrees/` per session. Baseline hash captured on first Edit/Write. Diffs computed against baseline. Branch named `claude/{title-slug}`.

## Path Aliases

- `@renderer/*` and `@/*` both resolve to `src/renderer/src/*` (configured in tsconfig.web.json and electron.vite.config.ts)

## TypeScript Config

Two separate tsconfig projects via project references:
- `tsconfig.node.json` — main + preload + shared (Node.js target)
- `tsconfig.web.json` — renderer + shared (browser target, JSX react-jsx)

## Design Docs

Design documents and implementation plans live in `docs/plans/`. Consult these when working on related features.
