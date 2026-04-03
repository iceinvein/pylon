# PR Review Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the PR review tool with semantic deduplication of findings, a flat "All Findings" panel, and warm color palette alignment.

**Architecture:** Three independent workstreams. Task 1-2 handle backend dedupe (data model + LLM merge logic). Task 3-4 handle color alignment (CSS vars + component updates). Task 5-8 handle the All Findings panel (store + new component + wiring).

**Tech Stack:** Electron, React 19, Zustand, Tailwind CSS 4, SQLite (better-sqlite3), Anthropic Messages API (direct fetch)

---

## Task 1: Data Model — Add `mergedFrom` to ReviewFinding

**Files:**
- Modify: `src/shared/types.ts:344-353`
- Modify: `src/main/db.ts` (migrations array, ~line 129)
- Modify: `src/main/pr-review-manager.ts:1251-1259` (getReview finding mapping)
- Modify: `src/main/pr-review-manager.ts:1273-1283` (saveFindings insert)

- [ ] **Step 1: Update ReviewFinding type**

In `src/shared/types.ts`, add the `mergedFrom` field to `ReviewFinding`:

```typescript
export type ReviewFinding = {
  id: string
  file: string
  line: number | null
  severity: 'critical' | 'warning' | 'suggestion' | 'nitpick'
  title: string
  description: string
  domain: ReviewFocus | null
  posted: boolean
  mergedFrom?: { domain: string; title: string }[]
}
```

- [ ] **Step 2: Add DB migration**

In `src/main/db.ts`, add a new migration after the last entry (version 13) in the `MIGRATIONS` array:

```typescript
{
  version: 14,
  description: 'Add merged_from to pr_review_findings',
  sql: 'ALTER TABLE pr_review_findings ADD COLUMN merged_from TEXT',
},
```

Also add detection logic in `detectAppliedMigrations` — after the existing `pr_review_findings` column check block (~line 167-174), add:

```typescript
if (findingCols.has('merged_from')) applied.add(14)
```

- [ ] **Step 3: Update saveFindings to persist mergedFrom**

In `src/main/pr-review-manager.ts`, update the `saveFindings` method to include `merged_from`:

```typescript
saveFindings(reviewId: string, findings: ReviewFinding[]): void {
  const db = getDb()
  db.prepare('DELETE FROM pr_review_findings WHERE review_id = ?').run(reviewId)
  const insert = db.prepare(
    'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description, domain, merged_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const f of findings) {
    insert.run(
      f.id,
      reviewId,
      f.file,
      f.line,
      f.severity,
      f.title,
      f.description,
      f.domain,
      f.mergedFrom ? JSON.stringify(f.mergedFrom) : null,
    )
  }
}
```

- [ ] **Step 4: Update getReview to read mergedFrom**

In `src/main/pr-review-manager.ts`, update the finding mapping in `getReview` (~line 1251-1259):

```typescript
review.findings = findings.map((f) => ({
  id: f.id as string,
  file: f.file as string,
  line: f.line as number | null,
  severity: PrReviewManager.normalizeSeverity(f.severity),
  title: f.title as string,
  description: f.description as string,
  domain: (f.domain as ReviewFocus) ?? null,
  posted: Boolean(f.posted),
  mergedFrom: f.merged_from ? JSON.parse(f.merged_from as string) : undefined,
}))
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/db.ts src/main/pr-review-manager.ts
git commit -m "feat(pr-review): add mergedFrom field to ReviewFinding type and DB schema"
```

---

## Task 2: Hybrid Semantic Dedupe

**Files:**
- Modify: `src/main/pr-review-manager.ts:894-928` (replace deduplicateFindings)

- [ ] **Step 1: Replace deduplicateFindings with hybrid approach**

In `src/main/pr-review-manager.ts`, replace the entire `deduplicateFindings` method (lines 894-928) with:

```typescript
private async deduplicateFindings(findings: ReviewFinding[]): Promise<ReviewFinding[]> {
  const SEVERITY_RANK: Record<string, number> = {
    critical: 0,
    warning: 1,
    suggestion: 2,
    nitpick: 3,
  }

  // Phase 1: Group by file:line (domain-agnostic)
  const groups = new Map<string, ReviewFinding[]>()
  for (const f of findings) {
    const key = `${f.file}:${f.line ?? 'null'}`
    const group = groups.get(key)
    if (group) group.push(f)
    else groups.set(key, [f])
  }

  const result: ReviewFinding[] = []

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }

    // Phase 2: LLM merge for groups with 2+ findings
    try {
      const merged = await this.llmMergeGroup(group, SEVERITY_RANK)
      result.push(...merged)
    } catch (err) {
      logger.warn('LLM dedupe failed, falling back to severity-based merge:', err)
      // Fallback: keep highest severity finding, merge others into it
      result.push(...this.severityMergeGroup(group, SEVERITY_RANK))
    }
  }

  return result
}

private async llmMergeGroup(
  group: ReviewFinding[],
  severityRank: Record<string, number>,
): Promise<ReviewFinding[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    logger.warn('No ANTHROPIC_API_KEY for dedupe, using severity merge fallback')
    return this.severityMergeGroup(group, severityRank)
  }

  const input = group.map((f, i) => ({
    index: i,
    domain: f.domain ?? 'unknown',
    severity: f.severity,
    title: f.title,
    description: f.description.slice(0, 200),
  }))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `You are deduplicating code review findings on the same file and line.
Given these findings, group the ones that describe the same underlying issue.
Return ONLY valid JSON: {"groups":[[0,2],[1]]}
where each inner array contains the indices of findings that should be merged.
Keep findings that are genuinely different issues separate.

Findings:
${JSON.stringify(input)}`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) throw new Error(`API error: ${response.status}`)

    const data = (await response.json()) as { content: { type: string; text: string }[] }
    const text = data.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const parsed = JSON.parse(text) as { groups: number[][] }
    if (!Array.isArray(parsed.groups)) throw new Error('Invalid response format')

    return this.applyMergeGroups(group, parsed.groups, severityRank)
  } finally {
    clearTimeout(timeout)
  }
}

private applyMergeGroups(
  group: ReviewFinding[],
  mergeGroups: number[][],
  severityRank: Record<string, number>,
): ReviewFinding[] {
  const result: ReviewFinding[] = []
  const used = new Set<number>()

  for (const indices of mergeGroups) {
    if (indices.length === 0) continue
    const valid = indices.filter((i) => i >= 0 && i < group.length && !used.has(i))
    if (valid.length === 0) continue

    for (const i of valid) used.add(i)

    if (valid.length === 1) {
      result.push(group[valid[0]])
      continue
    }

    // Sort by severity — keep highest as primary
    valid.sort((a, b) => (severityRank[group[a].severity] ?? 99) - (severityRank[group[b].severity] ?? 99))
    const primary = group[valid[0]]
    const others = valid.slice(1).map((i) => group[i])

    const mergedFrom = others
      .filter((o) => o.domain !== primary.domain)
      .map((o) => ({ domain: o.domain ?? 'unknown', title: o.title }))

    result.push({
      ...primary,
      description: primary.description + (mergedFrom.length > 0
        ? `\n\n_Also flagged by: ${mergedFrom.map((m) => m.domain).join(', ')}_`
        : ''),
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
    })
  }

  // Any findings not in merge groups pass through
  for (let i = 0; i < group.length; i++) {
    if (!used.has(i)) result.push(group[i])
  }

  return result
}

private severityMergeGroup(
  group: ReviewFinding[],
  severityRank: Record<string, number>,
): ReviewFinding[] {
  // Fallback: merge all into highest severity
  const sorted = [...group].sort(
    (a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99),
  )
  const primary = sorted[0]
  const others = sorted.slice(1)
  const mergedFrom = others
    .filter((o) => o.domain !== primary.domain)
    .map((o) => ({ domain: o.domain ?? 'unknown', title: o.title }))

  return [
    {
      ...primary,
      description: primary.description + (mergedFrom.length > 0
        ? `\n\n_Also flagged by: ${mergedFrom.map((m) => m.domain).join(', ')}_`
        : ''),
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
    },
  ]
}
```

