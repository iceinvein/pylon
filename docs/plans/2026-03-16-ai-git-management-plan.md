# AI-Assisted Git Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Git sidebar panel to Pylon with rich graph visualization, AI-powered commit orchestration, and natural language git commands.

**Architecture:** Micro-module architecture with three independent services (git-graph, git-commit, git-ops), each with its own main-process service, Zustand store, and component tree. A thin GitPanel shell composes them with tab navigation. AI calls route through a git-ai-bridge that delegates to the session manager's existing SDK connection.

**Tech Stack:** Electron 39, React 19, Zustand, Tailwind CSS 4, Canvas API (graph rendering), Claude Agent SDK (AI features)

**Spec:** `docs/plans/2026-03-16-ai-git-management-design.md`

---

## Chunk 1: Foundation — Types, IPC Channels, Stores, Panel Shell

### Task 1: Shared Types

**Files:**
- Create: `src/shared/git-types.ts`

- [ ] **Step 1: Create git-types.ts with all shared types**

```typescript
// src/shared/git-types.ts

// ── Git Graph types ──

export type GraphRef = {
  name: string
  type: 'local-branch' | 'remote-branch' | 'tag' | 'head'
  isCurrent: boolean
}

export type GraphLine = {
  fromColumn: number
  toColumn: number
  type: 'straight' | 'merge-in' | 'fork-out'
  color: string
}

export type GraphCommit = {
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

export type BranchInfo = {
  name: string
  type: 'local' | 'remote'
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
  headHash: string
}

// ── Git Commit types ──

export type FileStatus = {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export type StagedFile = {
  path: string
}

export type CommitGroup = {
  title: string
  message: string
  files: StagedFile[]
  order: number
  rationale: string
}

export type CommitPlan = {
  groups: CommitGroup[]
  reasoning: string
}

// ── Git Ops types ──

export type PlannedCommand = {
  command: string
  explanation: string
}

export type GitCommandPlan = {
  id: string
  interpretation: string
  commands: PlannedCommand[]
  preview: string
  riskLevel: 'safe' | 'moderate' | 'destructive'
  warnings?: string[]
}

export type CommandEntry = {
  id: string
  request: string
  plan: GitCommandPlan | null
  status: 'pending' | 'planned' | 'confirmed' | 'executing' | 'completed' | 'failed' | 'cancelled'
  result?: string
  error?: string
  timestamp: number
}

export type ConflictResolution = {
  filePath: string
  originalContent: string
  resolvedContent: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/git-types.ts
git commit -m "feat(git): add shared type definitions for git management"
```

---

### Task 2: IPC Channels

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add git management IPC channels**

Add these entries inside the `IPC` object, after the existing `GIT_WATCH` line (line 40):

```typescript
  // Git Graph
  GIT_GRAPH_GET_LOG: 'git:graph:get-log',
  GIT_GRAPH_GET_BRANCHES: 'git:graph:get-branches',
  GIT_GRAPH_CHECKOUT: 'git:graph:checkout',
  GIT_GRAPH_REFRESH: 'git:graph:refresh',
  // Git Commit
  GIT_COMMIT_GET_STATUS: 'git:commit:get-status',
  GIT_COMMIT_ANALYZE: 'git:commit:analyze',
  GIT_COMMIT_GENERATE_MSG: 'git:commit:generate-msg',
  GIT_COMMIT_EXECUTE: 'git:commit:execute',
  GIT_COMMIT_STAGE: 'git:commit:stage',
  GIT_COMMIT_UNSTAGE: 'git:commit:unstage',
  // Git Ops
  GIT_OPS_EXECUTE_NL: 'git:ops:execute-nl',
  GIT_OPS_CONFIRM: 'git:ops:confirm',
  GIT_OPS_GET_CONFLICTS: 'git:ops:get-conflicts',
  GIT_OPS_RESOLVE_CONFLICTS: 'git:ops:resolve-conflicts',
  GIT_OPS_APPLY_RESOLUTION: 'git:ops:apply-resolution',
  GIT_OPS_CONTINUE: 'git:ops:continue',
  // Git Events (main → renderer)
  GIT_GRAPH_UPDATED: 'git:graph:updated',
  GIT_COMMIT_PLAN_READY: 'git:commit:plan-ready',
  GIT_OPS_COMMAND_PLAN: 'git:ops:command-plan',
  GIT_OPS_CONFLICT_DETECTED: 'git:ops:conflict-detected',
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(git): add IPC channel constants for git management"
```

---

### Task 3: UI Store Update

**Files:**
- Modify: `src/renderer/src/store/ui-store.ts`

- [ ] **Step 1: Add 'git' to SidebarView union**

Change line 3 from:
```typescript
type SidebarView = 'home' | 'history' | 'pr-review' | 'testing' | 'settings'
```
To:
```typescript
type SidebarView = 'home' | 'history' | 'pr-review' | 'testing' | 'git' | 'settings'
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/store/ui-store.ts
git commit -m "feat(git): add 'git' to SidebarView union type"
```

---

### Task 4: Git Graph Store

**Files:**
- Create: `src/renderer/src/store/git-graph-store.ts`

- [ ] **Step 1: Create the store**

```typescript
import { create } from 'zustand'
import { log } from '../../../shared/logger'
import type { BranchInfo, GraphCommit } from '../../../shared/git-types'

const logger = log.child('git-graph-store')

type GitGraphStore = {
  commits: GraphCommit[]
  branches: BranchInfo[]
  loading: boolean
  error: string | null
  selectedCommit: string | null
  hasMore: boolean

  fetchGraph: (cwd: string, afterHash?: string) => Promise<void>
  fetchBranches: (cwd: string) => Promise<void>
  selectCommit: (hash: string | null) => void
  reset: () => void
}

export const useGitGraphStore = create<GitGraphStore>((set, get) => ({
  commits: [],
  branches: [],
  loading: false,
  error: null,
  selectedCommit: null,
  hasMore: true,

  fetchGraph: async (cwd, afterHash) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.gitGraphGetLog(cwd, afterHash)
      set((s) => ({
        commits: afterHash ? [...s.commits, ...result] : result,
        hasMore: result.length >= 100,
        loading: false,
      }))
    } catch (err) {
      logger.error('Failed to fetch graph:', err)
      set({ error: 'Failed to load commit graph', loading: false })
    }
  },

  fetchBranches: async (cwd) => {
    try {
      const branches = await window.api.gitGraphGetBranches(cwd)
      set({ branches })
    } catch (err) {
      logger.error('Failed to fetch branches:', err)
    }
  },

  selectCommit: (hash) => set({ selectedCommit: hash }),

  reset: () =>
    set({
      commits: [],
      branches: [],
      loading: false,
      error: null,
      selectedCommit: null,
      hasMore: true,
    }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/store/git-graph-store.ts
git commit -m "feat(git): add git graph Zustand store"
```

---

### Task 5: Git Commit Store

**Files:**
- Create: `src/renderer/src/store/git-commit-store.ts`

- [ ] **Step 1: Create the store**

```typescript
import { create } from 'zustand'
import { log } from '../../../shared/logger'
import type { CommitGroup, CommitPlan, FileStatus } from '../../../shared/git-types'

const logger = log.child('git-commit-store')

type GitCommitStore = {
  workingTree: FileStatus[]
  commitPlan: CommitPlan | null
  analyzing: boolean
  error: string | null

  fetchStatus: (cwd: string) => Promise<void>
  analyzePlan: (cwd: string, sessionId: string) => Promise<void>
  executeGroup: (cwd: string, group: CommitGroup) => Promise<void>
  generateMessage: (cwd: string, sessionId: string) => Promise<string | null>
  stageFiles: (cwd: string, paths: string[]) => Promise<void>
  unstageFiles: (cwd: string, paths: string[]) => Promise<void>
  setCommitPlan: (plan: CommitPlan | null) => void
  reset: () => void
}

export const useGitCommitStore = create<GitCommitStore>((set) => ({
  workingTree: [],
  commitPlan: null,
  analyzing: false,
  error: null,

  fetchStatus: async (cwd) => {
    try {
      const statuses = await window.api.gitCommitGetStatus(cwd)
      set({ workingTree: statuses, error: null })
    } catch (err) {
      logger.error('Failed to fetch working tree status:', err)
      set({ error: 'Failed to load file statuses' })
    }
  },

  analyzePlan: async (cwd, sessionId) => {
    set({ analyzing: true, error: null })
    try {
      const plan = await window.api.gitCommitAnalyze(cwd, sessionId)
      set({ commitPlan: plan, analyzing: false })
    } catch (err) {
      logger.error('Failed to analyze commit plan:', err)
      set({ error: 'Failed to generate commit plan', analyzing: false })
    }
  },

  executeGroup: async (cwd, group) => {
    try {
      await window.api.gitCommitExecute(cwd, group)
    } catch (err) {
      logger.error('Failed to execute commit group:', err)
      set({ error: 'Commit failed' })
    }
  },

  generateMessage: async (cwd, sessionId) => {
    try {
      return await window.api.gitCommitGenerateMsg(cwd, sessionId)
    } catch (err) {
      logger.error('Failed to generate commit message:', err)
      set({ error: 'Failed to generate message' })
      return null
    }
  },

  stageFiles: async (cwd, paths) => {
    await window.api.gitCommitStage(cwd, paths)
  },

  unstageFiles: async (cwd, paths) => {
    await window.api.gitCommitUnstage(cwd, paths)
  },

  setCommitPlan: (plan) => set({ commitPlan: plan }),

  reset: () =>
    set({ workingTree: [], commitPlan: null, analyzing: false, error: null }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/store/git-commit-store.ts
git commit -m "feat(git): add git commit Zustand store"
```

---

### Task 6: Git Ops Store

**Files:**
- Create: `src/renderer/src/store/git-ops-store.ts`

- [ ] **Step 1: Create the store**

