# Parallel Specialist Review Agents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-prompt PR review with parallel specialist agents — one per focus area — running concurrently with dedicated prompts, and expose agent prompts as editable settings.

**Architecture:** Each selected focus area spawns its own Claude Agent SDK session in parallel, all sharing the same PR diff. Each session gets a specialist system prompt. When all complete, findings are deduplicated by file+line (keeping highest severity) and merged. Agent prompts are stored in the `settings` table and editable via a new "Review Agents" tab in Settings.

**Tech Stack:** Electron (main process), Claude Agent SDK (`query()`), React 19, Zustand, Tailwind CSS 4, SQLite (better-sqlite3)

**Design doc:** `docs/plans/2026-03-09-parallel-review-agents-design.md`

---

### Task 1: Add Default Agent Prompts and Types

**Files:**
- Modify: `src/main/pr-review-manager.ts:1-10` (add imports, constants)
- Modify: `src/shared/types.ts:199-216` (add types)

**Step 1: Add `ReviewAgentConfig` type to shared types**

Add after line 216 in `src/shared/types.ts`:

```typescript
export type ReviewAgentConfig = {
  id: ReviewFocus
  name: string
  prompt: string
}

export type ReviewAgentProgress = {
  agentId: ReviewFocus
  status: 'pending' | 'running' | 'done' | 'error'
  findingsCount: number
  error?: string
}
```

**Step 2: Add default specialist prompts to pr-review-manager.ts**

Add after the `STREAM_THROTTLE_MS` constant (line 10) in `src/main/pr-review-manager.ts`:

```typescript
const DEFAULT_AGENT_PROMPTS: Record<string, string> = {
  general: `You are a general code reviewer. Look for:
- Code quality and readability issues
- Violations of best practices and design patterns
- Missing error handling or edge cases
- Unclear naming or confusing logic
- Unnecessary complexity
Be thorough but avoid false positives. Only flag issues you're confident about.`,

  security: `You are a security-focused code reviewer. Look for:
- Injection vulnerabilities (SQL, command, XSS)
- Authentication and authorization flaws
- Secrets or credentials in code
- Insecure cryptographic practices
- Input validation gaps
- OWASP Top 10 issues
Be thorough but avoid false positives. Only flag issues you're confident about.`,

  bugs: `You are a bug-hunting code reviewer. Look for:
- Logic errors and off-by-one mistakes
- Race conditions and concurrency issues
- Null/undefined dereferences
- Resource leaks (file handles, connections, memory)
- Incorrect error handling that swallows errors
- Edge cases in boundary conditions
Be thorough but avoid false positives. Only flag issues you're confident about.`,

  performance: `You are a performance-focused code reviewer. Look for:
- N+1 query patterns
- Unnecessary re-renders or re-computations
- Memory leaks and unbounded growth
- Missing caching opportunities
- Blocking operations on hot paths
- Inefficient data structures or algorithms
Be thorough but avoid false positives. Only flag issues you're confident about.`,

  style: `You are a code style reviewer. Look for:
- Inconsistent naming conventions
- Poor code organization and file structure
- Missing or misleading comments
- Dead code and unused imports
- Overly complex expressions that could be simplified
- Violations of project conventions
Be thorough but avoid false positives. Only flag issues you're confident about.`,
}
```

**Step 3: Add helper to get agent prompt (with settings override)**

Add to `PrReviewManager` class in `src/main/pr-review-manager.ts`:

```typescript
private getAgentPrompt(focus: ReviewFocus): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`reviewAgent.${focus}`) as { value: string } | undefined
  return row?.value || DEFAULT_AGENT_PROMPTS[focus] || DEFAULT_AGENT_PROMPTS.general
}
```

**Step 4: Add IPC handler for getting/resetting agent prompts**

Add to `src/shared/ipc-channels.ts`:

```typescript
GH_GET_AGENT_PROMPTS: 'gh:get-agent-prompts',
GH_RESET_AGENT_PROMPT: 'gh:reset-agent-prompt',
```

Add to `src/main/ipc-handlers.ts` (after the GH_SAVE_FINDINGS handler):

```typescript
ipcMain.handle(IPC.GH_GET_AGENT_PROMPTS, async () => {
  const { prReviewManager } = await import('./pr-review-manager')
  return prReviewManager.getAgentPrompts()
})

