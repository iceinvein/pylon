# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Pylon — an Electron desktop app for AI-assisted development. It wraps the `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` behind a shared provider layer, then presents sessions, PR review, testing, git, and code exploration in a native desktop UI. Built with Electron 42, React 19.2, Zustand, Tailwind CSS 4.3, and native Node/Electron SQLite via `node:sqlite`.

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

Test files live alongside source (`*.test.ts` / `*.test.tsx`) in `src/main/`, `src/renderer/src/lib/`, `src/renderer/src/store/`, `src/renderer/src/components/`, and `src/shared/`.

```bash
bun run lint             # Check lint + format violations
bun run lint:fix         # Auto-fix safe violations
bun run format           # Format all source files
```

## Architecture

This is an **electron-vite** project with three processes:

### Main Process (`src/main/`)
- **index.ts** — App bootstrap, BrowserWindow creation, DB init, provider registration, model discovery, IPC handler registration
- **session-manager.ts** — Core orchestrator: session lifecycle, provider session creation, permission/question flow, message streaming, session persistence, model/effort settings, and provider event handling
- **providers/** — Provider abstraction and concrete Claude/Codex adapters. `registry.ts` owns provider registration, model discovery, and SQLite-backed model caching
- **ipc-handlers.ts** — Core session/settings/plugin IPC channels. Feature-specific handlers are split into `git-ipc-handlers.ts`, `pr-review-ipc-handlers.ts`, `test-ipc-handlers.ts`, and `ast-ipc-handlers.ts`
- **db.ts** — SQLite schema for sessions, messages, settings, PR review history, testing, AST cache, plugins, and worktree recipes
- **sqlite-adapter.ts** — Lightweight adapter around `node:sqlite` that supplies the prepare/get/all/run/transaction API used by the app
- **pr-review-manager.ts** — PR review orchestration: fetches PR diffs via GitHub CLI, builds review context, runs parallel review agents, dedupes/peer-reviews/revalidates findings, persists history, and posts to GitHub
- **pr-context/** — MCP-backed and heuristic PR context builders for changed files, symbols, references, and related tests
- **test-manager.ts** / **server-manager.ts** / **test-tools.ts** — Test exploration orchestration, local server launch/monitoring, and tools for reporting findings or generated Playwright tests
- **ast-analyzer.ts**, **ast-impact.ts**, **ast-parsers/** — Multi-language AST analysis, repo graph construction, and impact indexing
- **git-*.ts**, **diff-service.ts**, **git-worktree-service.ts**, **worktree-recipe-service.ts** — Git status/graph/operations, diff computation, isolated worktrees, and setup recipes

### Preload (`src/preload/`)
- **index.ts** — `contextBridge.exposeInMainWorld('api', ...)` — typed API surface for renderer
- **index.d.ts** — Global `window.api` type declarations

### Renderer (`src/renderer/src/`)
- **App.tsx** — Mode dispatch (`sessions`, `pr-review`, `testing`, `code`), keyboard shortcuts, IPC bridge init, startup session restore, and React 19 `<Activity>` preservation for recent sessions
- **pages/SessionView.tsx** — Main chat page: lazy session creation on first message, model/permission selectors, attachment handling
- **pages/PrReviewView.tsx** — PR review page: select PRs, view diffs, run AI reviews, post findings to GitHub
- **pages/TestView.tsx** — Test explorer setup, monitoring, findings, generated tests, and comparison view
- **pages/AstView.tsx** — Repo graph, file AST, impact explorer, and code-structure chat

**State (Zustand stores in `store/`):**
- `session-store.ts` — Sessions, messages, streaming text, subagent blocks, tasks, changed files, diffs, pending permissions/questions, branch status
- `ui-store.ts` — Active mode/session, recent sessions, command palette, settings overlay, sidebar/popover state
- `draft-store.ts` — Per-session draft persistence
- `pr-review-store.ts` — PR list/detail state, selected PR, review runs, findings, timelines, posting state, active issues
- `pr-raise-store.ts` — Pull request creation overlay, generated metadata/body, included commits/files
- `test-store.ts` — Test explorer setup, scans, batches, exploration runs, findings, generated tests
- `ast-store.ts` — Repo graph, file ASTs, impact summaries, cached analysis freshness, chat state
- `git-graph-store.ts`, `git-ops-store.ts`, `git-commit-store.ts` — Git graph, natural-language git operations, staged files, commit plans
- `worktree-setup-store.ts` — Worktree recipe setup progress

**Key hooks (`hooks/`):**
- `use-ipc-bridge.ts` — Bridges IPC event channels into Zustand. Parses SDK messages, accumulates streaming deltas, extracts TodoWrite tasks, tracks changed files
- `use-folder-open.ts` — Native folder picker with git dirty-state detection and worktree setup flow
- `use-shiki.ts` — Lazy Shiki highlighter with caching
- `use-pr-review-bridge.ts` — Bridges PR review IPC events (findings, progress, errors) into pr-review-store
- `use-test-bridge.ts` — Bridges test exploration events into test-store
- `use-ast-bridge.ts` — Bridges AST analysis/cache/chat events into ast-store
- `use-git-bridge.ts` — Bridges git status and operation events
- `use-worktree-setup-bridge.ts` — Bridges worktree recipe setup progress
- `use-agent-grouping.ts` — Groups agent/subagent messages for flow visualization

**Lib (`lib/`):**
- `delta-batcher.ts` — Module-level Map accumulates text deltas from SDK stream events; `requestAnimationFrame` flushes to Zustand at ~60fps to avoid overwhelming React renders
- `extract-changed-files.ts` — Parses tool results to track files modified by Claude
- `extract-tasks.ts` — Extracts TodoWrite tasks from SDK messages
- `detect-choices.ts` — Detects inline choice prompts from assistant messages
- `group-agent-messages.ts` — Groups messages by agent/subagent for flow visualization
- `flow-graph.ts` / `flow-types.ts` — Agent flow graph construction and types
- `ast-layout.ts`, `ast-graph-resolve.ts`, `ast-colors.ts` — AST and repo graph layout/rendering helpers
- `comparison.ts`, `activity-format.ts`, `setup-errors.ts` — Test explorer presentation helpers
- `pr-review-presentation.ts`, `pr-review-findings.ts` — PR review presentation and finding parsing helpers
- `command-registry.ts` — Command palette registry
- `diff-utils.ts` — Diff display helpers
- `parse-plan.ts` — Parses structured plans from assistant messages
- `ansi.ts` — ANSI escape code handling for terminal output
- `utils.ts` — General utilities

**Components:**
- `components/messages/` — ChatView, AssistantMessage, UserMessage, SystemMessage, ResultMessage, TextBlock (markdown+shiki), ThinkingBlock, PermissionPrompt, QuestionPrompt, ChoiceButtons
- `components/tools/` — ToolUseBlock (dispatcher), BashTool, ReadTool, EditTool, WriteTool, GlobGrepTool, TodoWriteTool, WebSearchTool, AskUserQuestionTool, GenericTool, CollapsibleOutput, SubagentBlock, CommitCard, PlanCard
- `components/layout/` — Layout shell, mode switcher, session sidebar/cards, tasks panel
- `components/flow/` — FlowPanel, FlowNode — agent execution flow visualization
- `components/review/` — ReviewPanel, ReviewSection — inline code review UI
- `components/pr-review/` — PR list/detail, split diff view, finding annotations/cards, review modal/progress/history, posting actions, timeline, active issues, all findings
- `components/pr-raise/` — PR creation overlay, generated metadata/body, commit/file review, created PR card
- `components/test/` — Setup wizard, config bar, monitoring view, agent tiles, activity feed, findings panel, generated tests, comparison view
- `components/ast/` — Repo map, file AST view, graph canvas, minimap, code panel, impact explorer/panel, AST toolbar/context menu/chat
- `components/git/` — Git panel, graph canvas, branch list, commit detail, commit plan, natural-language operations, conflict resolver
- `components/setup/` — Claude Code setup card
- `components/` — InputBar, ChangesPanel, DiffView, SettingsOverlay, CommandPalette, KeyboardShortcuts, WorktreeDialog, WorktreeSetupModal, StatusBar, ErrorBoundary, ThinkingIndicator, UsageDashboard, ProjectsPopover, EmptyState

### Shared (`src/shared/`)
- **ipc-channels.ts** — IPC channel name constants (SESSION_*, FOLDER_*, SETTINGS_*, PR_REVIEW_*, etc.)
- **types.ts** — Shared types: sessions, attachments, permissions/questions, settings, usage, GitHub/PR review, PR creation, test exploration, AST graph/impact, worktree recipes, PR context
- **git-types.ts** — Git graph, branch, file status, commit plan, command plan, conflict resolution types
- **model-context.ts** — Known model context/output limits and resolver helpers
- **pr-context-schema.json** — JSON schema for PR context bundles
- **logger.ts** — Centralized logging utility

## Key Patterns

**Main ↔ Renderer IPC:** Renderer invokes via `window.api.methodName()` → `ipcMain.handle()`. Main pushes events via `window.webContents.send()` → renderer subscribes with `window.api.onEventName()`.

**Session lifecycle:** Session selected/created → first message triggers lazy `createSession(cwd, model, useWorktree)` → main resolves the provider for the selected model → normalized provider events stream back via IPC → persisted to SQLite.

**Provider events:** Claude and Codex SDK events are mapped into `NormalizedEvent` while raw passthrough messages are retained for renderer compatibility. SessionManager should consume provider interfaces only, not SDK-specific APIs.

**Tool permissions:** Claude uses the SDK `canUseTool` callback → main sends IPC event → renderer shows PermissionPrompt → user responds → promise resolves back to SDK. Codex maps Pylon permission modes to Codex approval modes (`never`, `on-request`, `on-failure`, `untrusted`).

**Git worktrees:** Created at `~/.pylon/worktrees/` per session. Baseline hash captured on first write-capable tool/file-change event. Diffs computed against baseline. Branches are named from the session title and can be initialized with stored worktree setup recipes.

## Path Aliases

- `@renderer/*` and `@/*` both resolve to `src/renderer/src/*` (configured in tsconfig.web.json and electron.vite.config.ts)

## TypeScript Config

Two separate tsconfig projects via project references:
- `tsconfig.node.json` — main + preload + shared (Node.js target)
- `tsconfig.web.json` — renderer + shared (browser target, JSX react-jsx)

## Verification

After making changes, always run all three checks before considering work complete:

```bash
bun run lint             # Must pass with no warnings
bun run typecheck        # Must pass with no errors
bun test                 # Must pass with no failures
```

## AI SDK access

All Claude calls go through the Agent SDK via `src/main/providers/claude-provider.ts`, which inherits the user's existing auth (Claude Code subscription, Claude Pro, Claude Max). Codex calls go through `src/main/providers/codex-provider.ts`, which uses the Codex SDK/CLI auth path. Pylon does not own or read raw API keys for normal agent sessions.

**Forbidden in `src/`:**
- Reading `ANTHROPIC_API_KEY` from `process.env`
- Calling `https://api.anthropic.com/v1/*` directly via `fetch`
- The headers `x-api-key` and `anthropic-version`
- Importing `@anthropic-ai/sdk` (the raw API client; the agent SDK is `@anthropic-ai/claude-agent-sdk`)

**Use instead:**
- For an active session, send a normal user message via `sessionManager.sendMessage(sessionId, ...)`.
- For a one-shot text-only LLM call that should not appear in the chat UI, use `sessionManager.sendGitAiQuery(sessionId, prompt, systemPrompt)`. This runs through the session's provider with `auto-approve` permissions and returns the response text.
- Do not introduce new direct-fetch paths even for "small" calls (title generation, dedupe, classification, etc.). They break for users without an API key set.

The rule is enforced by `src/main/__tests__/no-direct-anthropic-api.test.ts`, which scans `src/` and fails the suite on any forbidden token. If you hit a use case that genuinely needs to bypass the SDK, raise it for discussion before adding an exception.

## Workflow

Before making changes, use the `code-intelligence` MCP tools to understand the relevant code first. Useful starting points:
- `search_code` — find symbols, patterns, or usages across the codebase
- `get_definition` — jump to a symbol's definition
- `find_references` — find all usages of a symbol
- `get_call_hierarchy` — understand call chains
- `trace_data_flow` — follow data through the system

## Design Docs

Design documents and implementation plans live in `docs/plans/`. Consult these when working on related features.

## Design Context

### Users
Pylon serves developers across all experience levels — solo devs, team members, and power users/tinkerers. They reach for Pylon as a daily AI coding companion embedded in their workflow. Their context is focused deep work: reading code, debugging, reviewing PRs, and iterating on features. They expect a native-feeling desktop experience, not a web app in a frame.

### Brand Personality
**Precise, refined, deliberate.** Every detail is considered — nothing is accidental. Pylon communicates through restraint: surfaces, typography, and spacing do the work, not color or ornamentation. It should feel like a precision instrument — sharp, reliable, and crafted with intent. Confidence comes from what's left out as much as what's included.

### Aesthetic Direction
- **Palette:** Neutral dark, pure monochrome. The interface is grayscale — the accent is achromatic (`#ececed`, white/near-white). Color appears only through semantic states (success, error, warning, info, special). Primary buttons are inverted: light bg (`bg-accent`), dark text (`text-base-bg`). No pure black.
- **Typography:** Space Grotesk (UI), Instrument Serif (display — used sparingly), JetBrains Mono (code).
- **Density:** Context-dependent. Working views (diffs, code, tool output) are dense and data-rich. Navigation, empty states, and landing views breathe. Never one-size-fits-all.
- **Motion:** Subtle, purposeful — staggered fade-ups, gentle scale on hover/tap, `easeOutQuart` easing. Never bouncy.
- **Icons:** Lucide React, 18px nav / 13-16px inline.
- **Theme:** Dark mode only.
- **References:** Linear 2024+ (dense, fast, keyboard-driven), Vercel / v0.dev (minimal, monochrome-forward), Raycast (command-palette UX, restrained color).
- **Anti-references:** ChatGPT (generic AI chat), VS Code (heavy IDE chrome), Electron jank.

### Design Principles
1. **Precision through restraint** — Every pixel is deliberate. Color is earned, not given freely. Let surfaces, type, and spacing communicate hierarchy. If removing an element doesn't hurt, remove it.
2. **Information density, contextually** — Working views are dense and data-rich. Navigation and empty states breathe. Two density modes, not one.
3. **Native-grade interaction** — Instant response, no layout shift, no spinners where skeletons or transitions will do.
4. **Quiet confidence** — No gratuitous animations, no exclamation marks in UI, no "magic" language. The tool works; the interface reports calmly.
5. **Keyboard-first, mouse-friendly** — Every action reachable by keyboard. Mouse interactions equally polished but never required.