- [ ] **Step 2: Update callsite to await the now-async method**

In `src/main/pr-review-manager.ts`, in `runParallelReview` (~line 544), change:

```typescript
const deduped = this.deduplicateFindings(allFindings)
```

to:

```typescript
const deduped = await this.deduplicateFindings(allFindings)
```

- [ ] **Step 3: Also update the inline persist block to include mergedFrom**

In `runParallelReview` (~line 548-562), the inline insert already lists columns. Update it to include `merged_from`:

```typescript
const insertFinding = db.prepare(
  'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description, domain, merged_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
for (const f of deduped) {
  insertFinding.run(
    f.id,
    reviewId,
    f.file,
    f.line,
    f.severity,
    f.title,
    f.description,
    f.domain,
    f.mergedFrom ? JSON.stringify(f.mergedFrom) : null,
  )
}
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/pr-review-manager.ts
git commit -m "feat(pr-review): hybrid semantic deduplication with LLM merge"
```

---

## Task 3: Color Alignment — CSS Variables

**Files:**
- Modify: `src/renderer/src/styles/globals.css` (add `--color-success-muted`)

- [ ] **Step 1: Add --color-success-muted to theme**

In `src/renderer/src/styles/globals.css`, inside the `@theme` block, after `--color-special-muted` (~line 36), add:

```css
--color-success-muted: #68b27e20;
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/globals.css
git commit -m "feat(pr-review): add --color-success-muted CSS variable"
```

---

## Task 4: Color Alignment — Component Updates

**Files:**
- Modify: `src/renderer/src/components/pr-review/FindingCard.tsx`
- Modify: `src/renderer/src/components/pr-review/DiffFindingAnnotation.tsx`
- Modify: `src/renderer/src/components/pr-review/FindingsList.tsx`
- Modify: `src/renderer/src/components/pr-review/DiffFileTree.tsx`

- [ ] **Step 1: Update FindingCard.tsx**

Replace the `SEVERITY_STYLES` object's posted-state colors and badge references:

```typescript
const SEVERITY_STYLES: Record<
  string,
  {
    icon: typeof AlertCircle
    border: string
    text: string
    label: string
    bg: string
    postedBorder: string
  }
> = {
  critical: {
    icon: AlertCircle,
    border: 'border-[var(--color-error)]/40',
    text: 'text-[var(--color-error)]',
    label: 'Critical',
    bg: 'bg-[var(--color-error)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-[var(--color-accent)]/40',
    text: 'text-[var(--color-warning)]',
    label: 'Warning',
    bg: 'bg-[var(--color-accent-hover)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  suggestion: {
    icon: Lightbulb,
    border: 'border-[var(--color-info)]/40',
    text: 'text-[var(--color-info)]',
    label: 'Suggestion',
    bg: 'bg-[var(--color-info)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  nitpick: {
    icon: Info,
    border: 'border-[var(--color-base-border)]/40',
    text: 'text-[var(--color-base-text-muted)]',
    label: 'Nitpick',
    bg: 'bg-[var(--color-base-text-muted)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
}
```

In the component JSX, replace all `emerald-500` references:
- `<CheckCircle2 size={14} className="text-emerald-500" />` → `className="text-[var(--color-success)]"`
- `finding.posted ? 'bg-emerald-500/5'` → `finding.posted ? 'bg-[var(--color-success)]/5'`
- `finding.posted ? 'text-emerald-500'` (appears twice) → `finding.posted ? 'text-[var(--color-success)]'`