ipcMain.handle(IPC.GH_RESET_AGENT_PROMPT, async (_e, args: { focus: string }) => {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(`reviewAgent.${args.focus}`)
  return true
})
```

Add `getAgentPrompts()` method to `PrReviewManager`:

```typescript
getAgentPrompts(): Array<{ id: string; name: string; prompt: string; isCustom: boolean }> {
  const db = getDb()
  const names: Record<string, string> = {
    general: 'General', security: 'Security', bugs: 'Bugs',
    performance: 'Performance', style: 'Style',
  }
  return Object.keys(DEFAULT_AGENT_PROMPTS).map((id) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`reviewAgent.${id}`) as { value: string } | undefined
    return {
      id,
      name: names[id] || id,
      prompt: row?.value || DEFAULT_AGENT_PROMPTS[id],
      isCustom: !!row,
    }
  })
}
```

**Step 5: Add preload API surface**

In `src/preload/index.ts`, add to the exposed API object:

```typescript
getAgentPrompts: () => ipcRenderer.invoke('gh:get-agent-prompts'),
resetAgentPrompt: (focus: string) => ipcRenderer.invoke('gh:reset-agent-prompt', { focus }),
```

In `src/preload/index.d.ts`, add to the API type:

```typescript
getAgentPrompts(): Promise<Array<{ id: string; name: string; prompt: string; isCustom: boolean }>>
resetAgentPrompt(focus: string): Promise<boolean>
```

**Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/main/pr-review-manager.ts src/main/ipc-handlers.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(review): add default agent prompts, types, and settings IPC"
```

---

### Task 2: Refactor `runReview()` for Parallel Agent Sessions

This is the core change — replacing the single-session review with parallel specialist sessions.

**Files:**
- Modify: `src/main/pr-review-manager.ts:12-17` (ActiveReviewSession type)
- Modify: `src/main/pr-review-manager.ts:40-86` (startReview)
- Modify: `src/main/pr-review-manager.ts:88-218` (runReview → runParallelReview)
- Modify: `src/main/pr-review-manager.ts:271-278` (stopReview)

**Step 1: Update `ActiveReviewSession` type**

Replace the current `ActiveReviewSession` type (line 12-17) with:

```typescript
type AgentSession = {
  focus: ReviewFocus
  sessionId: string
  status: 'running' | 'done' | 'error'
  findings: ReviewFinding[]
  streamedText: string
  error?: string
}

type ActiveReviewSession = {
  reviewId: string
  repoFullName: string
  prNumber: number
  agents: Map<ReviewFocus, AgentSession>
}
```

**Step 2: Refactor `startReview()` to call `runParallelReview()`**