```typescript
import { create } from 'zustand'
import { log } from '../../../shared/logger'
import type { CommandEntry, ConflictResolution, GitCommandPlan } from '../../../shared/git-types'

const logger = log.child('git-ops-store')

type GitOpsStore = {
  commandHistory: CommandEntry[]
  pendingPlan: GitCommandPlan | null
  conflicts: ConflictResolution[]
  error: string | null

  submitCommand: (cwd: string, sessionId: string, text: string) => Promise<void>
  confirmPlan: (cwd: string, planId: string) => Promise<void>
  cancelPlan: () => void
  applyResolutions: (cwd: string, resolutions: ConflictResolution[]) => Promise<void>
  setConflicts: (conflicts: ConflictResolution[]) => void
  reset: () => void
}

export const useGitOpsStore = create<GitOpsStore>((set, get) => ({
  commandHistory: [],
  pendingPlan: null,
  conflicts: [],
  error: null,

  submitCommand: async (cwd, sessionId, text) => {
    const entry: CommandEntry = {
      id: crypto.randomUUID(),
      request: text,
      plan: null,
      status: 'pending',
      timestamp: Date.now(),
    }
    set((s) => ({ commandHistory: [...s.commandHistory, entry], error: null }))

    try {
      const plan = await window.api.gitOpsExecuteNl(cwd, sessionId, text)
      set((s) => ({
        pendingPlan: plan,
        commandHistory: s.commandHistory.map((e) =>
          e.id === entry.id ? { ...e, plan, status: 'planned' as const } : e,
        ),
      }))
    } catch (err) {
      logger.error('Failed to interpret command:', err)
      set((s) => ({
        error: 'Failed to interpret command',
        commandHistory: s.commandHistory.map((e) =>
          e.id === entry.id ? { ...e, status: 'failed' as const, error: String(err) } : e,
        ),
      }))
    }
  },

  confirmPlan: async (cwd, planId) => {
    set((s) => ({
      commandHistory: s.commandHistory.map((e) =>
        e.plan?.id === planId ? { ...e, status: 'executing' as const } : e,
      ),
    }))
    try {
      const result = await window.api.gitOpsConfirm(cwd, planId)
      set((s) => ({
        pendingPlan: null,
        commandHistory: s.commandHistory.map((e) =>
          e.plan?.id === planId
            ? { ...e, status: result.success ? ('completed' as const) : ('failed' as const), result: result.result }
            : e,
        ),
      }))
    } catch (err) {
      logger.error('Failed to execute plan:', err)
      set((s) => ({
        error: 'Command execution failed',
        commandHistory: s.commandHistory.map((e) =>
          e.plan?.id === planId ? { ...e, status: 'failed' as const, error: String(err) } : e,
        ),
      }))
    }
  },

  cancelPlan: () =>
    set((s) => ({
      pendingPlan: null,
      commandHistory: s.commandHistory.map((e) =>
        e.status === 'planned' ? { ...e, status: 'cancelled' as const } : e,
      ),
    })),

  applyResolutions: async (cwd, resolutions) => {
    try {
      await window.api.gitOpsApplyResolution(cwd, resolutions)
      set({ conflicts: [] })
    } catch (err) {
      logger.error('Failed to apply resolutions:', err)
      set({ error: 'Failed to apply conflict resolutions' })
    }
  },

  setConflicts: (conflicts) => set({ conflicts }),

  reset: () =>
    set({ commandHistory: [], pendingPlan: null, conflicts: [], error: null }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/store/git-ops-store.ts
git commit -m "feat(git): add git ops Zustand store"
```

---

### Task 7: Preload API Surface

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add git methods to preload/index.ts**

Add after the existing `watchGitCwd` / `onGitStatusChanged` block (after line 54):

```typescript
  // Git Graph
  gitGraphGetLog: (cwd: string, afterHash?: string) =>
    ipcRenderer.invoke(IPC.GIT_GRAPH_GET_LOG, { cwd, afterHash }),
  gitGraphGetBranches: (cwd: string) =>
    ipcRenderer.invoke(IPC.GIT_GRAPH_GET_BRANCHES, { cwd }),
  gitGraphCheckout: (cwd: string, branch: string) =>
    ipcRenderer.invoke(IPC.GIT_GRAPH_CHECKOUT, { cwd, branch }),

  // Git Commit
  gitCommitGetStatus: (cwd: string) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_GET_STATUS, { cwd }),
  gitCommitAnalyze: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_ANALYZE, { cwd, sessionId }),
  gitCommitGenerateMsg: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_GENERATE_MSG, { cwd, sessionId }),
  gitCommitExecute: (cwd: string, group: unknown) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_EXECUTE, { cwd, group }),
  gitCommitStage: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_STAGE, { cwd, paths }),
  gitCommitUnstage: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_UNSTAGE, { cwd, paths }),

  // Git Ops
  gitOpsExecuteNl: (cwd: string, sessionId: string, text: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_EXECUTE_NL, { cwd, sessionId, text }),
  gitOpsConfirm: (cwd: string, planId: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_CONFIRM, { cwd, planId }),
  gitOpsGetConflicts: (cwd: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_GET_CONFLICTS, { cwd }),
  gitOpsResolveConflicts: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_RESOLVE_CONFLICTS, { cwd, sessionId }),
  gitOpsApplyResolution: (cwd: string, resolutions: unknown[]) =>
    ipcRenderer.invoke(IPC.GIT_OPS_APPLY_RESOLUTION, { cwd, resolutions }),
  gitOpsContinue: (cwd: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_CONTINUE, { cwd }),

  // Git Events (main → renderer)
  onGitGraphUpdated: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GIT_GRAPH_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC.GIT_GRAPH_UPDATED, handler)
  },
  onGitOpsConflictDetected: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GIT_OPS_CONFLICT_DETECTED, handler)
    return () => ipcRenderer.removeListener(IPC.GIT_OPS_CONFLICT_DETECTED, handler)
  },
```

- [ ] **Step 2: Add type declarations to preload/index.d.ts**

Add after the existing `onGitStatusChanged` type (after line 53):

```typescript
  // Git Graph
  gitGraphGetLog: (cwd: string, afterHash?: string) => Promise<import('../shared/git-types').GraphCommit[]>
  gitGraphGetBranches: (cwd: string) => Promise<import('../shared/git-types').BranchInfo[]>
  gitGraphCheckout: (cwd: string, branch: string) => Promise<{ success: boolean }>
  // Git Commit
  gitCommitGetStatus: (cwd: string) => Promise<import('../shared/git-types').FileStatus[]>
  gitCommitAnalyze: (cwd: string, sessionId: string) => Promise<import('../shared/git-types').CommitPlan>
  gitCommitGenerateMsg: (cwd: string, sessionId: string) => Promise<string>
  gitCommitExecute: (cwd: string, group: import('../shared/git-types').CommitGroup) => Promise<{ success: boolean }>
  gitCommitStage: (cwd: string, paths: string[]) => Promise<void>
  gitCommitUnstage: (cwd: string, paths: string[]) => Promise<void>
  // Git Ops
  gitOpsExecuteNl: (cwd: string, sessionId: string, text: string) => Promise<import('../shared/git-types').GitCommandPlan>
  gitOpsConfirm: (cwd: string, planId: string) => Promise<{ success: boolean; result?: string }>
  gitOpsGetConflicts: (cwd: string) => Promise<{ filePath: string; status: string }[]>
  gitOpsResolveConflicts: (cwd: string, sessionId: string) => Promise<import('../shared/git-types').ConflictResolution[]>
  gitOpsApplyResolution: (cwd: string, resolutions: import('../shared/git-types').ConflictResolution[]) => Promise<void>
  gitOpsContinue: (cwd: string) => Promise<{ success: boolean }>
  // Git Events
  onGitGraphUpdated: (callback: (data: unknown) => void) => () => void
  onGitOpsConflictDetected: (callback: (data: unknown) => void) => () => void
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(git): expose git management API through preload bridge"
```

---

### Task 8: GitPanel Shell Component

**Files:**
- Create: `src/renderer/src/components/git/GitPanel.tsx`

- [ ] **Step 1: Create the panel shell with tab navigation**

```tsx
import { GitBranch, GitCommitHorizontal, Terminal } from 'lucide-react'
import { useState } from 'react'
import { useTabStore } from '../../store/tab-store'

type GitTab = 'graph' | 'commit' | 'command'

const TAB_CONFIG: { id: GitTab; label: string; icon: typeof GitBranch }[] = [
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'commit', label: 'Commit', icon: GitCommitHorizontal },
  { id: 'command', label: 'Command', icon: Terminal },
]

export function GitPanel() {
  const [activeTab, setActiveTab] = useState<GitTab>('graph')
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)
  const cwd = tab?.cwd ?? ''

  if (!cwd) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-stone-600 text-xs">Open a project to use Git tools</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab strip */}
      <div className="flex border-stone-800 border-b">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs transition-colors ${
              activeTab === id
                ? 'border-amber-500 border-b-2 text-stone-100'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'graph' && (
          <div className="flex h-full items-center justify-center text-stone-600 text-xs">
            Graph tab — coming soon
          </div>
        )}
        {activeTab === 'commit' && (
          <div className="flex h-full items-center justify-center text-stone-600 text-xs">
            Commit tab — coming soon
          </div>
        )}
        {activeTab === 'command' && (
          <div className="flex h-full items-center justify-center text-stone-600 text-xs">
            Command tab — coming soon
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/git/GitPanel.tsx
git commit -m "feat(git): add GitPanel shell with tab navigation"
```

---

### Task 9: Wire GitPanel into NavRail, Layout, and App

**Files:**
- Modify: `src/renderer/src/components/layout/NavRail.tsx`
- Modify: `src/renderer/src/components/layout/Layout.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add Git button to NavRail**

In `NavRail.tsx`, add `GitBranch` to the import from lucide-react (it's already imported, but verify). Add a new button between the "AI Testing" button and the `mt-auto` spacer div. Follow the exact same pattern as the other buttons:

```tsx
      <motion.button
        onClick={() => setSidebarView(sidebarView === 'git' ? 'home' : 'git')}
        title="Git"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          sidebarView === 'git' ? 'text-stone-100' : 'text-stone-400 hover:text-stone-100'
        }`}
      >
        {sidebarView === 'git' && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-lg bg-stone-700"
            transition={{ duration: 0.15, ease: 'easeOut' }}
          />
        )}
        <GitBranch size={18} className="relative z-10" />
      </motion.button>
```