- [ ] **Step 2: Update DiffFindingAnnotation.tsx**

Replace the `SEVERITY_CONFIG` object border colors:

```typescript
const SEVERITY_CONFIG: Record<
  string,
  {
    icon: typeof AlertCircle
    border: string
    text: string
    bg: string
    label: string
    postedBorder: string
  }
> = {
  critical: {
    icon: AlertCircle,
    border: 'border-l-[var(--color-error)]',
    text: 'text-[var(--color-error)]',
    bg: 'bg-[var(--color-error)]/5',
    label: 'Critical',
    postedBorder: 'border-l-[var(--color-success)]',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-l-[var(--color-warning)]',
    text: 'text-[var(--color-warning)]',
    bg: 'bg-[var(--color-accent-hover)]/5',
    label: 'Warning',
    postedBorder: 'border-l-[var(--color-success)]',
  },
  suggestion: {
    icon: Lightbulb,
    border: 'border-l-[var(--color-info)]',
    text: 'text-[var(--color-info)]',
    bg: 'bg-[var(--color-info)]/5',
    label: 'Suggestion',
    postedBorder: 'border-l-[var(--color-success)]',
  },
  nitpick: {
    icon: Info,
    border: 'border-l-[var(--color-base-text-muted)]',
    text: 'text-[var(--color-base-text-muted)]',
    bg: 'bg-[var(--color-base-text-muted)]/5',
    label: 'Nitpick',
    postedBorder: 'border-l-[var(--color-success)]',
  },
}
```

In the JSX, replace:
- `'bg-emerald-500/5'` → `'bg-[var(--color-success)]/5'`
- `'text-emerald-500'` (appears 3 times) → `'text-[var(--color-success)]'`

- [ ] **Step 3: Update FindingsList.tsx**

Replace the posted count color:
- `text-emerald-600` → `text-[var(--color-success)]`

- [ ] **Step 4: Update DiffFileTree.tsx**

Replace the `SEVERITY_COLORS` object badge text colors:

```typescript
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-[var(--color-error)] text-base-text',
  warning: 'bg-[var(--color-accent-hover)]/80 text-base-text',
  suggestion: 'bg-[var(--color-info)]/80 text-base-text',
  nitpick: 'bg-[var(--color-base-text-faint)] text-base-text',
}
```

Also replace the general findings badge:
- `bg-base-text-faint px-1.5 py-0.5 font-medium text-[9px] text-white` → `bg-base-text-faint px-1.5 py-0.5 font-medium text-[9px] text-base-text`

And the directory count badge:
- `bg-base-text-faint/60 px-1.5 py-0.5 font-medium text-[9px] text-white` → `bg-base-text-faint/60 px-1.5 py-0.5 font-medium text-[9px] text-base-text`

- [ ] **Step 5: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: Both PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/pr-review/FindingCard.tsx src/renderer/src/components/pr-review/DiffFindingAnnotation.tsx src/renderer/src/components/pr-review/FindingsList.tsx src/renderer/src/components/pr-review/DiffFileTree.tsx
git commit -m "fix(pr-review): align colors to warm palette CSS variables"
```

---

## Task 5: Store — Add viewMode, severityFilter, navigateToFinding

**Files:**
- Modify: `src/renderer/src/store/pr-review-store.ts:81-144` (PrReviewStore type)
- Modify: `src/renderer/src/store/pr-review-store.ts:146+` (store implementation)

- [ ] **Step 1: Add new fields to PrReviewStore type**

In `src/renderer/src/store/pr-review-store.ts`, add these fields to the `PrReviewStore` type after `unseenCount: number` (~line 112):

```typescript
findingsViewMode: 'files' | 'all-issues'
severityFilter: Set<string>
navigateToFindingId: string | null
```

And add these actions after the existing action declarations (before the closing `}`):

```typescript
setFindingsViewMode: (mode: 'files' | 'all-issues') => void
toggleSeverityFilter: (severity: string) => void
navigateToFinding: (findingId: string) => void
clearNavigateToFinding: () => void
```

- [ ] **Step 2: Add initial state and implementations**

In the store creation (after `unseenCount: 0,` ~line 169), add:

```typescript
findingsViewMode: 'files',
severityFilter: new Set(['critical', 'warning', 'suggestion', 'nitpick']),
navigateToFindingId: null,
```

Add the action implementations before the closing `}))`:

```typescript
setFindingsViewMode: (mode) => set({ findingsViewMode: mode }),

