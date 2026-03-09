# PR Review Feature Design

**Date:** 2026-03-09

## Overview

A dedicated PR review tool built into Pylon that lets users browse GitHub PRs across their registered projects, launch Claude-powered reviews with configurable focus areas, view structured findings, and post them back to GitHub as review comments.

## Decisions

- **Approach:** Hybrid nav rail route — PR Review gets its own nav rail icon that switches the main content area to a two-panel layout. Tab bar stays visible.
- **Repo scope:** PRs are discovered from all projects already registered in Pylon (parsed from git remote URLs). No manual repo entry.
- **Review engine:** Background Pylon session with auto-approve permissions. Claude receives the full diff + structured prompt and outputs findings as parseable JSON.
- **Posting identity:** Posts as the authenticated `gh` user. No bot prefix or tagging.
- **Posting granularity:** Both individual finding posts and batch GitHub review submission.
- **gh CLI missing:** Nav rail icon always visible. Shows inline setup guide when `gh` is not available.
- **Persistence:** Reviews and findings persisted to SQLite so users can return to them across app restarts.

## 1. `gh` CLI Detection & Settings

On app startup, the main process detects `gh` availability and auth status.

### Types

```ts
type GhCliStatus = {
  available: boolean
  authenticated: boolean
  binaryPath: string | null
  username: string | null
  error: string | null
}
```

### IPC Channels

- `gh:check-status` — runs detection, returns `GhCliStatus`
- `gh:set-path` — stores custom binary path, re-checks

### Settings Integration

New "Integrations" tab in Settings overlay:
- `gh` CLI status indicator (detected / not found / not authenticated)
- Text field to override binary path (defaults to auto-detected)
- "Re-check" button

## 2. PR Data Fetching

All `gh` CLI calls happen in the main process. Renderer requests data via IPC.

### Operations

1. **List PRs** — `gh pr list --repo owner/repo --json ... --limit 30`
2. **Get PR detail** — `gh pr view <number> --repo owner/repo --json ...`
3. **Get PR diff** — `gh pr diff <number> --repo owner/repo`
4. **Post comment** — `gh pr comment <number> --repo owner/repo --body "..."`
5. **Post review** — `gh api repos/{owner}/{repo}/pulls/{number}/reviews`

### Repo Discovery

For each project in the projects list, run `git -C <path> remote get-url origin` and parse `owner/repo`. Non-GitHub repos are silently excluded.

### Types

```ts
type GhRepo = {
  owner: string
  repo: string
  fullName: string
  projectPath: string
}

type GhPullRequest = {
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

type GhPrDetail = GhPullRequest & {
  body: string
  files: Array<{ path: string; additions: number; deletions: number }>
  diff: string
}

type ReviewFinding = {
  id: string
  file: string
  line: number | null
  severity: 'critical' | 'warning' | 'suggestion' | 'nitpick'
  title: string
  description: string
  posted: boolean
}

type ReviewFocus = 'general' | 'security' | 'bugs' | 'performance' | 'style'

type PrReview = {
  id: string
  prNumber: number
  repo: GhRepo
  status: 'pending' | 'running' | 'done' | 'error'
  focus: ReviewFocus[]
  findings: ReviewFinding[]
  sessionId: string | null
  startedAt: number
  completedAt: number | null
}
```

### IPC Channels

- `gh:list-repos` — discovers repos from all projects
- `gh:list-prs` — `{ repo: string; state?: string }` → `GhPullRequest[]`
- `gh:pr-detail` — `{ repo: string; number: number }` → `GhPrDetail`
- `gh:post-comment` — `{ repo: string; number: number; body: string }`
- `gh:post-review` — `{ repo: string; number: number; findings: ReviewFinding[] }`

## 3. Background Review Session

### Flow

1. Fetch full PR diff via `gh pr diff`
2. Create Pylon session via `sessionManager.createSession` with project's `cwd`
3. Send structured prompt with PR metadata, diff, and focus areas
4. Claude outputs findings in a `review-findings` fenced code block as JSON
5. Main process parses findings from the stream and emits via `gh:review-update` IPC events
6. Findings persisted to SQLite as they arrive

### Session Configuration

- Runs with `auto-approve` permission mode (read-only analysis)
- Tracked in `pr-review-manager.ts`, separate from regular sessions
- Multiple reviews can run concurrently

### Prompt Template

Instructs Claude to output findings as:

````
```review-findings
[
  { "file": "src/main.ts", "line": 42, "severity": "warning", "title": "...", "description": "..." }
]
```
````

