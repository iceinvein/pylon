# PR Review Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated PR review tool to Pylon that browses GitHub PRs, runs Claude-powered reviews, and posts findings back to GitHub.

**Architecture:** New `gh-cli.ts` wraps the `gh` binary for all GitHub operations. `pr-review-manager.ts` orchestrates review lifecycle using existing session infrastructure. Renderer gets a new nav rail route (`PrReviewView`) with a two-panel layout (PR list + detail/findings). State lives in a dedicated Zustand store backed by SQLite persistence.

**Tech Stack:** Electron IPC, `gh` CLI (via `execFile` from `child_process` — NOT `exec`, to prevent shell injection), Claude Agent SDK (via existing session-manager), SQLite (better-sqlite3), React 19, Zustand, Tailwind CSS 4, Framer Motion, Lucide icons.

**Design doc:** `docs/plans/2026-03-09-pr-review-design.md`

---

## Task 1: Shared Types & IPC Channels

**Files:**
- Modify: `src/shared/types.ts:148` (append new types at end)
- Modify: `src/shared/ipc-channels.ts:1-33` (add new GH_ channels)

**Step 1: Add PR review types to `src/shared/types.ts`**

Append after the last type (`UsageStats`):

```ts
// ── PR Review ──────────────────────────────────

export type GhCliStatus = {
  available: boolean
  authenticated: boolean
  binaryPath: string | null
  username: string | null
  error: string | null
}

export type GhRepo = {
  owner: string
  repo: string
  fullName: string
  projectPath: string
}

export type GhPullRequest = {
  number: number
  title: string
  author: string
  state: 'open' | 'closed' | 'merged'
  createdAt: string
  updatedAt: string
  headBranch: string
  baseBranch: string
  additions: number
  deletions: number
  reviewDecision: string | null
  isDraft: boolean
  url: string
  repo: GhRepo
}

export type GhPrDetail = GhPullRequest & {
  body: string
  files: Array<{ path: string; additions: number; deletions: number }>
  diff: string
}

export type ReviewFinding = {
  id: string
  file: string
  line: number | null
  severity: 'critical' | 'warning' | 'suggestion' | 'nitpick'
  title: string
  description: string
  posted: boolean
}

export type ReviewFocus = 'general' | 'security' | 'bugs' | 'performance' | 'style'

export type ReviewStatus = 'pending' | 'running' | 'done' | 'error'

export type PrReview = {
  id: string
  prNumber: number
  repo: GhRepo
  prTitle: string
  prUrl: string
  status: ReviewStatus
  focus: ReviewFocus[]
  findings: ReviewFinding[]
  sessionId: string | null
  startedAt: number
  completedAt: number | null
  createdAt: number
}
```

**Step 2: Add IPC channels to `src/shared/ipc-channels.ts`**

Add these entries inside the `IPC` const object, before the closing `} as const`:

```ts
  // PR Review
  GH_CHECK_STATUS: 'gh:check-status',
  GH_SET_PATH: 'gh:set-path',
  GH_LIST_REPOS: 'gh:list-repos',
  GH_LIST_PRS: 'gh:list-prs',
  GH_PR_DETAIL: 'gh:pr-detail',
  GH_POST_COMMENT: 'gh:post-comment',
  GH_POST_REVIEW: 'gh:post-review',
  GH_START_REVIEW: 'gh:start-review',
  GH_STOP_REVIEW: 'gh:stop-review',
  GH_LIST_REVIEWS: 'gh:list-reviews',
  GH_GET_REVIEW: 'gh:get-review',
  GH_DELETE_REVIEW: 'gh:delete-review',
  GH_REVIEW_UPDATE: 'gh:review-update',
```

**Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts
git commit -m "feat(pr-review): add shared types and IPC channels"
```

---

## Task 2: SQLite Schema Migration

**Files:**
- Modify: `src/main/db.ts:46-66` (add migration block for new tables)

**Step 1: Add PR review tables**

After the existing migration blocks (line ~66), add:

```ts
  // PR Review tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_reviews (
      id TEXT PRIMARY KEY,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_title TEXT,
      pr_url TEXT,
      focus TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      session_id TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pr_review_findings (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      file TEXT,
      line INTEGER,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      posted INTEGER NOT NULL DEFAULT 0,
      posted_at INTEGER,
      FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pr_reviews_repo ON pr_reviews(repo_full_name, pr_number);
    CREATE INDEX IF NOT EXISTS idx_pr_review_findings_review ON pr_review_findings(review_id);
  `)
```

**Step 2: Commit**

```bash
git add src/main/db.ts
git commit -m "feat(pr-review): add SQLite tables for reviews and findings"
```

---

## Task 3: `gh` CLI Wrapper (`gh-cli.ts`)

**Files:**
- Create: `src/main/gh-cli.ts`

**Step 1: Create the gh CLI wrapper**

This module wraps all `gh` binary interactions. Uses `execFile` (NOT `exec`) from `child_process` to prevent shell injection.

```ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { GhCliStatus, GhRepo, GhPullRequest, GhPrDetail, ReviewFinding } from '../shared/types'
import { getDb } from './db'

const execFileAsync = promisify(execFile)

let ghBinaryPath: string | null = null

function getGhPath(): string {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ghBinaryPath'").get() as { value: string } | undefined
  return row?.value || ghBinaryPath || 'gh'
}

async function execGh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(getGhPath(), args, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.trim()
}

export async function checkGhStatus(): Promise<GhCliStatus> {
  try {
    const { stdout: whichOut } = await execFileAsync('/usr/bin/which', ['gh']).catch(() => ({ stdout: '' }))
    const detectedPath = whichOut.trim()

    if (!detectedPath && !ghBinaryPath) {
      return { available: false, authenticated: false, binaryPath: null, username: null, error: 'gh CLI not found. Install from https://cli.github.com' }
    }

    ghBinaryPath = detectedPath || ghBinaryPath

    const authOut = await execGh(['auth', 'status', '--hostname', 'github.com'])
    const usernameMatch = authOut.match(/Logged in to github\.com.*account\s+(\S+)/i)
      || authOut.match(/Logged in to github\.com.*as\s+(\S+)/i)
    const username = usernameMatch?.[1] ?? null

    return { available: true, authenticated: true, binaryPath: getGhPath(), username, error: null }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('not logged')) {
      return { available: true, authenticated: false, binaryPath: getGhPath(), username: null, error: 'Not authenticated. Run: gh auth login' }
    }
    return { available: false, authenticated: false, binaryPath: null, username: null, error: msg }
  }
}

export function setGhPath(path: string): void {
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ghBinaryPath', ?)").run(path)
  ghBinaryPath = path
}

export function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export async function discoverRepos(projectPaths: string[]): Promise<GhRepo[]> {
  const repos: GhRepo[] = []
  for (const projectPath of projectPaths) {
    try {
      const { stdout } = await execFileAsync('git', ['-C', projectPath, 'remote', 'get-url', 'origin'], { timeout: 5000 })
      const remoteUrl = stdout.trim()
      if (!remoteUrl) continue
      const parsed = parseGitHubRemote(remoteUrl)
      if (!parsed) continue
      repos.push({ owner: parsed.owner, repo: parsed.repo, fullName: `${parsed.owner}/${parsed.repo}`, projectPath })
    } catch {
      // Skip non-git or non-GitHub projects
    }
  }
  const seen = new Set<string>()
  return repos.filter((r) => {
    if (seen.has(r.fullName)) return false
    seen.add(r.fullName)
    return true
  })
}

export async function listPrs(repoFullName: string, state = 'open'): Promise<GhPullRequest[]> {
  const json = await execGh([
    'pr', 'list',
    '--repo', repoFullName,
    '--state', state,
    '--json', 'number,title,author,state,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,reviewDecision,isDraft,url',
    '--limit', '30',
  ])
  const raw = JSON.parse(json) as Array<Record<string, unknown>>
  return raw.map((pr) => ({
    number: pr.number as number,
    title: pr.title as string,
    author: ((pr.author as Record<string, string>)?.login) ?? 'unknown',
    state: pr.state as 'open' | 'closed' | 'merged',
    createdAt: pr.createdAt as string,
    updatedAt: pr.updatedAt as string,
    headBranch: pr.headRefName as string,
    baseBranch: pr.baseRefName as string,
    additions: pr.additions as number,
    deletions: pr.deletions as number,
    reviewDecision: (pr.reviewDecision as string) || null,
    isDraft: pr.isDraft as boolean,
    url: pr.url as string,
    repo: { owner: '', repo: '', fullName: repoFullName, projectPath: '' },
  }))
}

export async function getPrDetail(repoFullName: string, prNumber: number): Promise<GhPrDetail> {
  const [json, diff] = await Promise.all([
    execGh([
      'pr', 'view', String(prNumber),
      '--repo', repoFullName,
      '--json', 'number,title,body,author,state,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,reviewDecision,isDraft,url,files',
    ]),
    execGh(['pr', 'diff', String(prNumber), '--repo', repoFullName]),
  ])

  const pr = JSON.parse(json) as Record<string, unknown>
  const files = (pr.files as Array<Record<string, unknown>> ?? []).map((f) => ({
    path: f.path as string,
    additions: f.additions as number,
    deletions: f.deletions as number,
  }))

  return {
    number: pr.number as number,
    title: pr.title as string,
    body: pr.body as string,
    author: ((pr.author as Record<string, string>)?.login) ?? 'unknown',
    state: pr.state as 'open' | 'closed' | 'merged',
    createdAt: pr.createdAt as string,
    updatedAt: pr.updatedAt as string,
    headBranch: pr.headRefName as string,
    baseBranch: pr.baseRefName as string,
    additions: pr.additions as number,
    deletions: pr.deletions as number,
    reviewDecision: (pr.reviewDecision as string) || null,
    isDraft: pr.isDraft as boolean,
    url: pr.url as string,
    files,
    diff,
    repo: { owner: '', repo: '', fullName: repoFullName, projectPath: '' },
  }
}

export async function postComment(repoFullName: string, prNumber: number, body: string): Promise<void> {
  await execGh(['pr', 'comment', String(prNumber), '--repo', repoFullName, '--body', body])
}

export async function postReview(
  repoFullName: string,
  prNumber: number,
  findings: ReviewFinding[],
  commitId: string
): Promise<void> {
  const inlineFindings = findings.filter((f) => f.file && f.line !== null)
  const generalFindings = findings.filter((f) => !f.file || f.line === null)

  let reviewBody = '## PR Review Summary\n\n'
  if (generalFindings.length > 0) {
    for (const f of generalFindings) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : f.severity === 'suggestion' ? '🔵' : '⚪'
      reviewBody += `${icon} **${f.title}**\n${f.description}\n\n`
    }
  } else {
    reviewBody += `${inlineFindings.length} inline comment(s) posted.\n`
  }
  reviewBody += '\n---\n*Reviewed by Pylon*'

  const comments = inlineFindings.map((f) => ({
    path: f.file,
    line: f.line,
    body: `**${f.severity.toUpperCase()}:** ${f.title}\n\n${f.description}`,
  }))

  const payload = JSON.stringify({
    body: reviewBody,
    event: 'COMMENT',
    ...(commitId ? { commit_id: commitId } : {}),
    comments,
  })

  const [owner, repo] = repoFullName.split('/')
  const tmpPath = join(tmpdir(), `pylon-review-${Date.now()}.json`)
  await writeFile(tmpPath, payload)

  try {
    await execFileAsync(getGhPath(), [
      'api', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      '--method', 'POST',
      '--input', tmpPath,
    ], { timeout: 30_000 })
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

export async function getHeadCommitSha(repoFullName: string, prNumber: number): Promise<string> {
  const json = await execGh([
    'pr', 'view', String(prNumber),
    '--repo', repoFullName,
    '--json', 'headRefOid',
  ])
  const parsed = JSON.parse(json)
  return parsed.headRefOid as string
}
```

**Step 2: Commit**

```bash
git add src/main/gh-cli.ts
git commit -m "feat(pr-review): add gh CLI wrapper module"
```

---

## Task 4: PR Review Manager (`pr-review-manager.ts`)

**Files:**
- Create: `src/main/pr-review-manager.ts`

**Step 1: Create the review manager**

This module orchestrates the review lifecycle — creates sessions, sends the review prompt, parses findings from SDK messages, and persists everything to SQLite.

```ts
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { getDb } from './db'
import { sessionManager } from './session-manager'
import { getPrDetail } from './gh-cli'
import { IPC } from '../shared/ipc-channels'
import type { GhRepo, ReviewFocus, ReviewFinding, PrReview, ReviewStatus } from '../shared/types'

const MAX_DIFF_LINES = 50_000

type ActiveReviewSession = {
  reviewId: string
  sessionId: string
  repoFullName: string
  prNumber: number
}

class PrReviewManager {
  private activeReviews = new Map<string, ActiveReviewSession>()
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  private send(channel: string, data: unknown): void {
    this.window?.webContents.send(channel, data)
  }

  private updateReviewStatus(reviewId: string, status: ReviewStatus, completedAt?: number): void {
    const db = getDb()
    if (completedAt) {
      db.prepare('UPDATE pr_reviews SET status = ?, completed_at = ? WHERE id = ?').run(status, completedAt, reviewId)
    } else {
      db.prepare('UPDATE pr_reviews SET status = ? WHERE id = ?').run(status, reviewId)
    }
  }

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

    const sessionId = await sessionManager.createSession(repo.projectPath)
    sessionManager.setPermissionMode(sessionId, 'auto-approve')

    db.prepare('UPDATE pr_reviews SET session_id = ? WHERE id = ?').run(sessionId, reviewId)

    this.activeReviews.set(reviewId, { reviewId, sessionId, repoFullName: repo.fullName, prNumber })

    const review: PrReview = {
      id: reviewId,
      prNumber,
      repo,
      prTitle,
      prUrl,
      status: 'running',
      focus: focusAreas,
      findings: [],
      sessionId,
      startedAt: now,
      completedAt: null,
      createdAt: now,
    }

    this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'running', findings: [] })

    this.runReview(reviewId, repo, prNumber, focusAreas, sessionId).catch((err) => {
      console.error('Review failed:', err)
      this.updateReviewStatus(reviewId, 'error', Date.now())
      this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: String(err) })
    })

    return review
  }

  private async runReview(
    reviewId: string,
    repo: GhRepo,
    prNumber: number,
    focusAreas: ReviewFocus[],
    sessionId: string
  ): Promise<void> {
    const detail = await getPrDetail(repo.fullName, prNumber)

    let diff = detail.diff
    const diffLines = diff.split('\n')
    let truncated = false
    if (diffLines.length > MAX_DIFF_LINES) {
      diff = diffLines.slice(0, MAX_DIFF_LINES).join('\n')
      truncated = true
    }

    const focusStr = focusAreas.length > 0
      ? `Focus your review on: ${focusAreas.join(', ')}.`
      : 'Perform a general code review.'

    const prompt = `You are reviewing a GitHub pull request. Analyze the changes and produce structured findings.

## PR Information
- **Title:** ${detail.title}
- **Author:** ${detail.author}
- **Branch:** ${detail.headBranch} → ${detail.baseBranch}
- **Files changed:** ${detail.files.length}

## PR Description
${detail.body || '(no description)'}

## Changed Files
${detail.files.map((f) => `- ${f.path} (+${f.additions} -${f.deletions})`).join('\n')}

## Diff
${truncated ? '⚠️ Diff truncated to 50,000 lines.\n\n' : ''}\`\`\`diff
${diff}
\`\`\`

## Instructions
${focusStr}

Review the diff above and output your findings as a JSON array inside a fenced code block tagged \`review-findings\`. Each finding should have:
- \`file\`: the file path (string)
- \`line\`: the line number in the new file, or null for general findings (number | null)
- \`severity\`: one of "critical", "warning", "suggestion", "nitpick"
- \`title\`: short title (string)
- \`description\`: detailed explanation (string)

Example output format:

\`\`\`review-findings
[
  { "file": "src/main.ts", "line": 42, "severity": "warning", "title": "Potential null dereference", "description": "The variable could be null when..." }
]
\`\`\`

Output ONLY the review-findings block. Do not use any tools.`

    await sessionManager.sendMessage(sessionId, prompt)

    // After sendMessage completes, parse findings from persisted messages
    const findings = this.extractFindingsFromSession(sessionId)

    const db = getDb()
    const insertFinding = db.prepare(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )

    for (const f of findings) {
      insertFinding.run(f.id, reviewId, f.file, f.line, f.severity, f.title, f.description)
    }

    this.updateReviewStatus(reviewId, 'done', Date.now())
    this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'done', findings })
    this.activeReviews.delete(reviewId)
  }

  private extractFindingsFromSession(sessionId: string): ReviewFinding[] {
    const db = getDb()
    const messages = db.prepare(
      'SELECT sdk_message FROM messages WHERE session_id = ? ORDER BY timestamp'
    ).all(sessionId) as Array<{ sdk_message: string }>

    let fullText = ''
    for (const msg of messages) {
      try {
        const parsed = JSON.parse(msg.sdk_message)
        if (parsed.type === 'assistant' && parsed.content) {
          for (const block of parsed.content) {
            if (block.type === 'text') {
              fullText += block.text
            }
          }
        }
      } catch {
        // skip unparseable messages
      }
    }

    return this.parseFindings(fullText)
  }

  private parseFindings(text: string): ReviewFinding[] {
    const regex = /```review-findings\s*\n([\s\S]*?)```/
    const match = text.match(regex)
    if (!match) return []

    try {
      const raw = JSON.parse(match[1]) as Array<Record<string, unknown>>
      return raw.map((f) => ({
        id: randomUUID(),
        file: String(f.file || ''),
        line: f.line != null ? Number(f.line) : null,
        severity: (f.severity as ReviewFinding['severity']) || 'suggestion',
        title: String(f.title || ''),
        description: String(f.description || ''),
        posted: false,
      }))
    } catch {
      console.error('Failed to parse review findings JSON')
      return []
    }
  }

  stopReview(reviewId: string): void {
    const active = this.activeReviews.get(reviewId)
    if (!active) return
    sessionManager.stopSession(active.sessionId)
    this.updateReviewStatus(reviewId, 'error', Date.now())
    this.activeReviews.delete(reviewId)
    this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: 'Review stopped by user' })
  }

  // ── Persistence queries ──

  listReviews(repoFullName?: string, prNumber?: number): PrReview[] {
    const db = getDb()
    let sql = 'SELECT * FROM pr_reviews'
    const params: unknown[] = []

    if (repoFullName && prNumber) {
      sql += ' WHERE repo_full_name = ? AND pr_number = ?'
      params.push(repoFullName, prNumber)
    } else if (repoFullName) {
      sql += ' WHERE repo_full_name = ?'
      params.push(repoFullName)
    }
    sql += ' ORDER BY created_at DESC LIMIT 50'

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map((r) => this.rowToReview(r))
  }

  getReview(reviewId: string): (PrReview & { findings: ReviewFinding[] }) | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM pr_reviews WHERE id = ?').get(reviewId) as Record<string, unknown> | undefined
    if (!row) return null

    const findings = db.prepare(
      'SELECT * FROM pr_review_findings WHERE review_id = ? ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'warning\' THEN 1 WHEN \'suggestion\' THEN 2 WHEN \'nitpick\' THEN 3 END'
    ).all(reviewId) as Array<Record<string, unknown>>

    const review = this.rowToReview(row)
    review.findings = findings.map((f) => ({
      id: f.id as string,
      file: f.file as string,
      line: f.line as number | null,
      severity: f.severity as ReviewFinding['severity'],
      title: f.title as string,
      description: f.description as string,
      posted: Boolean(f.posted),
    }))

    return review as PrReview & { findings: ReviewFinding[] }
  }

  deleteReview(reviewId: string): void {
    const db = getDb()
    db.prepare('DELETE FROM pr_reviews WHERE id = ?').run(reviewId)
  }

  markFindingPosted(findingId: string): void {
    const db = getDb()
    db.prepare('UPDATE pr_review_findings SET posted = 1, posted_at = ? WHERE id = ?').run(Date.now(), findingId)
  }

  private rowToReview(row: Record<string, unknown>): PrReview {
    const fullName = row.repo_full_name as string
    const [owner = '', repo = ''] = fullName.split('/')
    return {
      id: row.id as string,
      prNumber: row.pr_number as number,
      repo: { owner, repo, fullName, projectPath: '' },
      prTitle: (row.pr_title as string) ?? '',
      prUrl: (row.pr_url as string) ?? '',
      status: row.status as ReviewStatus,
      focus: JSON.parse((row.focus as string) || '[]'),
      findings: [],
      sessionId: row.session_id as string | null,
      startedAt: row.started_at as number,
      completedAt: row.completed_at as number | null,
      createdAt: row.created_at as number,
    }
  }
}