Replace `startReview()` method (lines 40-86). Key changes:
- Don't create a single session here — `runParallelReview` creates one per focus area
- Remove `sessionId` from initial DB insert (we'll have multiple)
- Store agent list in the active review

```typescript
async startReview(
  repo: GhRepo,
  prNumber: number,
  prTitle: string,
  prUrl: string,
  focusAreas: ReviewFocus[]
): Promise<PrReview> {
  const reviewId = randomUUID()
  const now = Date.now()

  const db = getDb()
  db.prepare(
    'INSERT INTO pr_reviews (id, repo_full_name, pr_number, pr_title, pr_url, focus, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(reviewId, repo.fullName, prNumber, prTitle, prUrl, JSON.stringify(focusAreas), 'running', now, now)

  this.activeReviews.set(reviewId, {
    reviewId,
    repoFullName: repo.fullName,
    prNumber,
    agents: new Map(),
  })

  const review: PrReview = {
    id: reviewId,
    prNumber,
    repo,
    prTitle,
    prUrl,
    status: 'running',
    focus: focusAreas,
    findings: [],
    sessionId: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
  }

  this.send(IPC.GH_REVIEW_UPDATE, {
    reviewId,
    status: 'running',
    findings: [],
    streamingText: '',
    agentProgress: focusAreas.map((f) => ({ agentId: f, status: 'pending', findingsCount: 0 })),
  })

  this.runParallelReview(reviewId, repo, prNumber, focusAreas).catch((err) => {
    console.error('Review failed:', err)
    this.updateReviewStatus(reviewId, 'error', Date.now())
    this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: String(err) })
  })

  return review
}
```

**Step 3: Write `runParallelReview()` method**

Replace the old `runReview()` with a new `runParallelReview()` that:
1. Fetches the diff once (shared)
2. Spawns one session per focus area in parallel
3. Each session gets the specialist prompt wrapped in the standard review template
4. Streams per-agent progress via IPC
5. When all complete, merges and deduplicates findings

```typescript
private async runParallelReview(
  reviewId: string,
  repo: GhRepo,
  prNumber: number,
  focusAreas: ReviewFocus[]
): Promise<void> {
  // Phase 1: Fetch diff once
  this.send(IPC.GH_REVIEW_UPDATE, {
    reviewId,
    status: 'running',
    streamingText: 'Fetching PR diff...',
    agentProgress: focusAreas.map((f) => ({ agentId: f, status: 'pending', findingsCount: 0 })),
  })

  const detail = await getPrDetail(repo.fullName, prNumber)

  let diff = detail.diff
  const diffLineCount = diff.split('\n').length
  let truncated = false
  if (diffLineCount > MAX_DIFF_LINES) {
    diff = diff.split('\n').slice(0, MAX_DIFF_LINES).join('\n')
    truncated = true
  }

  // Phase 2: Spawn parallel agent sessions
  const active = this.activeReviews.get(reviewId)
  if (!active) return

  const agentPromises = focusAreas.map((focus) =>
    this.runAgentSession(reviewId, repo, detail, diff, truncated, focus, active)
  )

  // Wait for all agents (allSettled so one failure doesn't block others)
  const results = await Promise.allSettled(agentPromises)

  // Phase 3: Merge and deduplicate findings
  const allFindings: ReviewFinding[] = []
  let allFailed = true

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allFindings.push(...result.value)
      allFailed = false
    } else if (result.status === 'fulfilled') {
      allFailed = false // agent succeeded but found nothing
    }
  }

  if (allFailed && results.length > 0) {
    this.updateReviewStatus(reviewId, 'error', Date.now())
    this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: 'All review agents failed' })
    this.activeReviews.delete(reviewId)
    return
  }

  const deduped = this.deduplicateFindings(allFindings)

  // Persist findings
  const db = getDb()
  const insertFinding = db.prepare(
    'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const f of deduped) {
    insertFinding.run(f.id, reviewId, f.file, f.line, f.severity, f.title, f.description)
  }

  this.updateReviewStatus(reviewId, 'done', Date.now())

  this.send(IPC.GH_REVIEW_UPDATE, {
    reviewId,
    status: 'done',
    findings: deduped,
    agentProgress: focusAreas.map((f) => {
      const agent = active.agents.get(f)
      return {
        agentId: f,
        status: agent?.status ?? 'done',
        findingsCount: agent?.findings.length ?? 0,
        error: agent?.error,
      }
    }),
  })
  this.activeReviews.delete(reviewId)
}
```

**Step 4: Write `runAgentSession()` — runs a single specialist agent**

```typescript
private async runAgentSession(
  reviewId: string,
  repo: GhRepo,
  detail: Awaited<ReturnType<typeof getPrDetail>>,
  diff: string,
  truncated: boolean,
  focus: ReviewFocus,
  active: ActiveReviewSession
): Promise<ReviewFinding[]> {
  const sessionId = await sessionManager.createSession(repo.projectPath)
  sessionManager.setPermissionMode(sessionId, 'auto-approve')

  const agentSession: AgentSession = {
    focus,
    sessionId,
    status: 'running',
    findings: [],
    streamedText: '',
  }
  active.agents.set(focus, agentSession)

  // Send agent-started update
  this.sendAgentProgress(reviewId, active)

  const specialistPrompt = this.getAgentPrompt(focus)

  const prompt = `You are reviewing a GitHub pull request as a **${focus}** specialist.

## Specialist Instructions
${specialistPrompt}

## PR Information
- **Title:** ${detail.title}
- **Author:** ${detail.author}
- **Branch:** ${detail.headBranch} -> ${detail.baseBranch}
- **Files changed:** ${detail.files.length}

## PR Description
${detail.body || '(no description)'}

## Changed Files
${detail.files.map((f) => `- ${f.path} (+${f.additions} -${f.deletions})`).join('\n')}

## Diff
${truncated ? 'Diff truncated to 50,000 lines.\n\n' : ''}\`\`\`diff
${diff}
\`\`\`

## Output Format
Output your findings as a JSON array inside a fenced code block tagged \`review-findings\`. Each finding should have:
- \`file\`: the file path (string)
- \`line\`: the line number in the new file, or null for general findings (number | null)
- \`severity\`: one of "critical", "warning", "suggestion", "nitpick"
- \`title\`: short title (string)
- \`description\`: detailed explanation (string)

\`\`\`review-findings
[
  { "file": "src/main.ts", "line": 42, "severity": "warning", "title": "Potential null dereference", "description": "The variable could be null when..." }
]
\`\`\`

Output ONLY the review-findings block. Do not use any tools.`

  // Subscribe to streaming
  let lastSendTime = 0
  const unsub = sessionManager.onMessage(sessionId, (message: unknown) => {
    const msg = message as Record<string, unknown>
    if (msg.type === 'stream_event') {
      const event = msg.event as Record<string, unknown> | undefined
      const delta = event?.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        agentSession.streamedText += delta.text
        const now = Date.now()
        if (now - lastSendTime > STREAM_THROTTLE_MS) {
          lastSendTime = now
          this.sendAgentProgress(reviewId, active)
        }
      }
    }
  })

  try {
    await sessionManager.sendMessage(sessionId, prompt)
    agentSession.findings = this.parseFindings(agentSession.streamedText)
    agentSession.status = 'done'
  } catch (err) {
    agentSession.status = 'error'
    agentSession.error = String(err)
    console.error(`Agent ${focus} failed:`, err)
  } finally {
    unsub()
  }

  this.sendAgentProgress(reviewId, active)
  return agentSession.findings
}
```

**Step 5: Add `sendAgentProgress()` helper**

```typescript
private sendAgentProgress(reviewId: string, active: ActiveReviewSession): void {
  const agentProgress = Array.from(active.agents.entries()).map(([focus, agent]) => ({
    agentId: focus,
    status: agent.status,
    findingsCount: agent.findings.length,
    error: agent.error,
  }))

  // Combine all agent streaming text for backward-compatible streamingText field
  const streamingText = Array.from(active.agents.values())
    .map((a) => a.streamedText)
    .filter(Boolean)
    .join('\n\n---\n\n')

  this.send(IPC.GH_REVIEW_UPDATE, {
    reviewId,
    status: 'running',
    streamingText,
    agentProgress,
  })
}
```

**Step 6: Add `deduplicateFindings()` method**

```typescript
private deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 }
  const grouped = new Map<string, ReviewFinding>()

  for (const f of findings) {
    const key = `${f.file}:${f.line ?? 'null'}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, f)
    } else {
      const existingRank = SEVERITY_RANK[existing.severity] ?? 99
      const newRank = SEVERITY_RANK[f.severity] ?? 99
      if (newRank < existingRank) {
        // Keep higher severity, append context
        grouped.set(key, {
          ...f,
          description: f.description + `\n\n_Also flagged by another agent:_ ${existing.title}`,
        })
      } else {
        // Keep existing, append context
        grouped.set(key, {
          ...existing,
          description: existing.description + `\n\n_Also flagged by another agent:_ ${f.title}`,
        })
      }
    }
  }
  return Array.from(grouped.values())
}
```

**Step 7: Update `stopReview()` to abort all agent sessions**

Replace `stopReview()` (lines 271-278):

```typescript
stopReview(reviewId: string): void {
  const active = this.activeReviews.get(reviewId)
  if (!active) return
  for (const agent of active.agents.values()) {
    sessionManager.stopSession(agent.sessionId)
  }
  this.updateReviewStatus(reviewId, 'error', Date.now())
  this.activeReviews.delete(reviewId)
  this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: 'Review stopped by user' })
}
```

**Step 8: Verify typecheck passes**

```bash
bun run typecheck:node
```

**Step 9: Commit**

```bash
git add src/main/pr-review-manager.ts
git commit -m "feat(review): refactor to parallel specialist agent sessions"
```

---

### Task 3: Update Store and IPC Bridge for Per-Agent Progress

**Files:**
- Modify: `src/renderer/src/store/pr-review-store.ts:51-88` (store type)
- Modify: `src/renderer/src/store/pr-review-store.ts:350-395` (handleReviewUpdate)
- Modify: `src/renderer/src/hooks/use-ipc-bridge.ts` (if needed for new IPC event shape)

**Step 1: Add `agentProgress` to store state**

In `src/renderer/src/store/pr-review-store.ts`, add to the `PrReviewStore` type (around line 65):

```typescript
agentProgress: Array<{ agentId: string; status: string; findingsCount: number; error?: string }>
```

Add initial value in the `create()` call (around line 104):

```typescript
agentProgress: [],
```

**Step 2: Update `handleReviewUpdate` to process `agentProgress`**

In the `handleReviewUpdate` method (line 350), update to handle the new field:

```typescript
handleReviewUpdate: (data) => {
  set((s) => {
    if (s.activeReview?.id !== data.reviewId) return s

    const updatedReview = { ...s.activeReview, status: data.status as PrReview['status'] }
    const updates: Partial<PrReviewStore> = {
      activeReview: updatedReview,
    }

    if (data.streamingText !== undefined) {
      updates.reviewStreamingText = data.streamingText
    }

    if ((data as any).agentProgress) {
      updates.agentProgress = (data as any).agentProgress
    }

    if (data.status === 'error') {
      updates.reviewStreamingText = ''
      updates.agentProgress = []
    }

    if (data.status === 'done') {
      let findings = data.findings ?? []
      if (findings.length === 0) {
        const streamText = data.streamingText ?? s.reviewStreamingText
        if (streamText) {
          findings = parseFindingsFromText(streamText)
          if (findings.length > 0) {
            window.api.saveGhFindings(data.reviewId, findings).catch(() => {})
          }
        }
      }
      updates.activeFindings = findings
      updates.agentProgress = (data as any).agentProgress ?? []
    }

    if (data.status === 'done' || data.status === 'error') {
      updates.reviews = s.reviews.map((r) =>
        r.id === data.reviewId ? { ...r, status: data.status as PrReview['status'] } : r
      )
    }

    return updates
  })
},
```

**Step 3: Reset `agentProgress` in relevant actions**

In `startReview` action, add `agentProgress: []` to the initial set.
In `loadReview` action, add `agentProgress: []` to the set call.
In `stopReview` action, add `agentProgress: []` to the set call.
In `selectPr` action, add `agentProgress: []` to the set call.

**Step 4: Commit**

```bash
git add src/renderer/src/store/pr-review-store.ts
git commit -m "feat(review): add per-agent progress tracking to store"
```

---

### Task 4: Update ReviewProgress UI for Multi-Agent Display

**Files:**
- Modify: `src/renderer/src/components/pr-review/ReviewProgress.tsx`

**Step 1: Add agent progress display**

Update `ReviewProgress` to read `agentProgress` from the store and show per-agent status bars above the streaming output. Each agent shows: icon, name, status (spinner/checkmark/error), and finding count.

Replace the header section of `ReviewProgress` to include agent status indicators:

```typescript
import { usePrReviewStore } from '../../store/pr-review-store'

// Inside the component, add:
const agentProgress = usePrReviewStore((s) => s.agentProgress)
```

Add an agent progress section between the header button and the expandable content:

```tsx
{/* Agent progress indicators */}
{agentProgress.length > 1 && (
  <div className="flex flex-wrap gap-2 border-t border-stone-800 px-3 py-2">
    {agentProgress.map((agent) => (
      <div
        key={agent.agentId}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
          agent.status === 'done'
            ? 'bg-emerald-500/10 text-emerald-400'
            : agent.status === 'error'
              ? 'bg-red-500/10 text-red-400'
              : agent.status === 'running'
                ? 'bg-stone-800 text-stone-300'
                : 'bg-stone-800/50 text-stone-500'
        }`}
      >
        {agent.status === 'running' && <Loader2 size={9} className="animate-spin" />}
        {agent.status === 'done' && <CheckCircle2 size={9} />}
        {agent.status === 'error' && <XCircle size={9} />}
        <span className="capitalize">{agent.agentId}</span>
        {agent.status === 'done' && agent.findingsCount > 0 && (
          <span className="tabular-nums">{agent.findingsCount}</span>
        )}
      </div>
    ))}
  </div>
)}
```

Add `CheckCircle2, XCircle` to the lucide-react imports.

**Step 2: Update finding count display**

The existing `findingCount` in the header should sum from `agentProgress` when agents are running:

```typescript
const findingCount = agentProgress.length > 0
  ? agentProgress.reduce((sum, a) => sum + a.findingsCount, 0)
  : findings.length
