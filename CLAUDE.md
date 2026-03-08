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

There is no test suite yet. No linter configured.

## Architecture

This is an **electron-vite** project with three processes:

### Main Process (`src/main/`)
- **index.ts** — App bootstrap, BrowserWindow creation, DB init, IPC handler registration
- **session-manager.ts** — Core orchestrator: session lifecycle, Claude Agent SDK `query()` calls, tool permission flow, git worktree management, message streaming, diff computation. This is the largest and most important file.
- **ipc-handlers.ts** — Registers ~20 `ipcMain.handle()` channels that delegate to session-manager
- **db.ts** — SQLite schema (sessions, messages, settings tables) with WAL mode

### Preload (`src/preload/`)
- **index.ts** — `contextBridge.exposeInMainWorld('api', ...)` — typed API surface for renderer
- **index.d.ts** — Global `window.api` type declarations

### Renderer (`src/renderer/src/`)
- **App.tsx** — Route dispatch (HomePage vs SessionView), keyboard shortcuts (Cmd+N, Cmd+1..9), IPC bridge init
- **pages/SessionView.tsx** — Main chat page: lazy session creation on first message, model/permission selectors, attachment handling
- **pages/HomePage.tsx** — Landing page with folder picker + session history

**State (Zustand stores in `store/`):**
- `session-store.ts` — Sessions, messages, streaming text, subagent blocks, tasks, changed files, diffs, pending permissions/questions
- `tab-store.ts` — Tab management (add/close/switch)
- `ui-store.ts` — Command palette, settings overlay, sidebar view

**Key hooks (`hooks/`):**
- `use-ipc-bridge.ts` — Bridges all 5 IPC event channels into Zustand. Parses SDK messages, accumulates streaming deltas, extracts TodoWrite tasks, tracks changed files
- `use-folder-open.ts` — Native folder picker with git dirty-state detection → worktree dialog
- `use-shiki.ts` — Lazy Shiki highlighter with caching

**Streaming performance (`lib/delta-batcher.ts`):**
Module-level Map accumulates text deltas from SDK stream events; `requestAnimationFrame` flushes to Zustand at ~60fps to avoid overwhelming React renders.

**Components:**
- `components/messages/` — ChatView, AssistantMessage, UserMessage, TextBlock (markdown+shiki), ThinkingBlock, PermissionPrompt, QuestionPrompt, SubagentBlock, ChoiceButtons, CommitCard
- `components/tools/` — ToolUseBlock (dispatcher), BashTool, ReadTool, EditTool, WriteTool, GlobGrepTool, TodoWriteTool, WebSearchTool, GenericTool
- `components/layout/` — Layout (shell), NavRail, TabBar
- `components/` — InputBar, ChangesPanel, DiffView, HistoryPanel, SettingsOverlay, CommandPalette, WorktreeDialog, StatusBar

### Shared (`src/shared/`)
- **ipc-channels.ts** — IPC channel name constants (SESSION_*, FOLDER_*, SETTINGS_*, etc.)
- **types.ts** — Shared types: SessionStatus, Session, Tab, Message, Attachments, PermissionRequest/Response, QuestionRequest/Response, AppSettings, FileDiff

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