export const prReviewManager = new PrReviewManager()
```

**Step 2: Commit**

```bash
git add src/main/pr-review-manager.ts
git commit -m "feat(pr-review): add review manager for session orchestration and persistence"
```

---

## Task 5: IPC Handlers for PR Review

**Files:**
- Modify: `src/main/ipc-handlers.ts` (add new handlers at end of `registerIpcHandlers`)

**Step 1: Add PR review IPC handlers**

Add `ReviewFinding` to the import at the top:

```ts
import type { AppSettings, PermissionMode, PermissionResponse, QuestionResponse, ReviewFinding } from '../shared/types'
```

At the end of the `registerIpcHandlers` function, before the closing `}`, add:

```ts
  // ── PR Review ──

  ipcMain.handle(IPC.GH_CHECK_STATUS, async () => {
    const { checkGhStatus } = await import('./gh-cli')
    return checkGhStatus()
  })

  ipcMain.handle(IPC.GH_SET_PATH, async (_e, args: { path: string }) => {
    const { setGhPath, checkGhStatus } = await import('./gh-cli')
    setGhPath(args.path)
    return checkGhStatus()
  })

  ipcMain.handle(IPC.GH_LIST_REPOS, async () => {
    const { discoverRepos } = await import('./gh-cli')
    const projects = sessionManager.getProjectFolders()
    const paths = projects.map((p: { path: string }) => p.path)
    return discoverRepos(paths)
  })

  ipcMain.handle(IPC.GH_LIST_PRS, async (_e, args: { repo: string; state?: string }) => {
    const { listPrs } = await import('./gh-cli')
    return listPrs(args.repo, args.state)
  })

  ipcMain.handle(IPC.GH_PR_DETAIL, async (_e, args: { repo: string; number: number }) => {
    const { getPrDetail } = await import('./gh-cli')
    return getPrDetail(args.repo, args.number)
  })

  ipcMain.handle(IPC.GH_START_REVIEW, async (_e, args: {
    repo: { owner: string; repo: string; fullName: string; projectPath: string }
    prNumber: number
    prTitle: string
    prUrl: string
    focus: string[]
  }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.startReview(args.repo, args.prNumber, args.prTitle, args.prUrl, args.focus as any)
  })

  ipcMain.handle(IPC.GH_STOP_REVIEW, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.stopReview(args.reviewId)
    return true
  })

  ipcMain.handle(IPC.GH_LIST_REVIEWS, async (_e, args: { repo?: string; prNumber?: number }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.listReviews(args.repo, args.prNumber)
  })

  ipcMain.handle(IPC.GH_GET_REVIEW, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getReview(args.reviewId)
  })

  ipcMain.handle(IPC.GH_DELETE_REVIEW, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.deleteReview(args.reviewId)
    return true
  })

  ipcMain.handle(IPC.GH_POST_COMMENT, async (_e, args: { repo: string; number: number; body: string }) => {
    const { postComment } = await import('./gh-cli')
    await postComment(args.repo, args.number, args.body)
    return true
  })

  ipcMain.handle(IPC.GH_POST_REVIEW, async (_e, args: { repo: string; number: number; findings: ReviewFinding[]; commitId: string }) => {
    const { postReview } = await import('./gh-cli')
    await postReview(args.repo, args.number, args.findings, args.commitId)
    const { prReviewManager } = await import('./pr-review-manager')
    for (const f of args.findings) {
      prReviewManager.markFindingPosted(f.id)
    }
    return true
  })
```

**Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat(pr-review): register IPC handlers for gh operations and reviews"
```

---

## Task 6: Preload API Surface

**Files:**
- Modify: `src/preload/index.ts` (add new API methods)
- Modify: `src/preload/index.d.ts` (add type declarations)