```

**Step 3: Commit**

```bash
git add src/renderer/src/components/pr-review/ReviewProgress.tsx
git commit -m "feat(review): show per-agent progress indicators during review"
```

---

### Task 5: Settings UI — "Review Agents" Tab

**Files:**
- Modify: `src/renderer/src/components/SettingsOverlay.tsx`

**Step 1: Add "Review Agents" tab to TABS array**

In `src/renderer/src/components/SettingsOverlay.tsx`, update the `TABS` constant (line 19-23):

```typescript
const TABS = [
  { id: 'general', label: 'General' },
  { id: 'usage', label: 'Usage' },
  { id: 'agents', label: 'Review Agents' },
  { id: 'integrations', label: 'Integrations' },
] as const
```

**Step 2: Add agent state and fetch logic**

Add state variables inside `SettingsOverlay()`:

```typescript
const [agentPrompts, setAgentPrompts] = useState<Array<{ id: string; name: string; prompt: string; isCustom: boolean }>>([])
```

Add fetch effect:

```typescript
useEffect(() => {
  if (settingsOpen && activeTab === 'agents') {
    window.api.getAgentPrompts().then(setAgentPrompts)
  }
}, [settingsOpen, activeTab])
```

**Step 3: Add agent prompt update handler**

```typescript
async function updateAgentPrompt(id: string, prompt: string) {
  await window.api.updateSettings(`reviewAgent.${id}`, prompt)
  setAgentPrompts((prev) =>
    prev.map((a) => a.id === id ? { ...a, prompt, isCustom: true } : a)
  )
}