toggleSeverityFilter: (severity) =>
  set((state) => {
    const next = new Set(state.severityFilter)
    if (next.has(severity)) next.delete(severity)
    else next.add(severity)
    return { severityFilter: next }
  }),

navigateToFinding: (findingId) => {
  const finding = get().activeFindings.find((f) => f.id === findingId)
  if (!finding) return
  set({
    findingsViewMode: 'files',
    navigateToFindingId: findingId,
  })
},

clearNavigateToFinding: () => set({ navigateToFindingId: null }),
```

- [ ] **Step 3: Reset viewMode when review changes**

Find the `handleReviewUpdate` action in the store. At the top of the `if (data.status === 'done')` branch, add:

```typescript
findingsViewMode: 'files',
severityFilter: new Set(['critical', 'warning', 'suggestion', 'nitpick']),
navigateToFindingId: null,
```

to the `set()` call.

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/pr-review-store.ts
git commit -m "feat(pr-review): add viewMode, severityFilter, navigateToFinding to store"
```

---

## Task 6: AllFindingsPanel Component

**Files:**
- Create: `src/renderer/src/components/pr-review/AllFindingsPanel.tsx`

- [ ] **Step 1: Create AllFindingsPanel**

Create `src/renderer/src/components/pr-review/AllFindingsPanel.tsx`:

```tsx
import { CheckCircle2 } from 'lucide-react'
import type { ReviewFinding } from '../../../../shared/types'
import { usePrReviewStore } from '../../store/pr-review-store'
import { FindingCard } from './FindingCard'

type Props = {
  repoFullName: string
  prNumber: number
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  suggestion: 2,
  nitpick: 3,
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  warning: 'Warning',
  suggestion: 'Suggestion',
  nitpick: 'Nitpick',
}

const SEVERITY_CHIP_ACTIVE: Record<string, string> = {
  critical: 'bg-[var(--color-error)] text-base-text',
  warning: 'bg-[var(--color-warning)] text-base-text',
  suggestion: 'bg-[var(--color-info)] text-base-text',
  nitpick: 'bg-[var(--color-base-text-faint)] text-base-text',
}

const ALL_SEVERITIES = ['critical', 'warning', 'suggestion', 'nitpick'] as const

export function AllFindingsPanel({ repoFullName, prNumber }: Props) {
  const {
    activeFindings,
    selectedFindingIds,
    postingFindingIds,
    severityFilter,
    toggleFinding,
    postFinding,
    toggleSeverityFilter,
    navigateToFinding,
  } = usePrReviewStore()

  const filtered = activeFindings
    .filter((f) => severityFilter.has(f.severity))
    .sort((a, b) => {
      if (a.posted !== b.posted) return a.posted ? 1 : -1
      const sevDiff = (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)
      if (sevDiff !== 0) return sevDiff
      return a.file.localeCompare(b.file)
    })

  const counts = new Map<string, number>()
  for (const f of activeFindings) {
    counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter chips */}
      <div className="flex items-center gap-2 border-base-border-subtle border-b px-4 py-2">
        <span className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
          Filter
        </span>
        {ALL_SEVERITIES.map((sev) => {
          const count = counts.get(sev) ?? 0
          if (count === 0) return null
          const active = severityFilter.has(sev)
          return (
            <button
              key={sev}
              type="button"
              onClick={() => toggleSeverityFilter(sev)}
              className={`rounded-full px-2.5 py-0.5 font-medium text-[10px] tabular-nums transition-colors ${
                active
                  ? SEVERITY_CHIP_ACTIVE[sev]
                  : 'border border-base-border text-base-text-muted hover:text-base-text'
              }`}
            >
              {SEVERITY_LABELS[sev]} ({count})
            </button>
          )
        })}
      </div>

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-base-text-faint">
            <CheckCircle2 size={24} strokeWidth={1.5} />
            <p className="text-xs">
              {activeFindings.length === 0 ? 'No findings from this review.' : 'No findings match the current filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                checked={selectedFindingIds.has(f.id)}
                isPosting={postingFindingIds.has(f.id)}
                onToggle={() => toggleFinding(f.id)}
                onPost={() => postFinding(f, repoFullName, prNumber)}
                onNavigate={() => navigateToFinding(f.id)}
                showFilePath
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: May show errors for `onNavigate` and `showFilePath` props not yet on FindingCard — that's expected, we add them in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/pr-review/AllFindingsPanel.tsx
git commit -m "feat(pr-review): create AllFindingsPanel component"
```