- [ ] **Step 2: Update Layout.tsx to render GitPanel**

Import `GitPanel`:
```typescript
import { GitPanel } from '../git/GitPanel'
```

The git panel replaces the old `GitBranchPanel` in the layout. In `Layout.tsx`, the existing `showGitPanel` logic (lines 36-41) that renders `GitBranchPanel` should be replaced. Change the `AnimatePresence` block for the git panel (lines 128-147) to render `GitPanel` when `sidebarView === 'git'`:

Replace the existing git-panel `AnimatePresence` block (lines 127-147) with:

```tsx
      {/* Git management panel */}
      <AnimatePresence initial={false}>
        {sidebarView === 'git' && (
          <motion.div
            key="git-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 420, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-shrink-0 overflow-hidden border-stone-800 border-r pt-12"
          >
            <div className="min-w-0 flex-1">
              <GitPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
```

Also keep the old `GitBranchPanel` rendering for when `sidebarView !== 'git'` but `gitPanelOpen` is true — this preserves backward compatibility during migration. The old panel will be removed in Chunk 5 (Integration & Cleanup).

- [ ] **Step 3: Update App.tsx to handle 'git' sidebar view**

In `App.tsx`, update the content routing (lines 102-110) to include `'git'`:

```tsx
        {sidebarView === 'pr-review' ? (
          <PrReviewView />
        ) : sidebarView === 'testing' ? (
          <TestView />
        ) : sidebarView === 'git' ? (
          activeTab?.cwd ? (
            <SessionView key={activeTab.id} tab={activeTab} />
          ) : (
            <HomePage />
          )
        ) : activeTab?.cwd ? (
          <SessionView key={activeTab.id} tab={activeTab} />
        ) : (
          <HomePage />
        )}
```

Note: When `sidebarView === 'git'`, the main content area still shows the session — the GitPanel is rendered as a sidebar panel by Layout.tsx, not as a full-page replacement.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS (may have warnings about unused imports which is fine for now)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/layout/NavRail.tsx src/renderer/src/components/layout/Layout.tsx src/renderer/src/App.tsx
git commit -m "feat(git): wire GitPanel into NavRail, Layout, and App routing"
```

---

### Task 10: IPC Event Bridge Hook

**Files:**
- Create: `src/renderer/src/hooks/use-git-bridge.ts`

- [ ] **Step 1: Create the bridge hook**

This hook subscribes to main→renderer push events and updates all three stores:

```typescript
import { useEffect } from 'react'
import { useGitCommitStore } from '../store/git-commit-store'
import { useGitGraphStore } from '../store/git-graph-store'
import { useGitOpsStore } from '../store/git-ops-store'
import { useTabStore } from '../store/tab-store'

export function useGitBridge() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const cwd = activeTab?.cwd ?? ''

  const fetchGraph = useGitGraphStore((s) => s.fetchGraph)
  const fetchBranches = useGitGraphStore((s) => s.fetchBranches)
  const fetchStatus = useGitCommitStore((s) => s.fetchStatus)
  const setConflicts = useGitOpsStore((s) => s.setConflicts)

  // Listen for git graph updated events (fired after any git mutation)
  useEffect(() => {
    if (!cwd) return

    const unsub = window.api.onGitGraphUpdated(() => {
      fetchGraph(cwd)
      fetchBranches(cwd)
      fetchStatus(cwd)
    })

    return unsub
  }, [cwd, fetchGraph, fetchBranches, fetchStatus])

  // Listen for conflict detected events
  useEffect(() => {
    if (!cwd) return

    const unsub = window.api.onGitOpsConflictDetected((data: unknown) => {
      const conflicts = data as import('../../../shared/git-types').ConflictResolution[]
      setConflicts(conflicts)
    })

    return unsub
  }, [cwd, setConflicts])
}
```

- [ ] **Step 2: Wire into App.tsx**

Import and call `useGitBridge()` in `App.tsx`, alongside the existing bridge hooks:

```typescript
import { useGitBridge } from './hooks/use-git-bridge'
// ...
export default function App() {
  useIpcBridge()
  usePrReviewBridge()
  useTestBridge()
  useGitBridge()
  // ...
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/use-git-bridge.ts src/renderer/src/App.tsx
git commit -m "feat(git): add IPC event bridge hook for git stores"
```

---

### Task 11: Git Graph Service (Main Process)

**Files:**
- Create: `src/main/git-graph-service.ts`
- Test: `src/main/__tests__/git-graph-service.test.ts`

- [ ] **Step 1: Write tests for git log parsing**

```typescript
// src/main/__tests__/git-graph-service.test.ts
import { describe, expect, test } from 'bun:test'
import { parseGitLogLine, assignLanes } from '../git-graph-service'

describe('parseGitLogLine', () => {
  test('parses a simple commit', () => {
    const line = 'abc1234|def5678|HEAD -> main, origin/main|fix: typo|Alice|2026-03-16T10:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.hash).toBe('abc1234')
    expect(commit.shortHash).toBe('abc1234')
    expect(commit.parents).toEqual(['def5678'])
    expect(commit.message).toBe('fix: typo')
    expect(commit.author).toBe('Alice')
    expect(commit.refs).toHaveLength(3)
    expect(commit.refs[0]).toEqual({ name: 'main', type: 'local-branch', isCurrent: true })
    expect(commit.refs[1]).toEqual({ name: 'origin/main', type: 'remote-branch', isCurrent: false })
  })

  test('parses merge commit with two parents', () => {
    const line = 'aaa|bbb ccc||Merge branch feature|Bob|2026-03-15T09:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.parents).toEqual(['bbb', 'ccc'])
  })

  test('parses commit with no refs', () => {
    const line = 'abc|def||some message|Eve|2026-03-14T08:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.refs).toEqual([])
  })

  test('parses tag ref', () => {
    const line = 'abc|def|tag: v1.0.0|release|Eve|2026-03-14T08:00:00Z'
    const commit = parseGitLogLine(line)
    expect(commit.refs[0]).toEqual({ name: 'v1.0.0', type: 'tag', isCurrent: false })
  })
})

describe('assignLanes', () => {
  test('assigns column 0 to a linear history', () => {
    const commits = [
      { hash: 'a', parents: ['b'], refs: [], message: '', author: '', date: '', shortHash: 'a', graphColumns: 0, graphLines: [] },
      { hash: 'b', parents: ['c'], refs: [], message: '', author: '', date: '', shortHash: 'b', graphColumns: 0, graphLines: [] },
      { hash: 'c', parents: [], refs: [], message: '', author: '', date: '', shortHash: 'c', graphColumns: 0, graphLines: [] },
    ]
    const result = assignLanes(commits)
    expect(result.every((c) => c.graphColumns === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/main/__tests__/git-graph-service.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement git-graph-service.ts**

```typescript
// src/main/git-graph-service.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { log } from '../shared/logger'
import type { BranchInfo, GraphCommit, GraphLine, GraphRef } from '../shared/git-types'
import { getBranchStatus } from './git-status'

const execFileAsync = promisify(execFile)
const logger = log.child('git-graph-service')

const LANE_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export function parseGitLogLine(line: string): GraphCommit {
  const parts = line.split('|')
  const hash = parts[0] ?? ''
  const parentStr = parts[1] ?? ''
  const refStr = parts[2] ?? ''
  const message = parts[3] ?? ''
  const author = parts[4] ?? ''
  const date = parts[5] ?? ''

  const parents = parentStr.trim() ? parentStr.trim().split(' ') : []

  const refs: GraphRef[] = []
  if (refStr.trim()) {
    for (const raw of refStr.split(',').map((s) => s.trim())) {
      if (raw.startsWith('HEAD -> ')) {
        refs.push({ name: raw.slice(8), type: 'local-branch', isCurrent: true })
      } else if (raw === 'HEAD') {
        refs.push({ name: 'HEAD', type: 'head', isCurrent: true })
      } else if (raw.startsWith('tag: ')) {
        refs.push({ name: raw.slice(5), type: 'tag', isCurrent: false })
      } else if (raw.includes('/')) {
        refs.push({ name: raw, type: 'remote-branch', isCurrent: false })
      } else {
        refs.push({ name: raw, type: 'local-branch', isCurrent: false })
      }
    }
  }

  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    message,
    author,
    date,
    refs,
    graphColumns: 0,
    graphLines: [],
  }
}

export function assignLanes(commits: GraphCommit[]): GraphCommit[] {
  const lanes: (string | null)[] = []
  const hashToLane = new Map<string, number>()

  for (const commit of commits) {
    // Find or assign lane for this commit
    let col = hashToLane.get(commit.hash)
    if (col === undefined) {
      col = lanes.indexOf(null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
      }
    }
    lanes[col] = null
    commit.graphColumns = col

    const lines: GraphLine[] = []

    // Assign first parent to same lane (continuation)
    if (commit.parents[0]) {
      lanes[col] = commit.parents[0]
      hashToLane.set(commit.parents[0], col)
      lines.push({
        fromColumn: col,
        toColumn: col,
        type: 'straight',
        color: LANE_COLORS[col % LANE_COLORS.length],
      })
    }

    // Additional parents get new lanes (merge lines)
    for (let i = 1; i < commit.parents.length; i++) {
      const parent = commit.parents[i]
      const existingLane = hashToLane.get(parent)
      if (existingLane !== undefined) {
        lines.push({
          fromColumn: col,
          toColumn: existingLane,
          type: 'merge-in',
          color: LANE_COLORS[existingLane % LANE_COLORS.length],
        })
      } else {
        let newLane = lanes.indexOf(null)
        if (newLane === -1) {
          newLane = lanes.length
          lanes.push(null)
        }
        lanes[newLane] = parent
        hashToLane.set(parent, newLane)
        lines.push({
          fromColumn: col,
          toColumn: newLane,
          type: 'fork-out',
          color: LANE_COLORS[newLane % LANE_COLORS.length],
        })
      }
    }

    commit.graphLines = lines
  }

  return commits
}

export async function getGraphLog(
  cwd: string,
  afterHash?: string,
  limit = 100,
): Promise<GraphCommit[]> {
  const args = [
    'log',
    '--all',
    '--format=%H|%P|%D|%s|%an|%aI',
    '--topo-order',
    `-${limit}`,
  ]

  if (afterHash) {
    args.push(`${afterHash}~1`)
  }

  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 10000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    const commits = lines.map(parseGitLogLine)
    return assignLanes(commits)
  } catch (err) {
    logger.error('Failed to get graph log:', err)
    return []
  }
}

export async function getGitBranches(cwd: string): Promise<BranchInfo[]> {
  const branches: BranchInfo[] = []

  try {
    // Local branches
    const { stdout: localOut } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(HEAD)', 'refs/heads/'],
      { cwd, timeout: 5000 },
    )
    for (const line of localOut.trim().split('\n').filter(Boolean)) {
      const [name, headHash, upstream, headMarker] = line.split('|')
      if (!name) continue

      let ahead = 0
      let behind = 0
      if (upstream) {
        try {
          const { stdout: counts } = await execFileAsync(
            'git',
            ['rev-list', '--left-right', '--count', `${name}...${upstream}`],
            { cwd, timeout: 3000 },
          )
          const parts = counts.trim().split('\t')
          ahead = Number(parts[0]) || 0
          behind = Number(parts[1]) || 0
        } catch {
          // No upstream tracking
        }
      }

      branches.push({
        name: name ?? '',
        type: 'local',
        isCurrent: headMarker?.trim() === '*',
        upstream: upstream || null,
        ahead,
        behind,
        headHash: headHash ?? '',
      })
    }

    // Remote branches
    const { stdout: remoteOut } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)|%(objectname:short)', 'refs/remotes/'],
      { cwd, timeout: 5000 },
    )
    for (const line of remoteOut.trim().split('\n').filter(Boolean)) {
      const [name, headHash] = line.split('|')
      if (!name || name.endsWith('/HEAD')) continue
      branches.push({
        name: name ?? '',
        type: 'remote',
        isCurrent: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        headHash: headHash ?? '',
      })
    }
  } catch (err) {
    logger.error('Failed to get branches:', err)
  }

  return branches
}

export async function checkoutBranch(
  cwd: string,
  branch: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync('git', ['checkout', branch], { cwd, timeout: 10000 })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Checkout failed:', message)
    return { success: false, error: message }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun test src/main/__tests__/git-graph-service.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/git-graph-service.ts src/main/__tests__/git-graph-service.test.ts
git commit -m "feat(git): implement git graph service with log parsing and lane assignment"
```

---

### Task 12: Git Commit Service (Main Process)

**Files:**
- Create: `src/main/git-commit-service.ts`

- [ ] **Step 1: Implement git-commit-service.ts**

```typescript
// src/main/git-commit-service.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { log } from '../shared/logger'
import type { CommitGroup, FileStatus } from '../shared/git-types'

const execFileAsync = promisify(execFile)
const logger = log.child('git-commit-service')

export async function getWorkingTreeStatus(cwd: string): Promise<FileStatus[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v2'], {
      cwd,
      timeout: 10000,
    })

    const files: FileStatus[] = []
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      if (line.startsWith('1 ') || line.startsWith('2 ')) {
        // Changed entry
        const parts = line.split(' ')
        const xy = parts[1] ?? ''
        const path = line.split('\t')[0]?.split(' ').pop() ?? ''

        const indexStatus = xy[0]
        const workTreeStatus = xy[1]
        const staged = indexStatus !== '.' && indexStatus !== '?'

        let status: FileStatus['status'] = 'modified'
        const relevantCode = staged ? indexStatus : workTreeStatus
        if (relevantCode === 'A') status = 'added'
        else if (relevantCode === 'D') status = 'deleted'
        else if (relevantCode === 'R') status = 'renamed'

        files.push({ path, status, staged })
      } else if (line.startsWith('? ')) {
        // Untracked
        const path = line.slice(2)
        files.push({ path, status: 'untracked', staged: false })
      }
    }

    return files
  } catch (err) {
    logger.error('Failed to get working tree status:', err)
    return []
  }
}

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await execFileAsync('git', ['add', '--', ...paths], { cwd, timeout: 10000 })
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await execFileAsync('git', ['restore', '--staged', '--', ...paths], { cwd, timeout: 10000 })
}

export async function executeCommitGroup(
  cwd: string,
  group: CommitGroup,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Reset staging area first
    await execFileAsync('git', ['reset', 'HEAD'], { cwd, timeout: 5000 }).catch(() => {})

    // Stage only the files in this group
    const paths = group.files.map((f) => f.path)
    await stageFiles(cwd, paths)

    // Commit
    await execFileAsync('git', ['commit', '-m', group.message], { cwd, timeout: 10000 })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Commit failed:', message)
    return { success: false, error: message }
  }
}

export async function getDiffForAnalysis(cwd: string): Promise<string> {
  const parts: string[] = []

  try {
    const { stdout: staged } = await execFileAsync('git', ['diff', '--cached'], {
      cwd,
      timeout: 10000,
    })
    if (staged.trim()) parts.push('=== STAGED CHANGES ===\n' + staged)
  } catch {
    // No staged changes
  }

  try {
    const { stdout: unstaged } = await execFileAsync('git', ['diff'], {
      cwd,
      timeout: 10000,
    })
    if (unstaged.trim()) parts.push('=== UNSTAGED CHANGES ===\n' + unstaged)
  } catch {
    // No unstaged changes
  }

  // Include untracked files
  try {
    const { stdout: untracked } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd, timeout: 5000 },
    )
    if (untracked.trim()) parts.push('=== UNTRACKED FILES ===\n' + untracked)
  } catch {
    // Ignore
  }

  return parts.join('\n\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/git-commit-service.ts
git commit -m "feat(git): implement git commit service with staging and execution"
```

---

### Task 13: Git Ops Service (Main Process)

**Files:**
- Create: `src/main/git-ops-service.ts`

- [ ] **Step 1: Implement git-ops-service.ts**

```typescript
// src/main/git-ops-service.ts
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { log } from '../shared/logger'

const execFileAsync = promisify(execFile)
const logger = log.child('git-ops-service')

export async function executeGitCommands(
  cwd: string,
  commands: string[],
): Promise<{ success: boolean; output: string; error?: string }> {
  const outputs: string[] = []

  for (const cmd of commands) {
    const parts = cmd.split(/\s+/)
    if (parts[0] !== 'git') {
      return { success: false, output: outputs.join('\n'), error: `Refusing non-git command: ${cmd}` }
    }

    try {
      const { stdout, stderr } = await execFileAsync('git', parts.slice(1), {
        cwd,
        timeout: 30000,
      })
      outputs.push(stdout.trim() || stderr.trim() || `(${cmd} completed)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, output: outputs.join('\n'), error: message }
    }
  }

  return { success: true, output: outputs.join('\n') }
}

export async function getConflictFiles(
  cwd: string,
): Promise<{ filePath: string; status: string }[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd,
      timeout: 5000,
    })
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => ({ filePath: f, status: 'conflict' }))
  } catch {
    return []
  }
}