async function resetAgentPrompt(id: string) {
  await window.api.resetAgentPrompt(id)
  const refreshed = await window.api.getAgentPrompts()
  setAgentPrompts(refreshed)
}
```

**Step 4: Render the "Review Agents" tab content**

Add after the `{activeTab === 'usage' && ...}` block:

```tsx
{activeTab === 'agents' && (
  <div className="mt-8 space-y-6">
    <div>
      <p className="text-sm text-stone-400">
        Customize the specialist prompt for each review agent. Each agent reviews the PR diff
        with its own focus area. The standard review template (PR context, diff, output format)
        is injected automatically — you only edit the specialist guidance.
      </p>
    </div>
    {agentPrompts.map((agent) => (
      <section key={agent.id} className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-stone-300">{agent.name}</label>
            {agent.isCustom && (
              <span className="ml-2 rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400">
                customized
              </span>
            )}
          </div>
          {agent.isCustom && (
            <button
              onClick={() => resetAgentPrompt(agent.id)}
              className="text-[11px] text-stone-500 transition-colors hover:text-stone-300"
            >
              Reset to default
            </button>
          )}
        </div>
        <textarea
          value={agent.prompt}
          onChange={(e) => updateAgentPrompt(agent.id, e.target.value)}
          rows={6}
          className="mt-2 w-full resize-y rounded-md bg-stone-950 px-3 py-2 text-xs leading-relaxed text-stone-300 outline-none ring-1 ring-stone-800 focus:ring-stone-600"
        />
      </section>
    ))}
  </div>
)}
```

**Step 5: Verify typecheck passes**

```bash
bun run typecheck
```

**Step 6: Commit**

```bash
git add src/renderer/src/components/SettingsOverlay.tsx
git commit -m "feat(review): add Review Agents settings tab with editable prompts"
```

---

### Task 6: End-to-End Smoke Test

**Files:** None (manual verification)

**Step 1: Start dev mode**

```bash
bun run dev
```

**Step 2: Verify Settings UI**

1. Open Settings → "Review Agents" tab
2. Verify all 5 agents show with default prompts
3. Edit one prompt, close settings, reopen — verify it persisted
4. Click "Reset to default" — verify it reverts

**Step 3: Verify parallel review**

1. Select a PR
2. Click "Review" → select 2-3 focus areas → "Start Review"
3. Verify per-agent progress pills appear (e.g., "Security: running | Bugs: running")
4. Verify each agent's pill updates to "done" with finding count
5. Verify final merged findings appear in diff viewer

**Step 4: Verify error handling**

1. Start a review → click "Stop" while running
2. Verify all agents stop and status shows error

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(review): address smoke test issues"
```