### Edge Cases

- Very large diffs: truncate to ~50k lines with a warning
- `gh` auth expires mid-session: error state, "Re-authenticate" prompt
- PR closed/merged: stale badge, warn before posting

## 4. Persistence

### SQLite Tables

```sql
CREATE TABLE pr_reviews (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_title TEXT,
  pr_url TEXT,
  focus TEXT,
  status TEXT NOT NULL,
  session_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE pr_review_findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES pr_reviews(id),
  file TEXT,
  line INTEGER,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  posted INTEGER NOT NULL DEFAULT 0,
  posted_at INTEGER,
  FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
);
```

### IPC Channels

- `gh:list-reviews` — returns recent reviews, optionally filtered by repo/PR
- `gh:get-review` — returns a review with its findings
- `gh:delete-review` — removes a review and its findings

## 5. Renderer Layout

### NavRail

New `GitPullRequest` icon between History and Projects. Sets `sidebarView` to `'pr-review'`.

### UI Store

`SidebarView` expands to: `'home' | 'history' | 'pr-review' | 'settings'`

### App.tsx Routing

```
if sidebarView === 'pr-review' → <PrReviewView />
else if activeTab has cwd      → <SessionView />
else                            → <HomePage />
```

### PrReviewView — Two-Panel Layout

```
┌─────────────────────────────────────────────────┐
│ TabBar                                          │
├──────────────┬──────────────────────────────────┤
│  PR List     │   PR Detail / Findings           │
│  (280px)     │   (flex-1)                       │
│              │                                  │
│  - Repo      │   [PR metadata header]           │
│    filter    │   [Review focus selector]        │
│  - Search    │   [Start Review button]          │
│  - PR cards  │                                  │
│              │   ── or after review ──          │
│              │                                  │
│              │   [Review History]               │
│              │   [Findings list]                │
│              │     - severity + file:line       │
│              │     - title + description        │
│              │     - [Post] checkbox            │
│              │                                  │
│              │   [Post Selected] [Post All]     │
└──────────────┴──────────────────────────────────┘
```

### gh Not Available State

Right panel shows `GhSetupGuide`: install instructions, `gh auth login` command, "Re-check" button.

## 6. Posting Findings to GitHub

### Individual Post

Each finding → `gh pr comment` with formatted markdown:

```markdown
### ⚠️ Warning: Potential null dereference

**File:** `src/main.ts:42`

Description of the finding here...

---
*Reviewed by Pylon*
```

### Batch Post as Review

Uses `gh api` to submit a GitHub pull request review:
- Findings with file+line → inline review comments
- Findings without line → included in review body summary
- Event type: `COMMENT` (not approve/request changes)

### Post States

- Unposted: checkbox + "Post" button
- Posted: green checkmark, button disabled
- Error: error tooltip, retry available

## 7. Component & File Structure

```
src/renderer/src/
├── pages/
│   └── PrReviewView.tsx
├── components/pr-review/
│   ├── PrList.tsx
│   ├── PrCard.tsx
│   ├── PrDetail.tsx
│   ├── ReviewFocusSelector.tsx
│   ├── ReviewProgress.tsx
│   ├── FindingsList.tsx
│   ├── FindingCard.tsx
│   ├── PostActions.tsx
│   ├── ReviewHistory.tsx
│   └── GhSetupGuide.tsx
├── store/
│   └── pr-review-store.ts
├── hooks/
│   └── use-pr-review-bridge.ts

src/main/
├── gh-cli.ts
├── pr-review-manager.ts

src/shared/
├── types.ts          (extended)
├── ipc-channels.ts   (extended)

src/preload/
├── index.ts          (extended)
```

## 8. User Flows

### First Time

1. Click PR Review icon → `GhSetupGuide` shown
2. Install `gh`, run `gh auth login`, click Re-check
3. Status green → transitions to PR list

### Normal Review

1. Click PR Review icon → repos discovered, PRs fetched
2. Filter by repo, click a PR → detail panel shows metadata
3. Previous reviews shown in Review History section
4. Select focus areas → click "Start Review"
5. Background session runs, findings stream in
6. User can switch to chat tabs while review runs
7. Findings listed with severity badges and file references
8. Check findings to post → "Post Selected as Review" or "Post All"

### Re-run

1. Return to previously reviewed PR
2. Review History shows past reviews with timestamps
3. Click "Re-run Review" → new review, old preserved for comparison