---

## Task 7: Update FindingCard — File Path + mergedFrom Badge

**Files:**
- Modify: `src/renderer/src/components/pr-review/FindingCard.tsx`

- [ ] **Step 1: Add new props and render file path + mergedFrom**

Update the `Props` type in `FindingCard.tsx`:

```typescript
type Props = {
  finding: ReviewFinding
  checked: boolean
  isPosting: boolean
  onToggle: () => void
  onPost: () => void
  onNavigate?: () => void
  showFilePath?: boolean
}
```

Update the component signature:

```typescript
export function FindingCard({ finding, checked, isPosting, onToggle, onPost, onNavigate, showFilePath }: Props) {
```

After the file+line display (`finding.file && (...)` block, ~line 125-129), add the mergedFrom annotation and the navigable file path for the all-findings view:

Replace the existing file/line block:

```tsx
{finding.file && (
  <div className="mt-0.5 font-mono text-[11px] text-base-text-muted">
    {finding.file}
    {finding.line ? `:${finding.line}` : ''}
  </div>
)}
```

with:

```tsx
{finding.file && (
  <div className="mt-0.5 font-mono text-[11px] text-base-text-muted">
    {showFilePath && onNavigate ? (
      <button
        type="button"
        onClick={onNavigate}
        className="transition-colors hover:text-base-text"
      >
        {finding.file}
        {finding.line ? `:${finding.line}` : ''}{' '}
        <span className="text-base-text-faint">→</span>
      </button>
    ) : (
      <>
        {finding.file}
        {finding.line ? `:${finding.line}` : ''}
      </>
    )}
  </div>
)}
```

After the description `<p>` tag (~line 133-135), add the mergedFrom display:

```tsx
{finding.mergedFrom && finding.mergedFrom.length > 0 && (
  <p className="mt-1 pl-5 text-[10px] text-base-text-faint italic">
    Also flagged by: {finding.mergedFrom.map((m) => m.domain).join(', ')}
  </p>
)}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/pr-review/FindingCard.tsx
git commit -m "feat(pr-review): add file path navigation and mergedFrom badge to FindingCard"
```

---

## Task 8: Segmented Control in DiffFileTree + Wire into PrDetail

**Files:**
- Modify: `src/renderer/src/components/pr-review/DiffFileTree.tsx`
- Modify: `src/renderer/src/pages/PrReviewView.tsx` (no changes needed)
- Modify: `src/renderer/src/components/pr-review/PrDetail.tsx`

- [ ] **Step 1: Add segmented control to DiffFileTree**

In `DiffFileTree.tsx`, import the store:

```typescript
import { usePrReviewStore } from '../../store/pr-review-store'
```