export async function readConflictFile(cwd: string, filePath: string): Promise<string> {
  const { join } = await import('node:path')
  const fullPath = join(cwd, filePath)
  return readFile(fullPath, 'utf-8')
}

export async function writeResolvedFile(
  cwd: string,
  filePath: string,
  content: string,
): Promise<void> {
  const { join } = await import('node:path')
  const fullPath = join(cwd, filePath)
  await writeFile(fullPath, content, 'utf-8')
  await execFileAsync('git', ['add', filePath], { cwd, timeout: 5000 })
}

export async function continueOperation(
  cwd: string,
): Promise<{ success: boolean; error?: string }> {
  // Try rebase first, then merge, then cherry-pick
  for (const op of ['rebase', 'merge', 'cherry-pick']) {
    try {
      await execFileAsync('git', [op, '--continue'], { cwd, timeout: 30000 })
      return { success: true }
    } catch {
      // Not in this operation, try next
    }
  }
  return { success: false, error: 'No interrupted operation to continue' }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/git-ops-service.ts
git commit -m "feat(git): implement git ops service with command execution and conflict handling"
```

---

### Task 14: Git AI Bridge (Main Process)

**Files:**
- Create: `src/main/git-ai-bridge.ts`
- Modify: `src/main/session-manager.ts`

- [ ] **Step 1: Add sendGitAiQuery to session-manager.ts**

Find the `getSessionInfo` method in `session-manager.ts` and add after it:

```typescript
  async sendGitAiQuery(
    sessionId: string,
    prompt: string,
    systemPrompt: string,
  ): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    // Use the session's SDK to send a one-shot query
    // For now, this creates a user message in the session
    const text = `[Git AI Assistant]\n\nSystem: ${systemPrompt}\n\nUser: ${prompt}`
    return new Promise((resolve, reject) => {
      let responseText = ''
      const listener = this.onMessage(sessionId, (msg: unknown) => {
        const parsed = msg as { type?: string; message?: { type?: string; content?: unknown } }
        if (parsed?.message?.type === 'assistant') {
          const content = parsed.message.content
          if (typeof content === 'string') {
            responseText = content
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'text') responseText += block.text ?? ''
            }
          }
        }
        if (parsed?.type === 'result') {
          listener()
          resolve(responseText)
        }
      })

      this.sendMessage(sessionId, text, []).catch((err) => {
        listener()
        reject(err)
      })
    })
  }
```

- [ ] **Step 2: Create git-ai-bridge.ts**

```typescript
// src/main/git-ai-bridge.ts
import { log } from '../shared/logger'
import type { CommitPlan, ConflictResolution, GitCommandPlan } from '../shared/git-types'
import { getDiffForAnalysis } from './git-commit-service'
import { getConflictFiles, readConflictFile } from './git-ops-service'
import { sessionManager } from './session-manager'

const logger = log.child('git-ai-bridge')

