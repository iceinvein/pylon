# AI-Assisted Git Management for Pylon

**Date:** 2026-03-16
**Status:** Approved

## Overview

A new "Git" sidebar view in Pylon's NavRail providing rich git visualization, AI-powered commit orchestration, and natural language git commands — all with Claude as a copilot.

## Problem

Pylon has worktree management and a ChangesPanel for session-scoped file tracking, but no general-purpose git UI. Users cannot browse branches, view commit history, stage/unstage files, create commits, resolve conflicts, or get AI assistance with git operations outside the narrow worktree merge flow.

## Existing Git Infrastructure

The codebase already has git-related modules that this feature must account for:

- **`src/main/git-status.ts`** — `getBranchStatus()`, `fetchAndCompare()`, `pullBranch()`. Provides branch name, ahead/behind counts, and pull.
- **`src/main/git-watcher.ts`** — File system watcher that emits `GIT_STATUS_CHANGED` events.
- **`src/renderer/src/components/GitBranchPanel.tsx`** — Simple branch panel with ahead/behind display, fetch/compare, and pull button.
- **Existing IPC channels:** `GIT_BRANCH_STATUS`, `GIT_FETCH_COMPARE`, `GIT_PULL`, `GIT_WATCH`, `GIT_STATUS_CHANGED`.
- **Existing store state:** `session-store.ts` tracks `branchStatus: Map<string, GitBranchStatus>`.

**Strategy:** The new Git panel **absorbs and replaces** `GitBranchPanel.tsx`. The existing `git-status.ts` functions (`getBranchStatus`, `fetchAndCompare`, `pullBranch`) are **reused** by `git-graph-service.ts` rather than reimplemented. The existing IPC channels for branch status continue to work. `git-watcher.ts` is kept and its `GIT_STATUS_CHANGED` events are consumed by the new git stores as an additional refresh trigger.

## Approach

**Micro-module architecture** with three independent modules, each owning its own main-process service, Zustand store, and component tree:

1. **git-graph** — Rich interactive git graph visualization
2. **git-commit** — AI-powered commit orchestration
3. **git-ops** — Natural language git commands and conflict resolution

A thin `GitPanel` shell composes all three with tab navigation. Each module is independently testable.

**AI interaction model:** Inline ✨ buttons for common quick actions (generate commit message, explain commit), with complex operations routing through the existing session chat for full conversational power.

### How AI Calls Reach Claude

The git services do **not** create their own Claude SDK connections. Instead, AI-powered operations (`analyzeForCommitPlan`, `generateCommitMessage`, `executeNlCommand`, `resolveConflicts`) are routed through a new **`git-ai-bridge.ts`** module in the main process. This bridge:

1. Takes the active session's `sessionId`
2. Calls `sessionManager.sendGitAiQuery(sessionId, prompt, systemPrompt)` — a new method on `SessionManager` that uses the session's existing SDK connection to send a one-shot query with a specialized system prompt
3. Returns structured JSON parsed from Claude's response

This means `session-manager.ts` **is modified** with a single new public method, but its core architecture stays unchanged. The AI queries appear in the session's chat history, enabling conversational follow-up.

## Module 1: Git Graph

### Rendering

Hybrid **Canvas + React DOM** approach. Canvas draws topology lines and nodes. React DOM renders interactive commit rows overlaid on top. This avoids SVG performance issues past ~500 commits while keeping commit details accessible and styled.

### Data

`git-graph-service.ts` shells out to git:

```
git log --all --format='%H|%P|%D|%s|%an|%aI' --topo-order
```

Parsed into typed structures:

```typescript
type GraphCommit = {
  hash: string
  shortHash: string
  parents: string[]
  message: string
  author: string
  date: string
  refs: GraphRef[]
  graphColumns: number
  graphLines: GraphLine[]
}

type GraphRef = {
  name: string
  type: 'local-branch' | 'remote-branch' | 'tag' | 'head'
  isCurrent: boolean
}

type GraphLine = {
  fromColumn: number
  toColumn: number
  type: 'straight' | 'merge-in' | 'fork-out'
  color: string
}

type BranchInfo = {
  name: string
  type: 'local' | 'remote'
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
  headHash: string
}
```

### Layout Algorithm

Lane allocation: each branch gets a column. When a branch merges, its lane is freed. New branches take the leftmost available lane. Colors assigned per-lane from a fixed palette.

### Pagination

Cursor-based using the last commit hash: `fetchGraph(cwd, afterHash?)`. The renderer requests ~100 commits at a time. When the user scrolls near the bottom, it fetches the next page using the last visible commit's hash as cursor. This is more reliable than offset-based pagination for a DAG that can change between fetches.

### Interactions