**Step 1: Add API methods to `src/preload/index.ts`**

Add these methods inside the `api` object, before the `onSessionMessage` method:

```ts
  // PR Review
  checkGhStatus: () =>
    ipcRenderer.invoke(IPC.GH_CHECK_STATUS),
  setGhPath: (path: string) =>
    ipcRenderer.invoke(IPC.GH_SET_PATH, { path }),
  listGhRepos: () =>
    ipcRenderer.invoke(IPC.GH_LIST_REPOS),
  listGhPrs: (repo: string, state?: string) =>
    ipcRenderer.invoke(IPC.GH_LIST_PRS, { repo, state }),
  getGhPrDetail: (repo: string, number: number) =>
    ipcRenderer.invoke(IPC.GH_PR_DETAIL, { repo, number }),
  startGhReview: (args: {
    repo: { owner: string; repo: string; fullName: string; projectPath: string }
    prNumber: number; prTitle: string; prUrl: string; focus: string[]
  }) =>
    ipcRenderer.invoke(IPC.GH_START_REVIEW, args),
  stopGhReview: (reviewId: string) =>
    ipcRenderer.invoke(IPC.GH_STOP_REVIEW, { reviewId }),
  listGhReviews: (repo?: string, prNumber?: number) =>
    ipcRenderer.invoke(IPC.GH_LIST_REVIEWS, { repo, prNumber }),
  getGhReview: (reviewId: string) =>
    ipcRenderer.invoke(IPC.GH_GET_REVIEW, { reviewId }),
  deleteGhReview: (reviewId: string) =>
    ipcRenderer.invoke(IPC.GH_DELETE_REVIEW, { reviewId }),
  postGhComment: (repo: string, number: number, body: string) =>
    ipcRenderer.invoke(IPC.GH_POST_COMMENT, { repo, number, body }),
  postGhReview: (repo: string, number: number, findings: unknown[], commitId: string) =>
    ipcRenderer.invoke(IPC.GH_POST_REVIEW, { repo, number, findings, commitId }),
  onGhReviewUpdate: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GH_REVIEW_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.GH_REVIEW_UPDATE, handler)
  },
```

**Step 2: Add type declarations to `src/preload/index.d.ts`**

Add inside the `Api` type, before the closing `}`:

```ts
  // PR Review
  checkGhStatus: () => Promise<import('../shared/types').GhCliStatus>
  setGhPath: (path: string) => Promise<import('../shared/types').GhCliStatus>
  listGhRepos: () => Promise<import('../shared/types').GhRepo[]>
  listGhPrs: (repo: string, state?: string) => Promise<import('../shared/types').GhPullRequest[]>
  getGhPrDetail: (repo: string, number: number) => Promise<import('../shared/types').GhPrDetail>
  startGhReview: (args: {
    repo: import('../shared/types').GhRepo
    prNumber: number; prTitle: string; prUrl: string; focus: string[]
  }) => Promise<import('../shared/types').PrReview>
  stopGhReview: (reviewId: string) => Promise<boolean>
  listGhReviews: (repo?: string, prNumber?: number) => Promise<import('../shared/types').PrReview[]>
  getGhReview: (reviewId: string) => Promise<(import('../shared/types').PrReview & { findings: import('../shared/types').ReviewFinding[] }) | null>
  deleteGhReview: (reviewId: string) => Promise<boolean>
  postGhComment: (repo: string, number: number, body: string) => Promise<boolean>
  postGhReview: (repo: string, number: number, findings: import('../shared/types').ReviewFinding[], commitId: string) => Promise<boolean>
  onGhReviewUpdate: (callback: (data: unknown) => void) => () => void
```

**Step 3: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(pr-review): expose PR review API surface via preload"
```

---

## Task 7: Initialize PR Review Manager in Main Process

**Files:**
- Modify: `src/main/index.ts` (import and init prReviewManager)

**Step 1: Wire up prReviewManager**

In `src/main/index.ts`, find where `sessionManager.setWindow(mainWindow)` is called. Add the import at the top of the file:

```ts
import { prReviewManager } from './pr-review-manager'
```

Then add after `sessionManager.setWindow(mainWindow)`:

```ts
prReviewManager.setWindow(mainWindow)
```

**Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(pr-review): initialize review manager on app startup"
```

---

## Task 8: Zustand Store (`pr-review-store.ts`)

**Files:**
- Create: `src/renderer/src/store/pr-review-store.ts`

**Step 1: Create the store**

