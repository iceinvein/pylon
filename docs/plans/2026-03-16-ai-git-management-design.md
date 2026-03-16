# AI-Assisted Git Management for Pylon

**Date:** 2026-03-16
**Status:** Approved

## Overview

A new "Git" sidebar view in Pylon's NavRail providing rich git visualization, AI-powered commit orchestration, and natural language git commands — all with Claude as a copilot.

## Problem

Pylon has worktree management and a ChangesPanel for session-scoped file tracking, but no general-purpose git UI. Users cannot browse branches, view commit history, stage/unstage files, create commits, resolve conflicts, or get AI assistance with git operations outside the narrow worktree merge flow.

## Approach

**Micro-module architecture** with three independent modules, each owning its own main-process service, Zustand store slice, and component tree:

1. **git-graph** — Rich interactive git graph visualization
2. **git-commit** — AI-powered commit orchestration
3. **git-ops** — Natural language git commands and conflict resolution

A thin `GitPanel` shell composes all three with tab navigation. Each module is independently testable.

**AI interaction model:** Inline ✨ buttons for common quick actions (generate commit message, explain commit), with complex operations routing through the existing session chat for full conversational power.

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
```

### Layout Algorithm

Lane allocation: each branch gets a column. When a branch merges, its lane is freed. New branches take the leftmost available lane. Colors assigned per-lane from a fixed palette.

### Interactions

| Action | Behavior |
|--------|----------|
| Click commit | Expand to show full message, author, changed files, diff stats |
| Right-click commit | Context menu: cherry-pick, revert, reset, create branch → routes to chat |
| Click branch ref | Scroll graph to branch HEAD, highlight branch path |
| Double-click branch | Checkout (with confirmation if dirty) |
| ✨ "Explain" button | Send commit diff to Claude in chat for explanation |
| Scroll | Lazy-load more commits (~100 at a time) |

### Branch List

Collapsible sidebar within the Graph tab:
- Local branches (current highlighted)
- Remote branches (collapsed by default)
- Tags (collapsed by default)
- Ahead/behind indicators for tracked branches

## Module 2: Commit Orchestration

### AI-Assisted Flow

1. **Analyze** — ✨ "Analyze Changes" gathers `git diff` + `git diff --cached`, sends to Claude
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
  hunks?: string[]
}
```

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
- `getWorkingTreeStatus()` — All changed files with status
- `stageFiles(paths)` / `unstageFiles(paths)`
- `analyzeForCommitPlan(sessionId)` — AI commit plan generation
- `executeCommitGroup(group)` — Stage files and commit
- `generateCommitMessage(sessionId)` — Message for currently staged changes

AI calls route through the existing session's Claude connection with a specialized system prompt returning structured JSON.

## Module 3: Natural Language Git Commands & Conflict Resolution

### Command Interface

- **Input** — Text field at bottom with prompt-like feel (`git ▸`). Users type natural language.
- **History** — Scrollable feed showing: request → interpretation → preview → confirm/cancel → result

### Command Flow

1. User types natural language request
2. Sent to Claude via active session chat
3. Claude returns structured response:

```typescript
type GitCommandPlan = {
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
```

4. Rendered with color-coded risk (green/yellow/red)
5. User confirms → main process executes → result displayed
6. Graph tab auto-refreshes

### Conflict Resolution

When any operation produces conflicts:

1. Command tab enters **Conflict Resolution mode**
2. Lists conflicting files
3. AI analyzes both sides and generates resolutions:

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

Added to `src/shared/ipc-channels.ts`:

```
// Git Graph
GIT_GRAPH_GET_LOG
GIT_GRAPH_GET_BRANCHES
GIT_GRAPH_CHECKOUT
GIT_GRAPH_REFRESH

// Git Commit
GIT_COMMIT_GET_STATUS
GIT_COMMIT_ANALYZE
GIT_COMMIT_GENERATE_MSG
GIT_COMMIT_EXECUTE
GIT_COMMIT_STAGE
GIT_COMMIT_UNSTAGE

// Git Ops
GIT_OPS_EXECUTE_NL
GIT_OPS_CONFIRM
GIT_OPS_GET_CONFLICTS
GIT_OPS_RESOLVE_CONFLICTS
GIT_OPS_APPLY_RESOLUTION
GIT_OPS_CONTINUE

// Events (main → renderer)
GIT_GRAPH_UPDATED
GIT_COMMIT_PLAN_READY
GIT_OPS_COMMAND_PLAN
GIT_OPS_CONFLICT_DETECTED
```