| Action | Behavior |
|--------|----------|
| Click commit | Expand to show full message, author, changed files, diff stats |
| Right-click commit | Context menu: cherry-pick, revert, reset, create branch → routes to chat |
| Click branch ref | Scroll graph to branch HEAD, highlight branch path |
| Double-click branch | Checkout (with confirmation if dirty) |
| ✨ "Explain" button | Send commit diff to Claude in chat for explanation |
| Scroll | Lazy-load more commits (~100 at a time, cursor-based) |

### Branch List

Collapsible sidebar within the Graph tab:
- Local branches (current highlighted)
- Remote branches (collapsed by default)
- Tags (collapsed by default)
- Ahead/behind indicators for tracked branches (reuses existing `getBranchStatus` from `git-status.ts`)

## Module 2: Commit Orchestration

### AI-Assisted Flow

1. **Analyze** — ✨ "Analyze Changes" gathers `git diff` + `git diff --cached`, sends to Claude via `git-ai-bridge.ts`
2. **Plan** — Claude returns a structured `CommitPlan`:

```typescript
type CommitPlan = {
  groups: CommitGroup[]
  reasoning: string
}

type CommitGroup = {
  title: string
  message: string
  files: StagedFile[]
  order: number
  rationale: string
}

type StagedFile = {
  path: string
}

type FileStatus = {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}
```

> **Note:** `StagedFile` intentionally does not support per-hunk staging in v1. Partial staging (`git add -p`) is non-trivial to automate programmatically. This may be added in a future iteration.

3. **Review** — Plan rendered as draggable cards. Each card shows the proposed message (editable), file list (with checkboxes to move between groups), rationale (collapsible), and diff preview
4. **Adjust** — User can drag files between groups, edit messages, reorder, add/remove groups
5. **Execute** — "Commit All" executes groups in order, or per-group "Commit" buttons

### Manual Mode

Standard staging UI for when AI isn't needed:
- File list with checkboxes for staging/unstaging
- Commit message input with ✨ "Generate" button for message-only AI assistance
- Standard commit button

### Service

`git-commit-service.ts` exposes:
- `getWorkingTreeStatus(cwd: string)` — All changed files with status
- `stageFiles(cwd: string, paths: string[])` / `unstageFiles(cwd: string, paths: string[])`
- `analyzeForCommitPlan(cwd: string, sessionId: string)` — AI commit plan generation (via git-ai-bridge)
- `executeCommitGroup(cwd: string, group: CommitGroup)` — Stage files and commit
- `generateCommitMessage(cwd: string, sessionId: string)` — Message for currently staged changes (via git-ai-bridge)

## Module 3: Natural Language Git Commands & Conflict Resolution

### Command Interface

- **Input** — Text field at bottom with prompt-like feel (`git ▸`). Users type natural language.
- **History** — Scrollable feed showing: request → interpretation → preview → confirm/cancel → result

### Command Flow

1. User types natural language request
2. Sent to Claude via `git-ai-bridge.ts` using the active session
3. Claude returns structured response:

```typescript
type GitCommandPlan = {
  id: string
  interpretation: string
  commands: PlannedCommand[]
  preview: string
  riskLevel: 'safe' | 'moderate' | 'destructive'
  warnings?: string[]
}

type PlannedCommand = {
  command: string
  explanation: string
}

type CommandEntry = {
  id: string
  request: string
  plan: GitCommandPlan | null
  status: 'pending' | 'planned' | 'confirmed' | 'executing' | 'completed' | 'failed' | 'cancelled'
  result?: string
  error?: string
  timestamp: number
}
```

4. Rendered with color-coded risk (green/yellow/red)
5. User confirms → main process executes → result displayed
6. Graph tab auto-refreshes

### Conflict Resolution

When any operation produces conflicts:

1. Command tab enters **Conflict Resolution mode**
2. Lists conflicting files
3. AI analyzes both sides and generates resolutions (via git-ai-bridge):

```typescript
type ConflictResolution = {
  filePath: string
  originalContent: string
  resolvedContent: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}
```

4. Side-by-side diff: left shows conflict markers, right shows AI resolution
5. User can: Accept all, Accept per-file, or Edit individual resolutions
6. On acceptance: auto-stages resolved files, continues interrupted operation

Low-confidence resolutions get a visual warning badge.

### Safety Rails

- **Destructive** (force push, reset --hard, branch -D): Red warning, explicit confirmation
- **History-rewriting** (rebase, amend, squash): Yellow warning with implications
- **Safe** (status, log, branch, checkout): Brief preview, optional auto-execute toggle

## IPC Layer

### New Channels

Added to `src/shared/ipc-channels.ts`. Constant names follow the existing `SCREAMING_SNAKE` convention; string values follow the existing `colon:separated` convention:

```typescript
// Git Graph
GIT_GRAPH_GET_LOG      = 'git:graph:get-log'       // (cwd: string, afterHash?: string) → GraphCommit[]
GIT_GRAPH_GET_BRANCHES = 'git:graph:get-branches'   // (cwd: string) → BranchInfo[]
GIT_GRAPH_CHECKOUT     = 'git:graph:checkout'        // (cwd: string, branch: string) → { success: boolean }
GIT_GRAPH_REFRESH      = 'git:graph:refresh'         // (cwd: string) → void

// Git Commit
GIT_COMMIT_GET_STATUS  = 'git:commit:get-status'     // (cwd: string) → FileStatus[]
GIT_COMMIT_ANALYZE     = 'git:commit:analyze'         // (cwd: string, sessionId: string) → CommitPlan
GIT_COMMIT_GENERATE_MSG = 'git:commit:generate-msg'   // (cwd: string, sessionId: string) → string
GIT_COMMIT_EXECUTE     = 'git:commit:execute'          // (cwd: string, group: CommitGroup) → { success: boolean }
GIT_COMMIT_STAGE       = 'git:commit:stage'            // (cwd: string, paths: string[]) → void
GIT_COMMIT_UNSTAGE     = 'git:commit:unstage'          // (cwd: string, paths: string[]) → void

// Git Ops
GIT_OPS_EXECUTE_NL     = 'git:ops:execute-nl'         // (cwd: string, sessionId: string, text: string) → GitCommandPlan
GIT_OPS_CONFIRM        = 'git:ops:confirm'             // (cwd: string, planId: string) → { success: boolean; result?: string }
GIT_OPS_GET_CONFLICTS  = 'git:ops:get-conflicts'       // (cwd: string) → ConflictFile[]
GIT_OPS_RESOLVE_CONFLICTS = 'git:ops:resolve-conflicts' // (cwd: string, sessionId: string) → ConflictResolution[]
GIT_OPS_APPLY_RESOLUTION = 'git:ops:apply-resolution'   // (cwd: string, resolutions: ConflictResolution[]) → void
GIT_OPS_CONTINUE       = 'git:ops:continue'             // (cwd: string) → { success: boolean }

// Events (main → renderer push)
GIT_GRAPH_UPDATED      = 'git:graph:updated'            // Pushed after any git mutation
GIT_COMMIT_PLAN_READY  = 'git:commit:plan-ready'        // AI commit plan streamed back
GIT_OPS_COMMAND_PLAN   = 'git:ops:command-plan'          // NL command interpretation ready
GIT_OPS_CONFLICT_DETECTED = 'git:ops:conflict-detected'  // Conflicts found during operation
```

### Cross-Module Refresh

After any git-mutating operation, the responsible service sends `GIT_GRAPH_UPDATED` to the renderer. All three stores listen and re-fetch their relevant data. The existing `GIT_STATUS_CHANGED` event from `git-watcher.ts` also triggers refresh. Simple, unidirectional, no coupling between services.

## Zustand Stores

Three **separate stores** following the existing codebase convention (each store is a standalone `create<T>()` call, matching `session-store.ts`, `pr-review-store.ts`, `tab-store.ts`, `ui-store.ts`):

```typescript
// store/git-graph-store.ts
type GitGraphStore = {
  commits: GraphCommit[]
  branches: BranchInfo[]
  loading: boolean
  error: string | null
  selectedCommit: string | null
  fetchGraph: (cwd: string, afterHash?: string) => Promise<void>
  fetchBranches: (cwd: string) => Promise<void>
  selectCommit: (hash: string | null) => void
}

// store/git-commit-store.ts
type GitCommitStore = {
  workingTree: FileStatus[]
  commitPlan: CommitPlan | null
  analyzing: boolean
  error: string | null
  fetchStatus: (cwd: string) => Promise<void>
  analyzePlan: (cwd: string, sessionId: string) => Promise<void>
  executeGroup: (cwd: string, group: CommitGroup) => Promise<void>
}

// store/git-ops-store.ts
type GitOpsStore = {
  commandHistory: CommandEntry[]
  pendingPlan: GitCommandPlan | null
  conflicts: ConflictResolution[]
  error: string | null
  submitCommand: (cwd: string, sessionId: string, text: string) => Promise<void>
  confirmPlan: (cwd: string, planId: string) => Promise<void>
  applyResolutions: (cwd: string, resolutions: ConflictResolution[]) => Promise<void>
}
```

Each store includes an `error: string | null` field for error state tracking.

## File Structure

### New Files