Replace the Overview button block (the `<button>` with `onClick={() => onSelectFile(null)}`, ~lines 108-124) with a segmented control:

```tsx
{/* Segmented control */}
<div className="flex border-base-border-subtle/50 border-b p-1.5">
  <button
    type="button"
    onClick={() => setFindingsViewMode('files')}
    className={`flex-1 rounded-md px-2 py-1 text-center font-medium text-[10px] transition-colors ${
      findingsViewMode === 'files'
        ? 'bg-base-raised text-base-text'
        : 'text-base-text-muted hover:text-base-text'
    }`}
  >
    Files
  </button>
  <button
    type="button"
    onClick={() => setFindingsViewMode('all-issues')}
    className={`flex-1 rounded-md px-2 py-1 text-center font-medium text-[10px] transition-colors ${
      findingsViewMode === 'all-issues'
        ? 'bg-base-raised text-base-text'
        : 'text-base-text-muted hover:text-base-text'
    }`}
  >
    All Issues
    {findings.length > 0 && (
      <span className="ml-1 tabular-nums">({findings.length})</span>
    )}
  </button>
</div>
```

Extract `findingsViewMode` and `setFindingsViewMode` from the store at the top of the component:

```typescript
const { findingsViewMode, setFindingsViewMode } = usePrReviewStore()
```

Wrap the file tree content (everything after the segmented control) in a conditional:

```tsx
{findingsViewMode === 'files' && (
  <>
    {/* Overview entry */}
    <button
      type="button"
      onClick={() => onSelectFile(null)}
      className={`flex items-center gap-2 border-base-border-subtle/50 border-b px-3 py-2 text-left text-[11px] transition-colors ${
        selectedFile === null
          ? 'bg-base-raised/60 text-base-text'
          : 'text-base-text-secondary hover:bg-base-raised/30'
      }`}
    >
      <Eye size={12} className="shrink-0 text-base-text-muted" />
      <span className="flex-1">Overview</span>
      {generalFindings.length > 0 && (
        <span className="rounded-full bg-base-text-faint px-1.5 py-0.5 font-medium text-[9px] text-base-text tabular-nums">
          {generalFindings.length}
        </span>
      )}
    </button>

    {/* File tree */}
    <div className="flex-1 overflow-y-auto py-1">
      <DirContent
        node={tree}
        findings={findings}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        depth={0}
      />
    </div>
  </>
)}
```

- [ ] **Step 2: Wire AllFindingsPanel into PrDetail**

In `PrDetail.tsx`, add the import:

```typescript
import { AllFindingsPanel } from './AllFindingsPanel'
```

Extract `findingsViewMode` from the store (add it to the destructured values at the top ~line 95-108):

```typescript
const {
  selectedPr,
  prDetail,
  prDetailLoading,
  prDetailError,
  activeReview,
  activeFindings,
  selectedFindingIds,
  findingsViewMode,
  startReview,
  stopReview,
  toggleFinding,
  postFinding,
  selectPr,
} = usePrReviewStore()
```

In the post-review two-pane layout section (~line 303-340), replace the right pane `<DiffPane>` with a conditional:

Replace:

```tsx
<div className="min-w-0 flex-1">
  <DiffPane
    selectedFile={selectedFile}
    files={prDetail.files}
    fileDiffs={fileDiffs}
    findings={activeFindings}
    selectedFindingIds={selectedFindingIds}
    onToggleFinding={toggleFinding}
    onPostFinding={handlePostFinding}
  />
</div>
```

with:

```tsx
<div className="min-w-0 flex-1">
  {findingsViewMode === 'all-issues' ? (
    <AllFindingsPanel
      repoFullName={selectedPr.repo.fullName}
      prNumber={selectedPr.number}
    />
  ) : (
    <DiffPane
      selectedFile={selectedFile}
      files={prDetail.files}
      fileDiffs={fileDiffs}
      findings={activeFindings}
      selectedFindingIds={selectedFindingIds}
      onToggleFinding={toggleFinding}
      onPostFinding={handlePostFinding}
    />
  )}
</div>
```