### Cross-Module Refresh

After any git-mutating operation, the responsible service sends `GIT_GRAPH_UPDATED` to the renderer. The graph store and commit store both listen and re-fetch. Simple, unidirectional, no coupling between services.

## Zustand Store

Single `git-store.ts` composed from three slices:

```typescript
type GitGraphSlice = {
  commits: GraphCommit[]
  branches: BranchInfo[]
  loading: boolean
  selectedCommit: string | null
  fetchGraph: (cwd: string, offset?: number) => Promise<void>
  selectCommit: (hash: string | null) => void
}

type GitCommitSlice = {
  workingTree: FileStatus[]
  commitPlan: CommitPlan | null
  analyzing: boolean
  fetchStatus: (cwd: string) => Promise<void>
  analyzePlan: (sessionId: string) => Promise<void>
  executeGroup: (group: CommitGroup) => Promise<void>
}

type GitOpsSlice = {
  commandHistory: CommandEntry[]
  pendingPlan: GitCommandPlan | null
  conflicts: ConflictResolution[]
  submitCommand: (sessionId: string, text: string) => Promise<void>
  confirmPlan: (planId: string) => Promise<void>
  applyResolutions: (resolutions: ConflictResolution[]) => Promise<void>
}
```

## File Structure

### New Files

**Main Process (`src/main/`):**
- `git-graph-service.ts` — Graph data, DAG construction
- `git-commit-service.ts` — Staging, commit plan generation, execution
- `git-ops-service.ts` — NL command translation, conflict resolution
- `git-ipc-handlers.ts` — All GIT_* IPC handlers

**Renderer (`src/renderer/src/`):**
- `store/git-store.ts` — Zustand store with 3 slices
- `components/git/GitPanel.tsx` — Shell with tab navigation
- `components/git/GitGraphTab.tsx` — Graph canvas + commit list + branch sidebar
- `components/git/GitGraphCanvas.tsx` — Canvas rendering for topology
- `components/git/GitCommitTab.tsx` — Staging UI + commit plan cards
- `components/git/GitOpsTab.tsx` — NL command input + history + conflict resolver
- `components/git/CommitPlanCard.tsx` — Individual commit group card (draggable)
- `components/git/ConflictResolver.tsx` — Side-by-side conflict resolution view
- `components/git/BranchList.tsx` — Collapsible branch/tag list
- `components/git/CommitDetail.tsx` — Expanded commit view
- `hooks/use-git-bridge.ts` — IPC event bridge for git events
- `lib/git-graph-layout.ts` — Lane allocation algorithm, color assignment

**Shared (`src/shared/`):**
- `git-types.ts` — All shared types

### Modified Files

| File | Change |
|------|--------|
| `src/shared/ipc-channels.ts` | Add GIT_* channel constants |
| `src/main/index.ts` | Import and call `registerGitIpcHandlers()` |
| `src/preload/index.ts` | Expose `window.api.git*` methods |
| `src/preload/index.d.ts` | Type declarations for new API surface |
| `src/renderer/src/components/layout/NavRail.tsx` | Add Git icon + route |
| `src/renderer/src/components/layout/Layout.tsx` | Render `<GitPanel>` when selected |

### Not Modified

- `session-manager.ts` — Git services are independent
- `ChangesPanel.tsx` — Serves a different purpose (session-scoped tracking)
- PR review system — Completely independent

## Design Decisions

**Micro-module over monolithic:** Three focused services instead of one large file. Mirrors existing pattern where `session-manager.ts` and `pr-review-manager.ts` are separate concerns.

**Canvas + DOM hybrid for graph:** Pure SVG degrades past ~500 commits. Pure Canvas loses accessibility. Hybrid gives smooth rendering for topology and accessible DOM for data.

**AI routes through existing session chat:** Reuses the Claude Agent SDK connection already wired per session. Commit analysis and NL commands appear in chat history, enabling conversational follow-up.

**Single refresh event over fine-grained invalidation:** Git operations have unpredictable side effects. A single `GIT_GRAPH_UPDATED` event after any mutation is simpler and more reliable than tracking which data is stale. Graph fetch is fast (paginated `git log` parsing).

**Separate `git-ipc-handlers.ts`:** The existing `ipc-handlers.ts` already handles session + PR review channels. Adding ~15 more git channels would reduce maintainability. Dedicated file follows the isolation principle.