export async function analyzeForCommitPlan(
  cwd: string,
  sessionId: string,
): Promise<CommitPlan> {
  const diff = await getDiffForAnalysis(cwd)
  if (!diff.trim()) {
    return { groups: [], reasoning: 'No changes detected.' }
  }

  const systemPrompt = `You are a git commit assistant. Analyze the following diff and propose logical commit groups.
Return ONLY valid JSON matching this schema:
{ "groups": [{ "title": string, "message": string, "files": [{ "path": string }], "order": number, "rationale": string }], "reasoning": string }
Use conventional commit format for messages. Group related changes together.`

  const response = await sessionManager.sendGitAiQuery(sessionId, diff, systemPrompt)

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    return JSON.parse(jsonMatch[0]) as CommitPlan
  } catch (err) {
    logger.error('Failed to parse commit plan:', err)
    return { groups: [], reasoning: 'Failed to parse AI response' }
  }
}

export async function generateCommitMessage(
  cwd: string,
  sessionId: string,
): Promise<string> {
  const diff = await getDiffForAnalysis(cwd)
  const systemPrompt = `You are a git commit message generator. Analyze the staged diff and return ONLY a conventional commit message (no explanation, no markdown). Format: type(scope): description`

  const response = await sessionManager.sendGitAiQuery(sessionId, diff, systemPrompt)
  return response.trim().replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()
}

export async function interpretNlCommand(
  cwd: string,
  sessionId: string,
  text: string,
): Promise<GitCommandPlan> {
  const systemPrompt = `You are a git command interpreter. The user describes what they want in plain English.
Return ONLY valid JSON matching this schema:
{ "id": string, "interpretation": string, "commands": [{ "command": string, "explanation": string }], "preview": string, "riskLevel": "safe"|"moderate"|"destructive", "warnings": string[] }
All commands MUST start with "git". Classify risk accurately:
- safe: status, log, branch (read-only or easily reversible)
- moderate: commit, merge, checkout (changes state but recoverable)
- destructive: reset --hard, push --force, branch -D (potential data loss)`

  const response = await sessionManager.sendGitAiQuery(sessionId, text, systemPrompt)

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0]) as GitCommandPlan
  } catch (err) {
    logger.error('Failed to parse NL command:', err)
    return {
      id: crypto.randomUUID(),
      interpretation: 'Failed to interpret command',
      commands: [],
      preview: '',
      riskLevel: 'safe',
      warnings: ['Could not parse AI response'],
    }
  }
}

export async function resolveConflicts(
  cwd: string,
  sessionId: string,
): Promise<ConflictResolution[]> {
  const conflictFiles = await getConflictFiles(cwd)
  if (conflictFiles.length === 0) return []

  const resolutions: ConflictResolution[] = []
  for (const { filePath } of conflictFiles) {
    const content = await readConflictFile(cwd, filePath)

    const systemPrompt = `You are a merge conflict resolver. Analyze the conflict markers and produce a clean resolution.
Return ONLY valid JSON: { "resolvedContent": string, "explanation": string, "confidence": "high"|"medium"|"low" }
Choose the resolution that best preserves both sides' intent.`

    const response = await sessionManager.sendGitAiQuery(sessionId, content, systemPrompt)

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON')
      const parsed = JSON.parse(jsonMatch[0])
      resolutions.push({
        filePath,
        originalContent: content,
        resolvedContent: parsed.resolvedContent,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
      })
    } catch {
      resolutions.push({
        filePath,
        originalContent: content,
        resolvedContent: content,
        explanation: 'Failed to resolve automatically',
        confidence: 'low',
      })
    }
  }

  return resolutions
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/git-ai-bridge.ts src/main/session-manager.ts
git commit -m "feat(git): add AI bridge for commit analysis, NL commands, and conflict resolution"
```

---

### Task 15: Git IPC Handlers (Main Process)

**Files:**
- Create: `src/main/git-ipc-handlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create git-ipc-handlers.ts**

```typescript
// src/main/git-ipc-handlers.ts
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { CommitGroup, ConflictResolution } from '../shared/git-types'
import { log } from '../shared/logger'
import { analyzeForCommitPlan, generateCommitMessage, interpretNlCommand, resolveConflicts } from './git-ai-bridge'
import { executeCommitGroup, getWorkingTreeStatus, stageFiles, unstageFiles } from './git-commit-service'
import { checkoutBranch, getGitBranches, getGraphLog } from './git-graph-service'
import { continueOperation, executeGitCommands, getConflictFiles, writeResolvedFile } from './git-ops-service'

const logger = log.child('git-ipc')

let mainWindow: BrowserWindow | null = null

export function setGitWindow(win: BrowserWindow): void {
  mainWindow = win
}

function notifyGraphUpdated(): void {
  mainWindow?.webContents.send(IPC.GIT_GRAPH_UPDATED)
}

export function registerGitIpcHandlers(): void {
  // ── Git Graph ──
  ipcMain.handle(IPC.GIT_GRAPH_GET_LOG, (_e, args: { cwd: string; afterHash?: string }) =>
    getGraphLog(args.cwd, args.afterHash),
  )

  ipcMain.handle(IPC.GIT_GRAPH_GET_BRANCHES, (_e, args: { cwd: string }) =>
    getGitBranches(args.cwd),
  )

  ipcMain.handle(IPC.GIT_GRAPH_CHECKOUT, async (_e, args: { cwd: string; branch: string }) => {
    const result = await checkoutBranch(args.cwd, args.branch)
    if (result.success) notifyGraphUpdated()
    return result
  })

  // ── Git Commit ──
  ipcMain.handle(IPC.GIT_COMMIT_GET_STATUS, (_e, args: { cwd: string }) =>
    getWorkingTreeStatus(args.cwd),
  )

  ipcMain.handle(IPC.GIT_COMMIT_ANALYZE, (_e, args: { cwd: string; sessionId: string }) =>
    analyzeForCommitPlan(args.cwd, args.sessionId),
  )

  ipcMain.handle(IPC.GIT_COMMIT_GENERATE_MSG, (_e, args: { cwd: string; sessionId: string }) =>
    generateCommitMessage(args.cwd, args.sessionId),
  )

  ipcMain.handle(IPC.GIT_COMMIT_EXECUTE, async (_e, args: { cwd: string; group: CommitGroup }) => {
    const result = await executeCommitGroup(args.cwd, args.group)
    if (result.success) notifyGraphUpdated()
    return result
  })

  ipcMain.handle(IPC.GIT_COMMIT_STAGE, (_e, args: { cwd: string; paths: string[] }) =>
    stageFiles(args.cwd, args.paths),
  )

  ipcMain.handle(IPC.GIT_COMMIT_UNSTAGE, (_e, args: { cwd: string; paths: string[] }) =>
    unstageFiles(args.cwd, args.paths),
  )

  // ── Git Ops ──
  ipcMain.handle(
    IPC.GIT_OPS_EXECUTE_NL,
    (_e, args: { cwd: string; sessionId: string; text: string }) =>
      interpretNlCommand(args.cwd, args.sessionId, args.text),
  )

  ipcMain.handle(IPC.GIT_OPS_CONFIRM, async (_e, args: { cwd: string; planId: string }) => {
    // Look up the plan from the pending state — for now, we trust the renderer
    // to send the commands via a separate flow. This is a simplified version.
    logger.info('Confirming plan:', args.planId)
    return { success: true }
  })

  ipcMain.handle(IPC.GIT_OPS_GET_CONFLICTS, (_e, args: { cwd: string }) =>
    getConflictFiles(args.cwd),
  )

  ipcMain.handle(
    IPC.GIT_OPS_RESOLVE_CONFLICTS,
    (_e, args: { cwd: string; sessionId: string }) =>
      resolveConflicts(args.cwd, args.sessionId),
  )

  ipcMain.handle(
    IPC.GIT_OPS_APPLY_RESOLUTION,
    async (_e, args: { cwd: string; resolutions: ConflictResolution[] }) => {
      for (const res of args.resolutions) {
        await writeResolvedFile(args.cwd, res.filePath, res.resolvedContent)
      }
      notifyGraphUpdated()
    },
  )

  ipcMain.handle(IPC.GIT_OPS_CONTINUE, async (_e, args: { cwd: string }) => {
    const result = await continueOperation(args.cwd)
    if (result.success) notifyGraphUpdated()
    return result
  })
}
```

- [ ] **Step 2: Wire into main/index.ts**

Add import:
```typescript
import { registerGitIpcHandlers, setGitWindow } from './git-ipc-handlers'
```

After `registerIpcHandlers()` (line 77), add:
```typescript
  registerGitIpcHandlers()
```

After `sessionManager.setWindow(mainWindow)` (line 85), add:
```typescript
  setGitWindow(mainWindow)
```

And in the `app.on('activate')` handler (line 93), add after the existing `setWindow` calls:
```typescript
      setGitWindow(w)
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 4: Run all tests**

```bash
bun test
```

- [ ] **Step 5: Commit**

```bash
git add src/main/git-ipc-handlers.ts src/main/index.ts
git commit -m "feat(git): register git IPC handlers and wire into app bootstrap"
```

---

## Chunk 2: Git Graph UI

### Task 16: Graph Layout Library

**Files:**
- Create: `src/renderer/src/lib/git-graph-layout.ts`

- [ ] **Step 1: Create layout utilities for canvas rendering**

```typescript
// src/renderer/src/lib/git-graph-layout.ts
import type { GraphCommit, GraphLine } from '../../../shared/git-types'

export const GRAPH_CONSTANTS = {
  ROW_HEIGHT: 32,
  COLUMN_WIDTH: 16,
  NODE_RADIUS: 4,
  GRAPH_LEFT_PADDING: 12,
  TEXT_LEFT_PADDING: 8,
} as const

export const LANE_COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export function getNodeX(column: number): number {
  return GRAPH_CONSTANTS.GRAPH_LEFT_PADDING + column * GRAPH_CONSTANTS.COLUMN_WIDTH
}

export function getNodeY(rowIndex: number): number {
  return rowIndex * GRAPH_CONSTANTS.ROW_HEIGHT + GRAPH_CONSTANTS.ROW_HEIGHT / 2
}

