# PR Review Improvements — Design Spec

## Overview

Three improvements to the PR review tool:
1. **Semantic deduplication** — LLM-assisted merging of duplicate findings across review agents
2. **All Findings panel** — Flat list view of all findings with filtering, alongside the existing file tree
3. **Color alignment** — Replace cold Tailwind literal colors with warm palette CSS variables

## 1. Hybrid Semantic Dedupe

### Problem

Multiple review agents (security, bugs, performance, etc.) often flag the same underlying issue from different angles. The current `deduplicateFindings` keys on `domain:file:line`, preserving findings from different agents on the same location. This produces noticeable duplication in review results.

### Design

**Two-phase deduplication** in `pr-review-manager.ts`, replacing the existing `deduplicateFindings` method:

**Phase 1 — Location grouping:**
- Group all findings by `file:line` (drop domain from key).
- Findings with unique locations pass through unchanged.

**Phase 2 — LLM merge (only for groups with 2+ findings):**
- For each group with multiple findings, send the group to a Claude Haiku call via the Anthropic SDK (direct API call, not the Agent SDK).
- Prompt format:

  ```
  You are deduplicating code review findings on the same file and line.
  Given these findings, group the ones that describe the same underlying issue.
  Return JSON: { "groups": [[0, 2], [1]], "reasoning": "..." }
  where each inner array contains the indices of findings that should be merged.
  Keep findings that are genuinely different issues separate.
  ```

- Input: array of `{ index, domain, severity, title, description }` for the conflicting group.
- Output: parsed merge groups used to combine findings.

**Merge logic:**
- For each merge group, keep the highest-severity finding as the primary.
- Append `"Also flagged by: [domain]"` to the description.
- Store merged origins in a `mergedFrom` field on the finding.

**Fallback:**
- If the Haiku call fails or times out (3s), fall back to location-only dedupe (current behavior minus domain in key).

### Data Model

Add to `ReviewFinding` type:

```typescript
mergedFrom?: { domain: string; title: string }[]
```

This is optional — only present on findings that absorbed duplicates. Stored as JSON in the `pr_review_findings` table (new `merged_from` TEXT column).

### Cost

~50-200 tokens per conflict group, typically 1-3 groups per review. Negligible compared to the review agents themselves.

## 2. All Findings Panel

### Problem

The only way to browse findings post-review is through the file tree + inline diff annotations. There's no way to see all findings at once without clicking through each file.

### Design

**Segmented control** replaces the Overview entry at the top of the `DiffFileTree` component:

```
[ Files | All Issues ]
```

- **Files** (default): Current file tree behavior, unchanged.
- **All Issues**: The right pane (DiffPane area) switches to a flat list of all findings.

**Flat list contents:**
- **Filter chips** at the top: Critical, Warning, Suggestion, Nitpick. Toggle visibility per severity. Active = filled background, inactive = outline border.
- **Finding cards** rendered using the existing `FindingCard` component, sorted by severity (critical first), then by file path.
- **File path link** on each card (e.g. `src/auth.ts:42 →`) — clicking navigates back to Files mode with that file selected and the finding scrolled into view + highlighted.
- **"Also flagged by"** annotation on merged findings, showing the domains that were deduplicated.
- Same checkbox + Post button per finding.

**State:**
- New `viewMode: 'files' | 'all-issues'` field in `pr-review-store.ts`.
- New `severityFilter: Set<string>` field (defaults to all severities visible).
- `navigateToFinding(findingId)` action that switches to files mode, selects the file, and signals the DiffPane to scroll to the finding.

### Components

- **Modified:** `DiffFileTree.tsx` — add segmented control, hide tree when in "All Issues" mode.
- **Modified:** `PrDetail.tsx` — conditionally render `AllFindingsPanel` instead of `DiffPane` when `viewMode === 'all-issues'`.
- **New:** `AllFindingsPanel.tsx` — flat list with filter chips, reuses `FindingCard`.
- **Modified:** `FindingCard.tsx` — add clickable file path that triggers `navigateToFinding`.

## 3. Color Alignment

### Problem

The PR review area mixes warm palette CSS variables with stock Tailwind color literals (emerald, red, amber, blue), breaking the warm dark theme.

### Replacement Map

| Before | After |
|---|---|
| `emerald-500` | `[var(--color-success)]` |
| `emerald-600` | `[var(--color-success)]` |
| `emerald-900/30` | `[var(--color-success)]/30` |
| `emerald-500/5` (bg) | `[var(--color-success)]/5` |
| `border-l-red-500` | `border-l-[var(--color-error)]` |
| `border-l-amber-500` | `border-l-[var(--color-warning)]` |
| `border-l-blue-500` | `border-l-[var(--color-info)]` |
| `border-l-emerald-500` | `border-l-[var(--color-success)]` |
| `border-l-[var(--color-base-text-muted)]` | (unchanged, already correct) |
| `text-white` (in severity badges) | `text-base-text` |

### New CSS Variable

```css
--color-success-muted: #68b27e20;
```

Added to `globals.css` `@theme` block, following the `--color-accent-muted` pattern.

### Files Touched

- `FindingCard.tsx` — posted state colors, badge text
- `DiffFindingAnnotation.tsx` — border-left colors, posted state colors
- `FindingsList.tsx` — posted count color, stat badge colors
- `DiffFileTree.tsx` — severity badge colors
- `DiffPane.tsx` — severity tick colors (already uses CSS vars, verify only)
- `globals.css` — add `--color-success-muted`

## Out of Scope

- Changes to agent prompts or review focus areas
- Changes to the diff viewer itself (unified/split)
- Review history or PR list UI changes
- PostActions component changes