- [ ] **Step 3: Handle navigateToFinding in PrDetail**

In `PrDetail.tsx`, add `navigateToFindingId` and `clearNavigateToFinding` to the destructured store values:

```typescript
const {
  // ... existing destructured values ...
  findingsViewMode,
  navigateToFindingId,
  clearNavigateToFinding,
  // ... rest ...
} = usePrReviewStore()
```

Add this effect after the existing `useEffect` for resetting file selection (~line 116):

```typescript
useEffect(() => {
  if (!navigateToFindingId) return
  const finding = activeFindings.find((f) => f.id === navigateToFindingId)
  if (finding?.file) {
    setSelectedFile(finding.file)
  }
}, [navigateToFindingId, activeFindings])
```

- [ ] **Step 4: Pass navigateToFindingId to DiffPane and auto-scroll**

In `PrDetail.tsx`, pass the prop to `DiffPane`:

```tsx
<DiffPane
  selectedFile={selectedFile}
  files={prDetail.files}
  fileDiffs={fileDiffs}
  findings={activeFindings}
  selectedFindingIds={selectedFindingIds}
  onToggleFinding={toggleFinding}
  onPostFinding={handlePostFinding}
  navigateToFindingId={navigateToFindingId}
  onNavigated={clearNavigateToFinding}
/>
```

In `src/renderer/src/components/pr-review/DiffPane.tsx`, add the new props to the `Props` type:

```typescript
type Props = {
  selectedFile: string | null
  files: FileEntry[]
  fileDiffs: Map<string, string>
  findings: ReviewFinding[]
  selectedFindingIds: Set<string>
  onToggleFinding: (id: string) => void
  onPostFinding: (finding: ReviewFinding) => void
  navigateToFindingId?: string | null
  onNavigated?: () => void
}
```

Update the destructuring:

```typescript
export function DiffPane({
  selectedFile,
  files,
  fileDiffs,
  findings,
  selectedFindingIds,
  onToggleFinding,
  onPostFinding,
  navigateToFindingId,
  onNavigated,
}: Props) {
```

Add a `useEffect` after the existing tick-positions effect (~line 103) to handle auto-scroll:

```typescript
useEffect(() => {
  if (!navigateToFindingId || !scrollRef.current) return
  // Wait for DOM to render the finding annotation
  const timer = setTimeout(() => {
    const el = scrollRef.current?.querySelector(
      `[data-finding-id="${navigateToFindingId}"]`,
    ) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('diff-finding-highlight')
      setTimeout(() => el.classList.remove('diff-finding-highlight'), 1200)
    }
    onNavigated?.()
  }, 150)
  return () => clearTimeout(timer)
}, [navigateToFindingId, onNavigated])
```

- [ ] **Step 5: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 6: Run tests**

Run: `bun test`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/pr-review/DiffFileTree.tsx src/renderer/src/components/pr-review/PrDetail.tsx src/renderer/src/components/pr-review/DiffPane.tsx
git commit -m "feat(pr-review): add segmented control and wire AllFindingsPanel into review layout"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full verification suite**

Run: `bun run lint && bun run typecheck && bun test`
Expected: All three pass with no errors

- [ ] **Step 2: Visual check**

Run: `bun run dev`
Open a PR review, run a review, and verify:
1. Findings are deduplicated (fewer duplicates than before)
2. Segmented control appears in the file tree panel (Files | All Issues)
3. "All Issues" shows flat list with filter chips
4. Clicking a file path in the flat list navigates to the file diff
5. All colors use warm palette — no cold emerald/red/amber/blue
6. Posted findings show warm green (`#68b27e`), not stock emerald

- [ ] **Step 3: Final commit if any lint fixes needed**

```bash
bun run lint:fix
git add -A
git commit -m "chore: lint fixes"
```