export function getGraphWidth(commits: GraphCommit[]): number {
  let maxCol = 0
  for (const c of commits) {
    maxCol = Math.max(maxCol, c.graphColumns)
    for (const line of c.graphLines) {
      maxCol = Math.max(maxCol, line.fromColumn, line.toColumn)
    }
  }
  return GRAPH_CONSTANTS.GRAPH_LEFT_PADDING * 2 + (maxCol + 1) * GRAPH_CONSTANTS.COLUMN_WIDTH
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  commits: GraphCommit[],
  width: number,
  height: number,
  devicePixelRatio: number,
): void {
  ctx.clearRect(0, 0, width * devicePixelRatio, height * devicePixelRatio)
  ctx.save()
  ctx.scale(devicePixelRatio, devicePixelRatio)

  // Draw lines first (behind nodes)
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const y = getNodeY(i)

    for (const line of commit.graphLines) {
      const fromX = getNodeX(line.fromColumn)
      const toX = getNodeX(line.toColumn)
      const nextY = getNodeY(i + 1)

      ctx.beginPath()
      ctx.strokeStyle = line.color
      ctx.lineWidth = 2

      if (line.type === 'straight') {
        ctx.moveTo(fromX, y)
        ctx.lineTo(toX, nextY)
      } else {
        // Bezier curve for merges/forks
        ctx.moveTo(fromX, y)
        ctx.bezierCurveTo(fromX, y + 16, toX, nextY - 16, toX, nextY)
      }

      ctx.stroke()
    }
  }

  // Draw nodes on top
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const x = getNodeX(commit.graphColumns)
    const y = getNodeY(i)
    const color = LANE_COLORS[commit.graphColumns % LANE_COLORS.length]

    ctx.beginPath()
    ctx.arc(x, y, GRAPH_CONSTANTS.NODE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = commit.parents.length > 1 ? '#0a0a0f' : color
    ctx.fill()

    if (commit.parents.length > 1) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  ctx.restore()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/lib/git-graph-layout.ts
git commit -m "feat(git): add graph layout utilities and canvas drawing"
```

---

### Task 17: GitGraphCanvas Component

**Files:**
- Create: `src/renderer/src/components/git/GitGraphCanvas.tsx`

- [ ] **Step 1: Create canvas component**

```tsx
import { useEffect, useRef } from 'react'
import type { GraphCommit } from '../../../../shared/git-types'
import { drawGraph, getGraphWidth, GRAPH_CONSTANTS } from '../../lib/git-graph-layout'

type GitGraphCanvasProps = {
  commits: GraphCommit[]
}

export function GitGraphCanvas({ commits }: GitGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || commits.length === 0) return

    const dpr = window.devicePixelRatio || 1
    const width = getGraphWidth(commits)
    const height = commits.length * GRAPH_CONSTANTS.ROW_HEIGHT

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawGraph(ctx, commits, width, height, dpr)
  }, [commits])

  return <canvas ref={canvasRef} className="pointer-events-none" />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/git/GitGraphCanvas.tsx
git commit -m "feat(git): add GitGraphCanvas component"
```

---

### Task 18: BranchList Component

**Files:**
- Create: `src/renderer/src/components/git/BranchList.tsx`

- [ ] **Step 1: Create the branch list**

```tsx
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import { useState } from 'react'
import type { BranchInfo } from '../../../../shared/git-types'

type BranchListProps = {
  branches: BranchInfo[]
  onCheckout: (branch: string) => void
  onScrollTo: (hash: string) => void
}

