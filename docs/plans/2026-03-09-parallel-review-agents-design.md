# Parallel Specialist Review Agents — Design

## Goal

Replace the single-prompt PR review with parallel specialist agents — one per focus area — running concurrently with dedicated prompts. Expose agent prompts as editable settings.

## Architecture

Each review focus area (general, security, bugs, performance, style) maps to a specialist agent with a dedicated system prompt. When a user starts a review with multiple focus areas, the main process spawns one Claude session per focus area in parallel. Each session gets the same PR diff but a different specialist prompt. When all complete, findings are deduplicated by file+line (keeping higher severity) and merged into a single findings list.

Specialist prompts are stored in the `settings` table as user-editable text. A new "Review Agents" tab in Settings shows each agent with its prompt in a resizable text area.

## Data Flow

```
User clicks "Start Review" with [security, bugs, performance]
    ↓
PrReviewManager.runReview()
    ↓
Fetch PR diff once (shared across agents)
    ↓
Spawn 3 parallel sessions:
  ├─ Session 1: security prompt + diff → findings[]
  ├─ Session 2: bugs prompt + diff    → findings[]
  └─ Session 3: performance prompt + diff → findings[]
    ↓
All complete → merge & deduplicate findings
    ↓
Persist to DB, notify renderer
```

### Streaming UX

The renderer receives `GH_REVIEW_UPDATE` events from each agent as they stream. The progress UI shows all agents with individual status (e.g., "Security: 3 findings... | Bugs: analyzing... | Performance: 5 findings..."). When each agent completes, its findings appear immediately. Final merge and deduplication happen once all agents are done.

### Deduplication

Group findings by `file + line`. When multiple findings share the same file+line, keep the one with highest severity. Append other agents' context to the description (e.g., "Also flagged by: security agent").

## Settings & Storage

Default prompts are hardcoded as fallbacks. The settings table stores user overrides only — if a user hasn't customized an agent, the default is used.

**Settings keys:** `reviewAgent.general`, `reviewAgent.security`, `reviewAgent.bugs`, `reviewAgent.performance`, `reviewAgent.style`

Each value is a string (the specialist prompt text). A standard wrapper is injected at runtime that adds PR context, diff, and output format instructions — users only edit the specialist guidance portion.

**Default prompt example (security):**

```
You are a security-focused code reviewer. Look for:
- Injection vulnerabilities (SQL, command, XSS)
- Authentication and authorization flaws
- Secrets or credentials in code
- Insecure cryptographic practices
- Input validation gaps
- OWASP Top 10 issues
Be thorough but avoid false positives. Only flag issues you're confident about.
```

**Settings UI:** New "Review Agents" tab in SettingsOverlay. Each agent shown as a card with:
- Agent name + icon (non-editable)
- Text area with the specialist prompt (editable, resizable)
- "Reset to default" button per agent

## Error Handling

- **One agent fails:** Other agents' findings still used. Failed agent shows error in progress UI but doesn't block review completion.
- **All agents fail:** Review status set to `error`.
- **Abort/stop:** Clicking "Stop" aborts all running agent sessions.

## Files to Modify

- `src/main/pr-review-manager.ts` — Refactor `runReview()` to spawn parallel sessions, add merge/dedup logic, add default prompts
- `src/main/session-manager.ts` — No changes expected (already supports multiple concurrent sessions)
- `src/main/ipc-handlers.ts` — No new IPC channels needed (settings already generic key-value)
- `src/shared/types.ts` — Add `ReviewAgentConfig` type, extend `AppSettings`
- `src/renderer/src/components/SettingsOverlay.tsx` — Add "Review Agents" tab
- `src/renderer/src/components/pr-review/ReviewProgress.tsx` — Show per-agent progress
- `src/renderer/src/store/pr-review-store.ts` — Handle per-agent streaming updates