**Main Process (`src/main/`):**
- `git-graph-service.ts` — Graph data, DAG construction, branch listing
- `git-commit-service.ts` — Staging, commit plan generation, execution
- `git-ops-service.ts` — NL command translation, conflict detection/resolution
- `git-ai-bridge.ts` — Routes AI queries through session manager's SDK connection
- `git-ipc-handlers.ts` — All `git:*` IPC handlers

**Renderer (`src/renderer/src/`):**
- `store/git-graph-store.ts` — Graph state
- `store/git-commit-store.ts` — Commit orchestration state
- `store/git-ops-store.ts` — NL commands and conflict state
- `components/git/GitPanel.tsx` — Shell with tab navigation (Graph | Commit | Command)
- `components/git/GitGraphTab.tsx` — Graph canvas + commit list + branch sidebar
- `components/git/GitGraphCanvas.tsx` — Canvas rendering for topology
- `components/git/GitCommitTab.tsx` — Staging UI + commit plan cards
- `components/git/GitOpsTab.tsx` — NL command input + history + conflict resolver
- `components/git/CommitPlanCard.tsx` — Individual commit group card (draggable)
- `components/git/ConflictResolver.tsx` — Side-by-side conflict resolution view
- `components/git/BranchList.tsx` — Collapsible branch/tag list (replaces `GitBranchPanel.tsx`)
- `components/git/CommitDetail.tsx` — Expanded commit view
- `hooks/use-git-bridge.ts` — IPC event bridge for git events
- `lib/git-graph-layout.ts` — Lane allocation algorithm, color assignment

**Shared (`src/shared/`):**
- `git-types.ts` — All shared types (GraphCommit, CommitPlan, GitCommandPlan, CommandEntry, etc.)

### Modified Files

| File | Change |
|------|--------|
| `src/shared/ipc-channels.ts` | Add `git:*` channel constants |
| `src/main/index.ts` | Import and call `registerGitIpcHandlers()` |
| `src/main/session-manager.ts` | Add `sendGitAiQuery()` method for AI bridge |
| `src/preload/index.ts` | Expose `window.api.git*` methods and type declarations |
| `src/renderer/src/store/ui-store.ts` | Add `'git'` to `SidebarView` union type |
| `src/renderer/src/components/layout/NavRail.tsx` | Add Git icon + route to `'git'` sidebar view |
| `src/renderer/src/components/layout/Layout.tsx` | Render `<GitPanel>` when `sidebarView === 'git'` |
| `src/renderer/src/App.tsx` | May need update if GitPanel is full-view rather than sidebar panel |

### Deprecated / Replaced

| File | Action |
|------|--------|
| `src/renderer/src/components/GitBranchPanel.tsx` | Replaced by `BranchList.tsx` inside the Git panel. Remove after migration. |

### Not Modified

- `ChangesPanel.tsx` — Serves a different purpose (session-scoped file tracking during Claude sessions)
- `git-status.ts` — Reused by git-graph-service, not modified
- `git-watcher.ts` — Existing events consumed by new stores, not modified
- PR review system — Completely independent

## Design Decisions

**Micro-module over monolithic:** Three focused services instead of one large file. Mirrors existing pattern where `session-manager.ts` and `pr-review-manager.ts` are separate concerns.

**Three separate Zustand stores over sliced store:** The existing codebase uses standalone `create<T>()` calls for every store. Using the slice pattern would introduce an inconsistency. Three separate stores also align with the "independently testable" module philosophy.

**Canvas + DOM hybrid for graph:** Pure SVG degrades past ~500 commits. Pure Canvas loses accessibility. Hybrid gives smooth rendering for topology and accessible DOM for data.

**AI routes through session via git-ai-bridge:** Rather than the git services creating their own Claude SDK connections, a thin `git-ai-bridge.ts` calls a new `sessionManager.sendGitAiQuery()` method. This reuses the existing SDK connection, keeps AI queries in chat history, and adds only one new public method to session-manager.

**Cursor-based pagination for graph:** More reliable than offset-based for a DAG that can change between fetches. Uses last visible commit hash as cursor.

**Single refresh event over fine-grained invalidation:** Git operations have unpredictable side effects. A single `GIT_GRAPH_UPDATED` event after any mutation is simpler and more reliable than tracking which data is stale. Graph fetch is fast (paginated `git log` parsing).

**Absorb GitBranchPanel rather than coexist:** The new BranchList inside the Graph tab provides a superset of GitBranchPanel's functionality. Maintaining both would create confusion. The old component is deprecated and removed.

**Separate `git-ipc-handlers.ts`:** The existing `ipc-handlers.ts` already handles session + PR review channels (~710 lines). Adding ~15 more git channels would reduce maintainability. Dedicated file follows the isolation principle.

**No per-hunk staging in v1:** `git add -p` automation is complex and fragile. Whole-file staging covers the common case. Per-hunk staging can be added later.