export function BranchList({ branches, onCheckout, onScrollTo }: BranchListProps) {
  const [showRemotes, setShowRemotes] = useState(false)

  const local = branches.filter((b) => b.type === 'local')
  const remote = branches.filter((b) => b.type === 'remote')

  return (
    <div className="overflow-y-auto border-stone-800 border-r p-2" style={{ width: 160 }}>
      <p className="mb-2 font-medium text-stone-400 text-[10px] uppercase tracking-wider">Branches</p>

      {local.map((b) => (
        <button
          key={b.name}
          type="button"
          onClick={() => onScrollTo(b.headHash)}
          onDoubleClick={() => onCheckout(b.name)}
          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-stone-800 ${
            b.isCurrent ? 'text-amber-400' : 'text-stone-300'
          }`}
          title={`Double-click to checkout ${b.name}`}
        >
          <GitBranch size={11} className="flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{b.name}</span>
          {b.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-emerald-500 text-[10px]">
              <ArrowUpFromLine size={9} /> {b.ahead}
            </span>
          )}
          {b.behind > 0 && (
            <span className="flex items-center gap-0.5 text-amber-500 text-[10px]">
              <ArrowDownToLine size={9} /> {b.behind}
            </span>
          )}
        </button>
      ))}

      {remote.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowRemotes(!showRemotes)}
            className="mt-2 flex w-full items-center gap-1 rounded px-1.5 py-1 text-stone-500 text-[10px] uppercase tracking-wider hover:bg-stone-800 hover:text-stone-400"
          >
            {showRemotes ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Remotes ({remote.length})
          </button>
          {showRemotes &&
            remote.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => onScrollTo(b.headHash)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-stone-500 text-xs transition-colors hover:bg-stone-800 hover:text-stone-400"
              >
                <GitBranch size={11} className="flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
              </button>
            ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/git/BranchList.tsx
git commit -m "feat(git): add BranchList component with local/remote branches"
```

---

### Task 19: CommitDetail Component

**Files:**
- Create: `src/renderer/src/components/git/CommitDetail.tsx`

- [ ] **Step 1: Create commit detail view**

```tsx
import { Sparkles, X } from 'lucide-react'
import type { GraphCommit } from '../../../../shared/git-types'

type CommitDetailProps = {
  commit: GraphCommit
  onClose: () => void
  onExplain: (hash: string) => void
}

export function CommitDetail({ commit, onClose, onExplain }: CommitDetailProps) {
  return (
    <div className="border-stone-800 border-t bg-stone-900/50 p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-stone-200 text-xs">{commit.message}</p>
          <div className="mt-1 flex items-center gap-2 text-stone-500 text-[10px]">
            <span>{commit.author}</span>
            <span>•</span>
            <span>{new Date(commit.date).toLocaleDateString()}</span>
            <span>•</span>
            <code className="font-[family-name:var(--font-mono)] text-stone-600">{commit.shortHash}</code>
          </div>
          {commit.refs.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {commit.refs.map((ref) => (
                <span
                  key={ref.name}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    ref.type === 'tag'
                      ? 'bg-purple-950/50 text-purple-400'
                      : ref.isCurrent
                        ? 'bg-amber-950/50 text-amber-400'
                        : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {ref.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onExplain(commit.hash)}
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400"
            title="Explain this commit with AI"
          >
            <Sparkles size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/git/CommitDetail.tsx
git commit -m "feat(git): add CommitDetail component with AI explain button"
```

---

### Task 20: GitGraphTab — Assemble the Full Graph View

**Files:**
- Create: `src/renderer/src/components/git/GitGraphTab.tsx`
- Modify: `src/renderer/src/components/git/GitPanel.tsx`

- [ ] **Step 1: Create GitGraphTab**

```tsx
import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import type { GraphCommit } from '../../../../shared/git-types'
import { GRAPH_CONSTANTS, getGraphWidth, getNodeX } from '../../lib/git-graph-layout'
import { useGitGraphStore } from '../../store/git-graph-store'
import { BranchList } from './BranchList'
import { CommitDetail } from './CommitDetail'
import { GitGraphCanvas } from './GitGraphCanvas'

type GitGraphTabProps = {
  cwd: string
  sessionId: string | null
}

export function GitGraphTab({ cwd, sessionId }: GitGraphTabProps) {
  const { commits, branches, loading, error, selectedCommit, hasMore, fetchGraph, fetchBranches, selectCommit } =
    useGitGraphStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cwd) {
      fetchGraph(cwd)
      fetchBranches(cwd)
    }
  }, [cwd, fetchGraph, fetchBranches])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || loading || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      const lastHash = commits[commits.length - 1]?.hash
      if (lastHash) fetchGraph(cwd, lastHash)
    }
  }, [commits, cwd, fetchGraph, hasMore, loading])

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!confirm(`Checkout branch "${branch}"?`)) return
      await window.api.gitGraphCheckout(cwd, branch)
    },
    [cwd],
  )

  const handleScrollTo = useCallback(
    (hash: string) => {
      const idx = commits.findIndex((c) => c.hash.startsWith(hash))
      if (idx !== -1 && scrollRef.current) {
        scrollRef.current.scrollTop = idx * GRAPH_CONSTANTS.ROW_HEIGHT - 100
        selectCommit(commits[idx].hash)
      }
    },
    [commits, selectCommit],
  )

  const handleExplain = useCallback(
    (hash: string) => {
      // TODO: Route to chat session with explain prompt
    },
    [sessionId],
  )

  const graphWidth = getGraphWidth(commits)
  const selectedCommitData = commits.find((c) => c.hash === selectedCommit)

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <p className="text-red-400 text-xs">{error}</p>
        <button
          type="button"
          onClick={() => fetchGraph(cwd)}
          className="rounded bg-stone-800 px-3 py-1 text-stone-300 text-xs hover:bg-stone-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <BranchList branches={branches} onCheckout={handleCheckout} onScrollTo={handleScrollTo} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
          <span className="text-stone-400 text-xs">{commits.length} commits</span>
          <button
            type="button"
            onClick={() => { fetchGraph(cwd); fetchBranches(cwd) }}
            className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-300"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Graph + commit list */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          <div className="relative" style={{ height: commits.length * GRAPH_CONSTANTS.ROW_HEIGHT }}>
            {/* Canvas graph lines */}
            <div className="absolute left-0 top-0" style={{ width: graphWidth }}>
              <GitGraphCanvas commits={commits} />
            </div>

            {/* Commit rows (DOM overlay) */}
            {commits.map((commit, i) => (
              <button
                key={commit.hash}
                type="button"
                onClick={() => selectCommit(selectedCommit === commit.hash ? null : commit.hash)}
                className={`absolute flex w-full items-center text-left transition-colors hover:bg-stone-800/50 ${
                  selectedCommit === commit.hash ? 'bg-stone-800/70' : ''
                }`}
                style={{
                  top: i * GRAPH_CONSTANTS.ROW_HEIGHT,
                  height: GRAPH_CONSTANTS.ROW_HEIGHT,
                  paddingLeft: graphWidth + 8,
                }}
              >
                <span className="min-w-0 flex-1 truncate text-stone-300 text-xs">{commit.message}</span>
                <span className="flex-shrink-0 px-2 font-[family-name:var(--font-mono)] text-stone-600 text-[10px]">
                  {commit.shortHash}
                </span>
                {commit.refs.length > 0 && (
                  <div className="flex flex-shrink-0 gap-1 pr-2">
                    {commit.refs.slice(0, 2).map((ref) => (
                      <span
                        key={ref.name}
                        className={`rounded px-1 py-0.5 text-[9px] ${
                          ref.isCurrent ? 'bg-amber-950/50 text-amber-400' : 'bg-stone-800 text-stone-500'
                        }`}
                      >
                        {ref.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 size={14} className="animate-spin text-stone-600" />
            </div>
          )}
        </div>

        {/* Selected commit detail */}
        {selectedCommitData && (
          <CommitDetail
            commit={selectedCommitData}
            onClose={() => selectCommit(null)}
            onExplain={handleExplain}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update GitPanel to render GitGraphTab**

Replace the graph placeholder in `GitPanel.tsx`:

```tsx
import { GitGraphTab } from './GitGraphTab'
// ... in the tab content section:
{activeTab === 'graph' && (
  <GitGraphTab cwd={cwd} sessionId={tab?.sessionId ?? null} />
)}
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/git/GitGraphTab.tsx src/renderer/src/components/git/GitPanel.tsx
git commit -m "feat(git): assemble GitGraphTab with canvas graph, branch list, and commit detail"
```

---

## Chunk 3: Commit Orchestration UI

### Task 21: CommitPlanCard Component

**Files:**
- Create: `src/renderer/src/components/git/CommitPlanCard.tsx`

- [ ] **Step 1: Create the commit plan card**

```tsx
import { ChevronDown, ChevronRight, GripVertical, Play } from 'lucide-react'
import { useState } from 'react'
import type { CommitGroup } from '../../../../shared/git-types'

type CommitPlanCardProps = {
  group: CommitGroup
  onExecute: () => void
  onEditMessage: (message: string) => void
  executing: boolean
}

export function CommitPlanCard({ group, onExecute, onEditMessage, executing }: CommitPlanCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(group.message)

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/50">
      <div className="flex items-start gap-2 p-3">
        <GripVertical size={14} className="mt-0.5 flex-shrink-0 cursor-grab text-stone-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 font-medium text-stone-400 text-[10px]">
              {group.order}
            </span>
            {editing ? (
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onBlur={() => { setEditing(false); onEditMessage(message) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onEditMessage(message) } }}
                className="min-w-0 flex-1 rounded bg-stone-800 px-2 py-0.5 font-[family-name:var(--font-mono)] text-stone-200 text-xs outline-none ring-1 ring-amber-600"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-w-0 flex-1 truncate text-left font-[family-name:var(--font-mono)] text-stone-200 text-xs hover:text-amber-400"
                title="Click to edit"
              >
                {group.message}
              </button>
            )}
          </div>
          <p className="mt-1 text-stone-500 text-[10px]">{group.files.length} files</p>
        </div>
        <button
          type="button"
          onClick={onExecute}
          disabled={executing}
          className="flex-shrink-0 rounded bg-emerald-600 p-1.5 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          title="Commit this group"
        >
          <Play size={11} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 border-stone-800 border-t px-3 py-1.5 text-stone-500 text-[10px] hover:bg-stone-800/50"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Files & rationale
      </button>

      {expanded && (
        <div className="border-stone-800 border-t px-3 py-2">
          <p className="mb-2 text-stone-500 text-[10px] italic">{group.rationale}</p>
          {group.files.map((f) => (
            <div key={f.path} className="font-[family-name:var(--font-mono)] text-stone-400 text-[10px]">
              {f.path}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/git/CommitPlanCard.tsx
git commit -m "feat(git): add CommitPlanCard component with inline editing"
```

---

### Task 22: GitCommitTab Component

**Files:**
- Create: `src/renderer/src/components/git/GitCommitTab.tsx`
- Modify: `src/renderer/src/components/git/GitPanel.tsx`

- [ ] **Step 1: Create GitCommitTab**

```tsx
import { Check, FileText, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CommitGroup } from '../../../../shared/git-types'
import { useGitCommitStore } from '../../store/git-commit-store'
import { CommitPlanCard } from './CommitPlanCard'

type GitCommitTabProps = {
  cwd: string
  sessionId: string | null
}

export function GitCommitTab({ cwd, sessionId }: GitCommitTabProps) {
  const { workingTree, commitPlan, analyzing, error, fetchStatus, analyzePlan, executeGroup, generateMessage, stageFiles, unstageFiles, setCommitPlan } =
    useGitCommitStore()
  const [commitMsg, setCommitMsg] = useState('')
  const [executing, setExecuting] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (cwd) fetchStatus(cwd)
  }, [cwd, fetchStatus])

  const handleAnalyze = useCallback(async () => {
    if (!sessionId) return
    await analyzePlan(cwd, sessionId)
  }, [cwd, sessionId, analyzePlan])

  const handleGenerateMsg = useCallback(async () => {
    if (!sessionId) return
    setGenerating(true)
    const msg = await generateMessage(cwd, sessionId)
    if (msg) setCommitMsg(msg)
    setGenerating(false)
  }, [cwd, sessionId, generateMessage])

  const handleExecuteGroup = useCallback(
    async (group: CommitGroup, index: number) => {
      setExecuting(index)
      await executeGroup(cwd, group)
      await fetchStatus(cwd)
      setExecuting(null)
    },
    [cwd, executeGroup, fetchStatus],
  )

  const handleToggleStage = useCallback(
    async (path: string, currentlyStaged: boolean) => {
      if (currentlyStaged) {
        await unstageFiles(cwd, [path])
      } else {
        await stageFiles(cwd, [path])
      }
      await fetchStatus(cwd)
    },
    [cwd, stageFiles, unstageFiles, fetchStatus],
  )

  const handleManualCommit = useCallback(async () => {
    if (!commitMsg.trim()) return
    const staged = workingTree.filter((f) => f.staged)
    if (staged.length === 0) return
    const group: CommitGroup = {
      title: commitMsg,
      message: commitMsg,
      files: staged.map((f) => ({ path: f.path })),
      order: 1,
      rationale: 'Manual commit',
    }
    await executeGroup(cwd, group)
    setCommitMsg('')
    await fetchStatus(cwd)
  }, [cwd, commitMsg, workingTree, executeGroup, fetchStatus])

  const stagedCount = workingTree.filter((f) => f.staged).length
  const unstagedCount = workingTree.filter((f) => !f.staged).length

  if (workingTree.length === 0 && !commitPlan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <Check size={20} className="text-stone-700" />
        <p className="text-stone-600 text-xs">Working tree clean</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* AI Commit Plan */}
      {commitPlan ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium text-stone-300 text-xs">Commit Plan</p>
            <button
              type="button"
              onClick={() => setCommitPlan(null)}
              className="text-stone-500 text-[10px] hover:text-stone-300"
            >
              Dismiss
            </button>
          </div>
          <p className="mb-3 text-stone-500 text-[10px] italic">{commitPlan.reasoning}</p>
          <div className="flex flex-col gap-2">
            {commitPlan.groups.map((group, i) => (
              <CommitPlanCard
                key={`${group.order}-${group.title}`}
                group={group}
                onExecute={() => handleExecuteGroup(group, i)}
                onEditMessage={(msg) => {
                  const updated = { ...commitPlan }
                  updated.groups = [...updated.groups]
                  updated.groups[i] = { ...updated.groups[i], message: msg }
                  setCommitPlan(updated)
                }}
                executing={executing === i}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* File list */}
          <div className="flex-1 overflow-y-auto p-2">
            {workingTree.map((file) => (
              <label
                key={file.path}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-stone-800/50"
              >
                <input
                  type="checkbox"
                  checked={file.staged}
                  onChange={() => handleToggleStage(file.path, file.staged)}
                  className="h-3 w-3 rounded border-stone-600 bg-stone-800 accent-amber-600"
                />
                <FileText size={11} className="flex-shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-stone-300">
                  {file.path}
                </span>
                <span
                  className={`flex-shrink-0 text-[10px] ${
                    file.status === 'added'
                      ? 'text-emerald-400'
                      : file.status === 'deleted'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}
                >
                  {file.status[0]?.toUpperCase()}
                </span>
              </label>
            ))}
          </div>

          {/* Commit input */}
          <div className="border-stone-800 border-t p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleManualCommit() }}
                placeholder="Commit message..."
                className="min-w-0 flex-1 rounded bg-stone-800 px-2.5 py-1.5 text-stone-200 text-xs outline-none ring-1 ring-stone-700 placeholder:text-stone-600 focus:ring-stone-500"
              />
              <button
                type="button"
                onClick={handleGenerateMsg}
                disabled={generating || !sessionId}
                className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400 disabled:opacity-50"
                title="Generate commit message"
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleManualCommit}
                disabled={!commitMsg.trim() || stagedCount === 0}
                className="flex-1 rounded bg-emerald-600 px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                Commit ({stagedCount} staged)
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || !sessionId || workingTree.length === 0}
                className="flex items-center gap-1.5 rounded border border-amber-700 px-3 py-1.5 text-amber-400 text-xs transition-colors hover:bg-amber-950/30 disabled:opacity-50"
              >
                {analyzing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Analyze
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="border-stone-800 border-t bg-red-950/30 px-3 py-2 text-red-400 text-xs">{error}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into GitPanel**

Add import and replace the commit placeholder:

```tsx
import { GitCommitTab } from './GitCommitTab'
// ...
{activeTab === 'commit' && (
  <GitCommitTab cwd={cwd} sessionId={tab?.sessionId ?? null} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/git/GitCommitTab.tsx src/renderer/src/components/git/GitPanel.tsx
git commit -m "feat(git): add GitCommitTab with AI analysis and manual staging"
```

---

## Chunk 4: Natural Language Git Ops UI

### Task 23: ConflictResolver Component

**Files:**
- Create: `src/renderer/src/components/git/ConflictResolver.tsx`

- [ ] **Step 1: Create the conflict resolver**

```tsx
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { ConflictResolution } from '../../../../shared/git-types'

type ConflictResolverProps = {
  conflicts: ConflictResolution[]
  onApply: (resolutions: ConflictResolution[]) => void
  onCancel: () => void
}

const confidenceColors = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-red-400',
}

export function ConflictResolver({ conflicts, onApply, onCancel }: ConflictResolverProps) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  const toggleFile = (path: string) => {
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const acceptAll = () => setAccepted(new Set(conflicts.map((c) => c.filePath)))

  const handleApply = () => {
    const selected = conflicts.filter((c) => accepted.has(c.filePath))
    onApply(selected)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
        <p className="font-medium text-stone-300 text-xs">Conflict Resolution</p>
        <div className="flex gap-2">
          <button type="button" onClick={acceptAll} className="text-stone-500 text-[10px] hover:text-stone-300">
            Accept all
          </button>
          <button type="button" onClick={onCancel} className="text-stone-500 text-[10px] hover:text-red-400">
            Cancel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conflicts.map((conflict) => (
          <div key={conflict.filePath} className="mb-2 rounded-lg border border-stone-700 bg-stone-900/50">
            <label className="flex cursor-pointer items-center gap-2 p-2.5">
              <input
                type="checkbox"
                checked={accepted.has(conflict.filePath)}
                onChange={() => toggleFile(conflict.filePath)}
                className="h-3 w-3 rounded border-stone-600 bg-stone-800 accent-amber-600"
              />
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-stone-300 text-xs">
                {conflict.filePath}
              </span>
              <span className={`text-[10px] ${confidenceColors[conflict.confidence]}`}>
                {conflict.confidence}
                {conflict.confidence === 'low' && <AlertTriangle size={10} className="ml-1 inline" />}
              </span>
            </label>
            <div className="border-stone-800 border-t px-3 py-2">
              <p className="text-stone-500 text-[10px]">{conflict.explanation}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-stone-800 border-t p-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={accepted.size === 0}
          className="w-full rounded bg-emerald-600 px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          Apply {accepted.size} resolution{accepted.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/git/ConflictResolver.tsx
git commit -m "feat(git): add ConflictResolver component with confidence badges"
```

---

### Task 24: GitOpsTab Component

**Files:**
- Create: `src/renderer/src/components/git/GitOpsTab.tsx`
- Modify: `src/renderer/src/components/git/GitPanel.tsx`

- [ ] **Step 1: Create GitOpsTab**

```tsx
import { AlertTriangle, Check, Loader2, Play, Send, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { CommandEntry } from '../../../../shared/git-types'
import { useGitOpsStore } from '../../store/git-ops-store'
import { ConflictResolver } from './ConflictResolver'

type GitOpsTabProps = {
  cwd: string
  sessionId: string | null
}

const riskColors = {
  safe: 'border-emerald-800 bg-emerald-950/30',
  moderate: 'border-yellow-800 bg-yellow-950/30',
  destructive: 'border-red-800 bg-red-950/30',
}

const riskLabels = {
  safe: { text: 'Safe', color: 'text-emerald-400' },
  moderate: { text: 'Caution', color: 'text-yellow-400' },
  destructive: { text: 'Destructive', color: 'text-red-400' },
}

function CommandEntryCard({ entry, cwd, onConfirm, onCancel }: {
  entry: CommandEntry
  cwd: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const plan = entry.plan
  return (
    <div className="mb-2">
      <p className="mb-1 text-stone-300 text-xs">▸ {entry.request}</p>

      {entry.status === 'pending' && (
        <div className="flex items-center gap-2 pl-3">
          <Loader2 size={11} className="animate-spin text-stone-600" />
          <span className="text-stone-500 text-[10px]">Interpreting...</span>
        </div>
      )}

      {plan && entry.status === 'planned' && (
        <div className={`ml-3 rounded-lg border p-2.5 ${riskColors[plan.riskLevel]}`}>
          <div className="flex items-center justify-between">
            <p className="text-stone-300 text-xs">{plan.interpretation}</p>
            <span className={`text-[10px] font-medium ${riskLabels[plan.riskLevel].color}`}>
              {riskLabels[plan.riskLevel].text}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {plan.commands.map((cmd, i) => (
              <div key={i} className="flex items-start gap-2">
                <code className="font-[family-name:var(--font-mono)] text-amber-400/80 text-[10px]">{cmd.command}</code>
              </div>
            ))}
          </div>
          {plan.warnings && plan.warnings.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5">
              <AlertTriangle size={10} className="mt-0.5 flex-shrink-0 text-yellow-500" />
              <p className="text-yellow-400/80 text-[10px]">{plan.warnings.join('. ')}</p>
            </div>
          )}
          <p className="mt-2 text-stone-500 text-[10px]">{plan.preview}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-white text-[10px] hover:bg-emerald-500"
            >
              <Play size={9} /> Confirm
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-2.5 py-1 text-stone-500 text-[10px] hover:bg-stone-800 hover:text-stone-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {entry.status === 'executing' && (
        <div className="ml-3 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin text-amber-500" />
          <span className="text-amber-400 text-[10px]">Executing...</span>
        </div>
      )}

      {entry.status === 'completed' && (
        <div className="ml-3 flex items-center gap-2 text-emerald-400">
          <Check size={11} />
          <span className="text-[10px]">{entry.result || 'Done'}</span>
        </div>
      )}

      {entry.status === 'failed' && (
        <div className="ml-3 flex items-center gap-2 text-red-400">
          <X size={11} />
          <span className="text-[10px]">{entry.error || 'Failed'}</span>
        </div>
      )}
    </div>
  )
}

export function GitOpsTab({ cwd, sessionId }: GitOpsTabProps) {
  const { commandHistory, pendingPlan, conflicts, error, submitCommand, confirmPlan, cancelPlan, applyResolutions } =
    useGitOpsStore()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    if (!input.trim() || !sessionId) return
    submitCommand(cwd, sessionId, input.trim())
    setInput('')
  }, [cwd, sessionId, input, submitCommand])

  const handleApplyResolutions = useCallback(
    (resolutions: import('../../../../shared/git-types').ConflictResolution[]) => {
      applyResolutions(cwd, resolutions)
    },
    [cwd, applyResolutions],
  )

  if (conflicts.length > 0) {
    return (
      <ConflictResolver
        conflicts={conflicts}
        onApply={handleApplyResolutions}
        onCancel={() => useGitOpsStore.getState().setConflicts([])}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Command history */}
      <div className="flex-1 overflow-y-auto p-3">
        {commandHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-stone-600 text-xs">Type a git command in plain English</p>
            <p className="text-stone-700 text-[10px]">e.g. "undo my last commit" or "squash the last 3 commits"</p>
          </div>
        ) : (
          commandHistory.map((entry) => (
            <CommandEntryCard
              key={entry.id}
              entry={entry}
              cwd={cwd}
              onConfirm={() => entry.plan && confirmPlan(cwd, entry.plan.id)}
              onCancel={cancelPlan}
            />
          ))
        )}
      </div>

      {error && (
        <div className="border-stone-800 border-t bg-red-950/30 px-3 py-1.5 text-red-400 text-[10px]">{error}</div>
      )}

      {/* Input */}
      <div className="border-stone-800 border-t p-3">
        <div className="flex items-center gap-2 rounded bg-stone-800 px-3 py-2 ring-1 ring-stone-700 focus-within:ring-stone-500">
          <span className="font-[family-name:var(--font-mono)] text-amber-500 text-xs">git ▸</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Describe what you want to do..."
            disabled={!sessionId}
            className="min-w-0 flex-1 bg-transparent text-stone-200 text-xs outline-none placeholder:text-stone-600"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || !sessionId}
            className="rounded p-1 text-stone-500 transition-colors hover:text-amber-400 disabled:opacity-50"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into GitPanel**

Add import and replace the command placeholder:

```tsx
import { GitOpsTab } from './GitOpsTab'
// ...
{activeTab === 'command' && (
  <GitOpsTab cwd={cwd} sessionId={tab?.sessionId ?? null} />
)}
```

- [ ] **Step 3: Run typecheck and lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/git/ConflictResolver.tsx src/renderer/src/components/git/GitOpsTab.tsx src/renderer/src/components/git/GitPanel.tsx
git commit -m "feat(git): add GitOpsTab with NL command input and conflict resolution"
```

---

## Chunk 5: Integration & Cleanup

### Task 25: Remove GitBranchPanel References

**Files:**
- Modify: `src/renderer/src/components/layout/Layout.tsx`

- [ ] **Step 1: Remove old GitBranchPanel import and rendering**

In `Layout.tsx`:
1. Remove the import: `import { GitBranchPanel } from '../GitBranchPanel'`
2. Remove the `showGitPanel` logic (lines 36-41)
3. Remove the `toggleGitPanel` usage
4. Remove the old git panel `AnimatePresence` block that rendered `GitBranchPanel`
5. Keep only the new `GitPanel` rendering for `sidebarView === 'git'`

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/layout/Layout.tsx
git commit -m "refactor(git): remove old GitBranchPanel rendering from Layout"
```

---

### Task 26: Final Verification

- [ ] **Step 1: Run all checks**

```bash
bun run lint && bun run typecheck && bun test
```

All three must pass.

- [ ] **Step 2: Manual smoke test**

```bash
bun run dev
```

Verify:
1. Git icon appears in NavRail
2. Clicking it opens the Git panel sidebar
3. Graph tab shows commit history with graph lines
4. Commit tab shows file list with staging checkboxes
5. Command tab shows the NL input prompt

- [ ] **Step 3: Final commit if any lint fixes needed**

```bash
bun run lint:fix
git add -A
git commit -m "chore(git): lint fixes for git management feature"
```