```ts
import { create } from 'zustand'
import type {
  GhCliStatus, GhRepo, GhPullRequest, GhPrDetail,
  PrReview, ReviewFinding, ReviewFocus
} from '../../../shared/types'

type PrReviewStore = {
  ghStatus: GhCliStatus | null
  ghStatusLoading: boolean
  repos: GhRepo[]
  reposLoading: boolean
  selectedRepo: string | null
  prs: GhPullRequest[]
  prsLoading: boolean
  selectedPr: GhPullRequest | null
  prDetail: GhPrDetail | null
  prDetailLoading: boolean
  reviews: PrReview[]
  activeReview: PrReview | null
  activeFindings: ReviewFinding[]
  selectedFindingIds: Set<string>

  checkGhStatus: () => Promise<void>
  setGhPath: (path: string) => Promise<void>
  loadRepos: () => Promise<void>
  setSelectedRepo: (repo: string | null) => void
  loadPrs: (repo?: string) => Promise<void>
  selectPr: (pr: GhPullRequest | null) => Promise<void>
  loadPrReviews: (repo: string, prNumber: number) => Promise<void>
  startReview: (repo: GhRepo, pr: GhPullRequest, focus: ReviewFocus[]) => Promise<void>
  stopReview: (reviewId: string) => Promise<void>
  loadReview: (reviewId: string) => Promise<void>
  deleteReview: (reviewId: string) => Promise<void>
  toggleFinding: (findingId: string) => void
  selectAllFindings: () => void
  clearFindingSelection: () => void
  postFinding: (finding: ReviewFinding, repo: string, prNumber: number) => Promise<void>
  postSelectedAsReview: (repo: string, prNumber: number) => Promise<void>
  postAllAsReview: (repo: string, prNumber: number) => Promise<void>
  handleReviewUpdate: (data: { reviewId: string; status: string; findings?: ReviewFinding[]; error?: string }) => void
}

export const usePrReviewStore = create<PrReviewStore>((set, get) => ({
  ghStatus: null,
  ghStatusLoading: false,
  repos: [],
  reposLoading: false,
  selectedRepo: null,
  prs: [],
  prsLoading: false,
  selectedPr: null,
  prDetail: null,
  prDetailLoading: false,
  reviews: [],
  activeReview: null,
  activeFindings: [],
  selectedFindingIds: new Set(),

  checkGhStatus: async () => {
    set({ ghStatusLoading: true })
    const status = await window.api.checkGhStatus()
    set({ ghStatus: status, ghStatusLoading: false })
  },

  setGhPath: async (path) => {
    const status = await window.api.setGhPath(path)
    set({ ghStatus: status })
  },

  loadRepos: async () => {
    set({ reposLoading: true })
    const repos = await window.api.listGhRepos()
    set({ repos, reposLoading: false })
  },

  setSelectedRepo: (repo) => {
    set({ selectedRepo: repo, selectedPr: null, prDetail: null, activeReview: null, activeFindings: [], reviews: [] })
    get().loadPrs(repo ?? undefined)
  },

  loadPrs: async (repo) => {
    set({ prsLoading: true })
    if (repo) {
      const prs = await window.api.listGhPrs(repo)
      const repos = get().repos
      const repoInfo = repos.find((r) => r.fullName === repo)
      const prsWithRepo = prs.map((pr) => ({ ...pr, repo: repoInfo ?? pr.repo }))
      set({ prs: prsWithRepo, prsLoading: false })
    } else {
      const repos = get().repos
      const allPrs: GhPullRequest[] = []
      for (const r of repos) {
        try {
          const prs = await window.api.listGhPrs(r.fullName)
          allPrs.push(...prs.map((pr) => ({ ...pr, repo: r })))
        } catch {
          // skip repos that fail
        }
      }
      allPrs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      set({ prs: allPrs, prsLoading: false })
    }
  },

  selectPr: async (pr) => {
    set({ selectedPr: pr, prDetail: null, activeReview: null, activeFindings: [], selectedFindingIds: new Set() })
    if (!pr) return
    set({ prDetailLoading: true })
    try {
      const detail = await window.api.getGhPrDetail(pr.repo.fullName, pr.number)
      detail.repo = pr.repo
      set({ prDetail: detail, prDetailLoading: false })
    } catch {
      set({ prDetailLoading: false })
    }
    get().loadPrReviews(pr.repo.fullName, pr.number)
  },

  loadPrReviews: async (repo, prNumber) => {
    const reviews = await window.api.listGhReviews(repo, prNumber)
    set({ reviews })
    const latest = reviews.find((r) => r.status === 'done')
    if (latest) {
      get().loadReview(latest.id)
    }
  },

  startReview: async (repo, pr, focus) => {
    const review = await window.api.startGhReview({
      repo,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.url,
      focus,
    })
    set({ activeReview: review, activeFindings: [], selectedFindingIds: new Set() })
  },

  stopReview: async (reviewId) => {
    await window.api.stopGhReview(reviewId)
    set((s) => ({
      activeReview: s.activeReview?.id === reviewId
        ? { ...s.activeReview, status: 'error' }
        : s.activeReview,
    }))
  },

  loadReview: async (reviewId) => {
    const review = await window.api.getGhReview(reviewId)
    if (!review) return
    set({ activeReview: review, activeFindings: review.findings, selectedFindingIds: new Set() })
  },

  deleteReview: async (reviewId) => {
    await window.api.deleteGhReview(reviewId)
    set((s) => ({
      reviews: s.reviews.filter((r) => r.id !== reviewId),
      activeReview: s.activeReview?.id === reviewId ? null : s.activeReview,
      activeFindings: s.activeReview?.id === reviewId ? [] : s.activeFindings,
    }))
  },

  toggleFinding: (findingId) => {
    set((s) => {
      const next = new Set(s.selectedFindingIds)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return { selectedFindingIds: next }
    })
  },

  selectAllFindings: () => {
    const { activeFindings } = get()
    set({ selectedFindingIds: new Set(activeFindings.filter((f) => !f.posted).map((f) => f.id)) })
  },

  clearFindingSelection: () => set({ selectedFindingIds: new Set() }),

  postFinding: async (finding, repo, prNumber) => {
    const icon = finding.severity === 'critical' ? '🔴' : finding.severity === 'warning' ? '🟡' : finding.severity === 'suggestion' ? '🔵' : '⚪'
    const body = `### ${icon} ${finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}: ${finding.title}\n\n${finding.file ? `**File:** \`${finding.file}${finding.line ? `:${finding.line}` : ''}\`\n\n` : ''}${finding.description}\n\n---\n*Reviewed by Pylon*`
    await window.api.postGhComment(repo, prNumber, body)
    set((s) => ({
      activeFindings: s.activeFindings.map((f) =>
        f.id === finding.id ? { ...f, posted: true } : f
      ),
    }))
  },

  postSelectedAsReview: async (repo, prNumber) => {
    const { activeFindings, selectedFindingIds } = get()
    const selected = activeFindings.filter((f) => selectedFindingIds.has(f.id) && !f.posted)
    if (selected.length === 0) return
    await window.api.postGhReview(repo, prNumber, selected, '')
    set((s) => ({
      activeFindings: s.activeFindings.map((f) =>
        selectedFindingIds.has(f.id) ? { ...f, posted: true } : f
      ),
      selectedFindingIds: new Set(),
    }))
  },

  postAllAsReview: async (repo, prNumber) => {
    const { activeFindings } = get()
    const unposted = activeFindings.filter((f) => !f.posted)
    if (unposted.length === 0) return
    await window.api.postGhReview(repo, prNumber, unposted, '')
    set((s) => ({
      activeFindings: s.activeFindings.map((f) => ({ ...f, posted: true })),
      selectedFindingIds: new Set(),
    }))
  },

  handleReviewUpdate: (data) => {
    set((s) => {
      if (s.activeReview?.id !== data.reviewId) return s
      return {
        activeReview: { ...s.activeReview, status: data.status as any },
        activeFindings: data.findings ?? s.activeFindings,
      }
    })
  },
}))
```

**Step 2: Commit**

```bash
git add src/renderer/src/store/pr-review-store.ts
git commit -m "feat(pr-review): add Zustand store for PR review state"
```

---

## Task 9: IPC Bridge Hook (`use-pr-review-bridge.ts`)

**Files:**
- Create: `src/renderer/src/hooks/use-pr-review-bridge.ts`

**Step 1: Create the bridge hook**

```ts
import { useEffect } from 'react'
import { usePrReviewStore } from '../store/pr-review-store'

export function usePrReviewBridge() {
  const handleReviewUpdate = usePrReviewStore((s) => s.handleReviewUpdate)

  useEffect(() => {
    const unsub = window.api.onGhReviewUpdate((data) => {
      handleReviewUpdate(data as any)
    })
    return unsub
  }, [handleReviewUpdate])
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/hooks/use-pr-review-bridge.ts
git commit -m "feat(pr-review): add IPC bridge hook for review updates"
```

---

## Task 10: UI Store & NavRail Update

**Files:**
- Modify: `src/renderer/src/store/ui-store.ts:3` (extend SidebarView type)
- Modify: `src/renderer/src/components/layout/NavRail.tsx` (add PR review button)

**Step 1: Extend SidebarView type in `src/renderer/src/store/ui-store.ts`**

Change line 3 from:

```ts
type SidebarView = 'home' | 'history' | 'settings'
```

To:

```ts
type SidebarView = 'home' | 'history' | 'pr-review' | 'settings'
```

**Step 2: Add PR review button to NavRail**

In `src/renderer/src/components/layout/NavRail.tsx`:

Change the lucide-react import on line 2 to:

```ts
import { Home, Clock, FolderOpen, Settings, GitPullRequestDraft } from 'lucide-react'
```

Add a new button between the History button and the Projects button. After the closing `</motion.button>` of the History button (after line 60), add:

```tsx
        <motion.button
          onClick={() => setSidebarView(sidebarView === 'pr-review' ? 'home' : 'pr-review')}
          title="PR Review"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            sidebarView === 'pr-review'
              ? 'text-stone-100'
              : 'text-stone-400 hover:text-stone-100'
          }`}
        >
          {sidebarView === 'pr-review' && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-lg bg-stone-700"
              transition={{ duration: 0.15, ease: 'easeOut' }}
            />
          )}
          <GitPullRequestDraft size={18} className="relative z-10" />
        </motion.button>
```

**Step 3: Commit**

```bash
git add src/renderer/src/store/ui-store.ts src/renderer/src/components/layout/NavRail.tsx
git commit -m "feat(pr-review): add PR review button to nav rail"
```

---

## Task 11: App.tsx Routing

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Update App.tsx routing**

Add imports at the top:

```ts
import { PrReviewView } from './pages/PrReviewView'
import { usePrReviewBridge } from './hooks/use-pr-review-bridge'
import { useUiStore } from './store/ui-store'
```

Inside the `App` component, after `useIpcBridge()`, add:

```ts
usePrReviewBridge()
const sidebarView = useUiStore((s) => s.sidebarView)
```

Replace the rendering inside `<Layout>`:

```tsx
<Layout>
  {sidebarView === 'pr-review' ? (
    <PrReviewView />
  ) : activeTab && activeTab.cwd ? (
    <SessionView key={activeTab.id} tab={activeTab} />
  ) : (
    <HomePage />
  )}
</Layout>
```

**Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(pr-review): add PrReviewView routing in App.tsx"
```

---

## Task 12: GhSetupGuide Component

**Files:**
- Create: `src/renderer/src/components/pr-review/GhSetupGuide.tsx`

**Step 1: Create the component**

```tsx
import { useState } from 'react'
import { Terminal, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'

export function GhSetupGuide() {
  const { ghStatus, checkGhStatus, ghStatusLoading, setGhPath } = usePrReviewStore()
  const [customPath, setCustomPath] = useState('')

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-800">
          <Terminal size={28} className="text-stone-400" />
        </div>

        <div>
          <h2 className="text-lg font-medium text-stone-100">GitHub CLI Required</h2>
          <p className="mt-2 text-sm text-stone-400">
            PR Review requires the <code className="rounded bg-stone-800 px-1.5 py-0.5 text-xs text-stone-300">gh</code> CLI to interact with GitHub.
          </p>
        </div>

        <div className="space-y-3 text-left">
          <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
            <h3 className="text-sm font-medium text-stone-300">1. Install gh CLI</h3>
            <code className="mt-2 block rounded bg-stone-950 px-3 py-2 text-xs text-stone-400">
              brew install gh
            </code>
          </div>

          <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
            <h3 className="text-sm font-medium text-stone-300">2. Authenticate</h3>
            <code className="mt-2 block rounded bg-stone-950 px-3 py-2 text-xs text-stone-400">
              gh auth login
            </code>
          </div>

          {ghStatus && !ghStatus.available && (
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
              <h3 className="text-sm font-medium text-stone-300">Custom path (optional)</h3>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/usr/local/bin/gh"
                  className="flex-1 rounded bg-stone-950 px-3 py-1.5 text-xs text-stone-300 placeholder-stone-600 outline-none ring-1 ring-stone-800 focus:ring-stone-600"
                />
                <button
                  onClick={() => customPath && setGhPath(customPath)}
                  className="rounded bg-stone-800 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-700"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>

        {ghStatus && (
          <div className="flex items-center justify-center gap-2 text-sm">
            {ghStatus.available && ghStatus.authenticated ? (
              <>
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-green-400">Connected as {ghStatus.username}</span>
              </>
            ) : ghStatus.available && !ghStatus.authenticated ? (
              <>
                <XCircle size={14} className="text-amber-500" />
                <span className="text-amber-400">gh found but not authenticated</span>
              </>
            ) : (
              <>
                <XCircle size={14} className="text-red-500" />
                <span className="text-red-400">{ghStatus.error}</span>
              </>
            )}
          </div>
        )}

        <button
          onClick={checkGhStatus}
          disabled={ghStatusLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-sm text-stone-200 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={ghStatusLoading ? 'animate-spin' : ''} />
          Re-check
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/GhSetupGuide.tsx
git commit -m "feat(pr-review): add GhSetupGuide component"
```

---

## Task 13: PrCard Component

**Files:**
- Create: `src/renderer/src/components/pr-review/PrCard.tsx`

**Step 1: Create the component**

```tsx
import { GitPullRequestDraft, GitPullRequest as GitPrIcon } from 'lucide-react'
import type { GhPullRequest } from '../../../../shared/types'

type PrCardProps = {
  pr: GhPullRequest
  selected: boolean
  onClick: () => void
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function PrCard({ pr, selected, onClick }: PrCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-stone-600 bg-stone-800'
          : 'border-transparent hover:bg-stone-800/50'
      }`}
    >
      <div className="flex items-start gap-2">
        {pr.isDraft ? (
          <GitPullRequestDraft size={14} className="mt-0.5 flex-shrink-0 text-stone-500" />
        ) : (
          <GitPrIcon size={14} className="mt-0.5 flex-shrink-0 text-green-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-stone-200">
            {pr.title}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
            <span>#{pr.number}</span>
            <span>{pr.author}</span>
            <span>{timeAgo(pr.updatedAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-green-600">+{pr.additions}</span>
            <span className="text-red-600">-{pr.deletions}</span>
            {pr.isDraft && (
              <span className="rounded bg-stone-700 px-1.5 py-0.5 text-[10px] text-stone-400">Draft</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/PrCard.tsx
git commit -m "feat(pr-review): add PrCard component"
```

---

## Task 14: PrList Component

**Files:**
- Create: `src/renderer/src/components/pr-review/PrList.tsx`

**Step 1: Create the component**

```tsx
import { useState, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { PrCard } from './PrCard'

export function PrList() {
  const {
    repos, reposLoading, selectedRepo, setSelectedRepo,
    prs, prsLoading, selectedPr, selectPr, loadRepos, loadPrs,
  } = usePrReviewStore()

  const [search, setSearch] = useState('')

  useEffect(() => {
    loadRepos()
  }, [])

  useEffect(() => {
    if (repos.length > 0) {
      loadPrs(selectedRepo ?? undefined)
    }
  }, [repos])

  const filteredPrs = search
    ? prs.filter((pr) =>
        pr.title.toLowerCase().includes(search.toLowerCase()) ||
        String(pr.number).includes(search)
      )
    : prs

  return (
    <div className="flex h-full flex-col border-r border-stone-800">
      <div className="border-b border-stone-800 p-3">
        <select
          value={selectedRepo ?? '__all__'}
          onChange={(e) => setSelectedRepo(e.target.value === '__all__' ? null : e.target.value)}
          className="w-full rounded-md bg-stone-800 px-2.5 py-1.5 text-xs text-stone-300 outline-none ring-1 ring-stone-700 focus:ring-stone-500"
        >
          <option value="__all__">All repos</option>
          {repos.map((r) => (
            <option key={r.fullName} value={r.fullName}>
              {r.fullName}
            </option>
          ))}
        </select>

        <div className="relative mt-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter PRs..."
            className="w-full rounded-md bg-stone-800 py-1.5 pl-8 pr-3 text-xs text-stone-300 placeholder-stone-600 outline-none ring-1 ring-stone-700 focus:ring-stone-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {(prsLoading || reposLoading) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-stone-500" />
          </div>
        ) : filteredPrs.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">
            {repos.length === 0
              ? 'No GitHub projects found. Add a project first.'
              : 'No open PRs found.'}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPrs.map((pr) => (
              <PrCard
                key={`${pr.repo.fullName}#${pr.number}`}
                pr={pr}
                selected={selectedPr?.number === pr.number && selectedPr?.repo.fullName === pr.repo.fullName}
                onClick={() => selectPr(pr)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/PrList.tsx
git commit -m "feat(pr-review): add PrList component with repo filter and search"
```

---

## Task 15: ReviewFocusSelector Component

**Files:**
- Create: `src/renderer/src/components/pr-review/ReviewFocusSelector.tsx`

**Step 1: Create the component**

```tsx
import { Shield, Bug, Gauge, Paintbrush, Eye } from 'lucide-react'
import type { ReviewFocus } from '../../../../shared/types'

const FOCUS_OPTIONS: Array<{ id: ReviewFocus; label: string; icon: typeof Shield }> = [
  { id: 'general', label: 'General', icon: Eye },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'bugs', label: 'Bugs', icon: Bug },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'style', label: 'Style', icon: Paintbrush },
]

type Props = {
  selected: ReviewFocus[]
  onChange: (focus: ReviewFocus[]) => void
}

export function ReviewFocusSelector({ selected, onChange }: Props) {
  function toggle(id: ReviewFocus) {
    if (selected.includes(id)) {
      onChange(selected.filter((f) => f !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-stone-400">Review Focus</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {FOCUS_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isSelected = selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                isSelected
                  ? 'border-stone-500 bg-stone-800 text-stone-200'
                  : 'border-stone-700/50 text-stone-500 hover:border-stone-600 hover:text-stone-400'
              }`}
            >
              <Icon size={12} />
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/ReviewFocusSelector.tsx
git commit -m "feat(pr-review): add ReviewFocusSelector component"
```

---

## Task 16: ReviewProgress Component

**Files:**
- Create: `src/renderer/src/components/pr-review/ReviewProgress.tsx`

**Step 1: Create the component**

```tsx
import { Loader2, StopCircle } from 'lucide-react'

type Props = {
  reviewId: string
  onStop: () => void
}

export function ReviewProgress({ reviewId, onStop }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 size={24} className="animate-spin text-stone-400" />
      <div className="text-center">
        <p className="text-sm text-stone-300">Reviewing PR...</p>
        <p className="mt-1 text-xs text-stone-500">Claude is analyzing the diff and producing findings</p>
      </div>
      <button
        onClick={onStop}
        className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-400 transition-colors hover:border-stone-600 hover:text-stone-300"
      >
        <StopCircle size={12} />
        Stop Review
      </button>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/ReviewProgress.tsx
git commit -m "feat(pr-review): add ReviewProgress component"
```

---

## Task 17: FindingCard Component

**Files:**
- Create: `src/renderer/src/components/pr-review/FindingCard.tsx`

**Step 1: Create the component**

```tsx
import { CheckCircle2, Send } from 'lucide-react'
import type { ReviewFinding } from '../../../../shared/types'

type Props = {
  finding: ReviewFinding
  checked: boolean
  onToggle: () => void
  onPost: () => void
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-950/30 border-red-900/50', text: 'text-red-400', label: 'Critical' },
  warning: { bg: 'bg-amber-950/30 border-amber-900/50', text: 'text-amber-400', label: 'Warning' },
  suggestion: { bg: 'bg-blue-950/30 border-blue-900/50', text: 'text-blue-400', label: 'Suggestion' },
  nitpick: { bg: 'bg-stone-800/50 border-stone-700/50', text: 'text-stone-400', label: 'Nitpick' },
}

export function FindingCard({ finding, checked, onToggle, onPost }: Props) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.suggestion

  return (
    <div className={`rounded-lg border p-3 ${style.bg}`}>
      <div className="flex items-start gap-3">
        {!finding.posted && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded border-stone-600 bg-stone-800 accent-stone-400"
          />
        )}
        {finding.posted && (
          <CheckCircle2 size={14} className="mt-1 flex-shrink-0 text-green-500" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
            <span className="text-sm font-medium text-stone-200">{finding.title}</span>
          </div>
          {finding.file && (
            <div className="mt-0.5 text-xs text-stone-500">
              {finding.file}{finding.line ? `:${finding.line}` : ''}
            </div>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
            {finding.description}
          </p>
        </div>

        {!finding.posted && (
          <button
            onClick={onPost}
            title="Post this finding"
            className="flex-shrink-0 rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-700 hover:text-stone-300"
          >
            <Send size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/FindingCard.tsx
git commit -m "feat(pr-review): add FindingCard component"
```

---

## Task 18: FindingsList Component

**Files:**
- Create: `src/renderer/src/components/pr-review/FindingsList.tsx`

**Step 1: Create the component**

```tsx
import { usePrReviewStore } from '../../store/pr-review-store'
import { FindingCard } from './FindingCard'

type Props = {
  repoFullName: string
  prNumber: number
}

export function FindingsList({ repoFullName, prNumber }: Props) {
  const { activeFindings, selectedFindingIds, toggleFinding, postFinding } = usePrReviewStore()

  if (activeFindings.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-stone-500">
        No findings from this review.
      </div>
    )
  }

  const sorted = [...activeFindings].sort((a, b) => {
    if (a.posted !== b.posted) return a.posted ? 1 : -1
    const order = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 }
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-stone-400">
          Findings ({activeFindings.length})
        </h3>
        <div className="flex gap-2 text-xs text-stone-500">
          <span>{activeFindings.filter((f) => f.posted).length} posted</span>
        </div>
      </div>
      <div className="space-y-2">
        {sorted.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            checked={selectedFindingIds.has(f.id)}
            onToggle={() => toggleFinding(f.id)}
            onPost={() => postFinding(f, repoFullName, prNumber)}
          />
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/FindingsList.tsx
git commit -m "feat(pr-review): add FindingsList component"
```

---

## Task 19: PostActions Component

**Files:**
- Create: `src/renderer/src/components/pr-review/PostActions.tsx`

**Step 1: Create the component**

```tsx
import { Send, CheckCheck } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'

type Props = {
  repoFullName: string
  prNumber: number
}

export function PostActions({ repoFullName, prNumber }: Props) {
  const {
    activeFindings, selectedFindingIds,
    selectAllFindings, clearFindingSelection,
    postSelectedAsReview, postAllAsReview,
  } = usePrReviewStore()

  const unposted = activeFindings.filter((f) => !f.posted)
  const selectedCount = [...selectedFindingIds].filter((id) =>
    activeFindings.find((f) => f.id === id && !f.posted)
  ).length

  if (unposted.length === 0) return null

  return (
    <div className="flex items-center gap-2 border-t border-stone-800 px-4 py-3">
      <button
        onClick={selectedFindingIds.size > 0 ? clearFindingSelection : selectAllFindings}
        className="text-xs text-stone-500 hover:text-stone-300"
      >
        {selectedFindingIds.size > 0 ? 'Deselect all' : 'Select all'}
      </button>

      <div className="flex-1" />

      <button
        onClick={() => postSelectedAsReview(repoFullName, prNumber)}
        disabled={selectedCount === 0}
        className="flex items-center gap-1.5 rounded-lg border border-stone-600 px-3 py-1.5 text-xs text-stone-300 transition-colors hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none"
      >
        <Send size={12} />
        Post Selected ({selectedCount})
      </button>

      <button
        onClick={() => postAllAsReview(repoFullName, prNumber)}
        className="flex items-center gap-1.5 rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-medium text-stone-900 transition-colors hover:bg-stone-100"
      >
        <CheckCheck size={12} />
        Post All ({unposted.length})
      </button>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/PostActions.tsx
git commit -m "feat(pr-review): add PostActions component"
```

---

## Task 20: ReviewHistory Component

**Files:**
- Create: `src/renderer/src/components/pr-review/ReviewHistory.tsx`

**Step 1: Create the component**

```tsx
import { Clock, Trash2 } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'

export function ReviewHistory() {
  const { reviews, activeReview, loadReview, deleteReview } = usePrReviewStore()

  if (reviews.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-medium text-stone-400">Previous Reviews</h3>
      <div className="mt-2 space-y-1">
        {reviews.map((r) => {
          const isActive = activeReview?.id === r.id
          const date = new Date(r.createdAt)
          const statusLabel = r.status === 'done' ? `${r.findings.length} findings` : r.status
          return (
            <div
              key={r.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                isActive ? 'bg-stone-800 text-stone-200' : 'text-stone-400 hover:bg-stone-800/50'
              }`}
            >
              <button
                onClick={() => loadReview(r.id)}
                className="flex flex-1 items-center gap-2"
              >
                <Clock size={12} className="flex-shrink-0" />
                <span>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-stone-600">&middot;</span>
                <span>{r.focus.join(', ')}</span>
                <span className="text-stone-600">&middot;</span>
                <span className={r.status === 'done' ? 'text-green-500' : r.status === 'error' ? 'text-red-500' : 'text-stone-500'}>{statusLabel}</span>
              </button>
              <button
                onClick={() => deleteReview(r.id)}
                className="flex-shrink-0 p-1 text-stone-600 hover:text-red-400"
                title="Delete review"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/ReviewHistory.tsx
git commit -m "feat(pr-review): add ReviewHistory component"
```

---

## Task 21: PrDetail Component

**Files:**
- Create: `src/renderer/src/components/pr-review/PrDetail.tsx`

**Step 1: Create the component**

```tsx
import { useState } from 'react'
import { GitPullRequest, FileText, User, GitBranch, Loader2, Play, ExternalLink } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { ReviewFocusSelector } from './ReviewFocusSelector'
import { ReviewProgress } from './ReviewProgress'
import { FindingsList } from './FindingsList'
import { PostActions } from './PostActions'
import { ReviewHistory } from './ReviewHistory'
import type { ReviewFocus } from '../../../../shared/types'

export function PrDetail() {
  const { selectedPr, prDetail, prDetailLoading, activeReview, startReview, stopReview } = usePrReviewStore()
  const [focusAreas, setFocusAreas] = useState<ReviewFocus[]>(['general'])

  if (!selectedPr) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Select a PR to review
      </div>
    )
  }

  if (prDetailLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={16} className="animate-spin text-stone-500" />
      </div>
    )
  }

  const pr = prDetail ?? selectedPr
  const isRunning = activeReview?.status === 'running'
  const isDone = activeReview?.status === 'done'

  return (
    <div className="flex h-full flex-col">
      {/* PR Header */}
      <div className="border-b border-stone-800 p-4">
        <div className="flex items-start gap-3">
          <GitPullRequest size={18} className="mt-0.5 flex-shrink-0 text-green-500" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium text-stone-100">{pr.title}</h2>
            <div className="mt-1 flex items-center gap-3 text-xs text-stone-500">
              <span className="flex items-center gap-1">
                <User size={11} /> {pr.author}
              </span>
              <span className="flex items-center gap-1">
                <GitBranch size={11} /> {pr.headBranch} &rarr; {pr.baseBranch}
              </span>
              <span className="text-green-600">+{pr.additions}</span>
              <span className="text-red-600">-{pr.deletions}</span>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-stone-300"
                onClick={(e) => {
                  e.preventDefault()
                  window.open(pr.url, '_blank')
                }}
              >
                <ExternalLink size={11} /> GitHub
              </a>
            </div>
          </div>
        </div>

        {prDetail?.body && (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-stone-900/50 p-3 text-xs leading-relaxed text-stone-400">
            {prDetail.body}
          </div>
        )}

        {prDetail?.files && prDetail.files.length > 0 && (
          <div className="mt-3">
            <details className="group">
              <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-300">
                <FileText size={11} className="mr-1 inline" />
                {prDetail.files.length} files changed
              </summary>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-stone-900/50 p-2">
                {prDetail.files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 py-0.5 text-xs text-stone-400">
                    <span className="flex-1 truncate font-mono">{f.path}</span>
                    <span className="text-green-600">+{f.additions}</span>
                    <span className="text-red-600">-{f.deletions}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Review area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          <ReviewHistory />

          {!isRunning && (
            <div className="space-y-4">
              <ReviewFocusSelector selected={focusAreas} onChange={setFocusAreas} />
              <button
                onClick={() => {
                  if (!selectedPr || !selectedPr.repo) return
                  startReview(selectedPr.repo, selectedPr, focusAreas)
                }}
                disabled={focusAreas.length === 0}
                className="flex items-center gap-2 rounded-lg bg-stone-200 px-4 py-2 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-100 disabled:opacity-30"
              >
                <Play size={14} />
                {isDone ? 'Re-run Review' : 'Start Review'}
              </button>
            </div>
          )}

          {isRunning && activeReview && (
            <ReviewProgress
              reviewId={activeReview.id}
              onStop={() => stopReview(activeReview.id)}
            />
          )}

          {isDone && selectedPr && (
            <FindingsList
              repoFullName={selectedPr.repo.fullName}
              prNumber={selectedPr.number}
            />
          )}
        </div>
      </div>

      {isDone && selectedPr && (
        <PostActions
          repoFullName={selectedPr.repo.fullName}
          prNumber={selectedPr.number}
        />
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/pr-review/PrDetail.tsx
git commit -m "feat(pr-review): add PrDetail component with review controls"
```

---

## Task 22: PrReviewView Page

**Files:**
- Create: `src/renderer/src/pages/PrReviewView.tsx`

**Step 1: Create the page**

```tsx
import { useEffect } from 'react'
import { usePrReviewStore } from '../store/pr-review-store'
import { PrList } from '../components/pr-review/PrList'
import { PrDetail } from '../components/pr-review/PrDetail'
import { GhSetupGuide } from '../components/pr-review/GhSetupGuide'

export function PrReviewView() {
  const { ghStatus, checkGhStatus } = usePrReviewStore()

  useEffect(() => {
    checkGhStatus()
  }, [])

  const isReady = ghStatus?.available && ghStatus?.authenticated

  return (
    <div className="flex h-full">
      {isReady ? (
        <>
          <div className="w-[280px] flex-shrink-0">
            <PrList />
          </div>
          <div className="min-w-0 flex-1">
            <PrDetail />
          </div>
        </>
      ) : (
        <GhSetupGuide />
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/pages/PrReviewView.tsx
git commit -m "feat(pr-review): add PrReviewView page"
```

---

## Task 23: Settings Integrations Tab

**Files:**
- Modify: `src/renderer/src/components/SettingsOverlay.tsx`

**Step 1: Add Integrations tab**

Add to the `TABS` array (line 19-22):

```ts
const TABS = [
  { id: 'general', label: 'General' },
  { id: 'usage', label: 'Usage' },
  { id: 'integrations', label: 'Integrations' },
] as const
```

Add new state variables inside the component (after `const [activeTab, setActiveTab]`):

```ts
const [ghStatus, setGhStatus] = useState<GhCliStatus | null>(null)
const [ghPath, setGhPath] = useState('')
const [ghChecking, setGhChecking] = useState(false)

async function recheckGh() {
  setGhChecking(true)
  const status = await window.api.checkGhStatus()
  setGhStatus(status)
  setGhChecking(false)
}

async function updateGhPath() {
  if (!ghPath) return
  setGhChecking(true)
  const status = await window.api.setGhPath(ghPath)
  setGhStatus(status)
  setGhChecking(false)
}

useEffect(() => {
  if (settingsOpen && activeTab === 'integrations') recheckGh()
}, [settingsOpen, activeTab])
```

Add the `GhCliStatus` import at the top:

```ts
import type { AppSettings, GhCliStatus } from '../../../shared/types'
```

Add tab content after `{activeTab === 'usage' && <UsageDashboard />}`:

```tsx
{activeTab === 'integrations' && (
  <div className="mt-8 space-y-8">
    <section>
      <label className="block text-sm font-medium text-stone-300">GitHub CLI (gh)</label>
      <p className="mt-0.5 text-xs text-stone-500">Required for PR Review feature</p>

      <div className="mt-3 rounded-lg border border-stone-800 bg-stone-900/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${
            ghStatus?.available && ghStatus?.authenticated ? 'bg-green-500' :
            ghStatus?.available ? 'bg-amber-500' : 'bg-red-500'
          }`} />
          <span className="text-stone-300">
            {ghStatus?.available && ghStatus?.authenticated
              ? `Connected as ${ghStatus.username}`
              : ghStatus?.available
                ? 'Found but not authenticated'
                : ghStatus ? 'Not detected' : 'Checking...'}
          </span>
        </div>

        {ghStatus?.binaryPath && (
          <div className="text-xs text-stone-500">
            Path: <code className="text-stone-400">{ghStatus.binaryPath}</code>
          </div>
        )}

        {ghStatus?.error && (
          <div className="text-xs text-red-400">{ghStatus.error}</div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={ghPath}
            onChange={(e) => setGhPath(e.target.value)}
            placeholder="Custom path (e.g. /usr/local/bin/gh)"
            className="flex-1 rounded bg-stone-950 px-3 py-1.5 text-xs text-stone-300 placeholder-stone-600 outline-none ring-1 ring-stone-800 focus:ring-stone-600"
          />
          <button
            onClick={updateGhPath}
            disabled={!ghPath}
            className="rounded bg-stone-800 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-700 disabled:opacity-30"
          >
            Set
          </button>
        </div>

        <button
          onClick={recheckGh}
          disabled={ghChecking}
          className="rounded bg-stone-800 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-700 disabled:opacity-50"
        >
          {ghChecking ? 'Checking...' : 'Re-check'}
        </button>
      </div>
    </section>
  </div>
)}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/SettingsOverlay.tsx
git commit -m "feat(pr-review): add Integrations tab to Settings with gh CLI status"
```

---

## Task 24: Typecheck & Smoke Test

**Step 1: Run typecheck**

```bash
bun run typecheck
```

Fix any type errors. Common issues to watch for:
- Missing imports in modified files
- `as const` needed on new IPC channel entries
- Preload type declaration mismatches with actual implementations

**Step 2: Run dev mode**

```bash
bun run dev
```

Verify:
- PR Review icon appears in NavRail between History and Projects
- Clicking it switches to PrReviewView
- If `gh` is not installed/authenticated, GhSetupGuide appears
- If `gh` is ready, repos load and PRs appear
- Settings > Integrations tab shows gh CLI status
- Selecting a PR loads its detail
- Tab bar stays visible while in PR Review view

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(pr-review): resolve typecheck errors and polish"
```

---

## Task 25: End-to-End Manual Test

**Step 1: Test full review flow**

1. Open app, click PR Review icon
2. Verify repos discovered from registered projects
3. Select a PR > verify metadata, files, body load
4. Select focus areas > click "Start Review"
5. Verify spinner appears, user can switch to chat tabs
6. Verify findings appear when review completes
7. Check individual findings > click Post > verify on GitHub
8. Click "Post All as Review" > verify batch review on GitHub

**Step 2: Test edge cases**

1. No projects added > verify "No GitHub projects found" message
2. Non-GitHub project in project list > verify silently excluded
3. Stop running review > verify graceful stop
4. Re-run review on same PR > verify old review in history
5. Close app, reopen > verify reviews persist
6. Settings > Integrations > set custom gh path > verify it works

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix(pr-review): address issues from end-to-end testing"
```
