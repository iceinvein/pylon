import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type {
  FindingPost,
  FindingPostKind,
  GhRepo,
  PrContextUpdate,
  PrReview,
  PrReviewSeries,
  ReviewFinding,
  ReviewFindingRisk,
  ReviewFindingSeverity,
  ReviewFindingSuggestion,
  ReviewFocus,
  ReviewMode,
  ReviewModePreference,
  ReviewRunSummary,
  ReviewStatus,
  ReviewThread,
  ReviewTimelineEntry,
  StartPrReviewOptions,
} from '../shared/types'
import { getDb } from './db'
import { type ChunkResult, chunkDiff, getTokenBudget } from './diff-chunker'
import { getPrDetail } from './gh-cli'
import { HeuristicContextBackend } from './pr-context/heuristic-context-backend'
import { CodeIntelligenceMcpClient } from './pr-context/mcp-client'
import { McpContextBackend } from './pr-context/mcp-context-backend'
import type { PrContextBackend } from './pr-context/pr-context-backend'
import { PrContextBuilder } from './pr-context/pr-context-builder'
import { deduplicateFindings } from './pr-review-dedupe'
import { resolveReviewScope } from './review-scope'
import { sessionManager } from './session-manager'

const execFileAsync = promisify(execFile)

const logger = log.child('pr-review')
const STREAM_THROTTLE_MS = 300

const DEFAULT_AGENT_PROMPTS: Record<ReviewFocus, string> = {
  security: [
    'You are a senior application security engineer reviewing this pull request.',
    '',
    '## What to look for',
    '',
    'Inspect every changed line for these vulnerability classes:',
    '',
    '**Injection attacks**',
    '- SQL injection: string concatenation in queries, missing parameterized statements',
    '- Command injection: user input flowing into shell commands, execFile(), spawn()',
    '- Template injection: unsanitized data in template engines',
    '- XSS: unescaped output in HTML/JSX, unsafe innerHTML usage, React dangerouslySetInnerHTML',
    '- Path traversal: user-controlled file paths without canonicalization or allowlist',
    '- SSRF: user-controlled URLs passed to fetch/http requests without validation',
    '- Deserialization: untrusted data passed to JSON.parse in security-sensitive contexts',
    '',
    '**Authentication & authorization**',
    '- Missing auth checks on new endpoints or IPC handlers',
    '- Privilege escalation: actions that bypass permission boundaries',
    "- Broken access control: one user accessing another's resources",
    '- Session management issues: predictable tokens, missing expiry, no invalidation',
    '- Tenant isolation violations in multi-user contexts',
    '',
    '**Secrets & credentials**',
    '- Hardcoded API keys, tokens, passwords, or connection strings',
    '- Secrets logged to console or persisted in plaintext',
    '- Credentials in URLs or query parameters',
    '- Missing encryption for sensitive data at rest or in transit',
    '',
    '**Cryptography**',
    '- Weak algorithms (MD5, SHA1 for security purposes, DES)',
    '- Missing or predictable IVs/nonces',
    '- Custom crypto implementations instead of vetted libraries',
    '- Insufficient key lengths',
    '',
    '**Data safety**',
    '- Sensitive data in error messages or logs (PII, tokens, passwords)',
    '- Missing input validation at system boundaries (user input, external APIs, IPC)',
    '- Missing output encoding when crossing trust boundaries',
    '- Overly permissive CORS, CSP, or security headers',
    '- Insecure defaults that require opt-in for safety',
    '',
    '## How to reason',
    '',
    'For each potential finding:',
    '1. Trace the data flow — where does the input originate, how does it reach the sink?',
    '2. Identify the trust boundary — is this crossing from untrusted to trusted context?',
    '3. Assess exploitability — can an attacker realistically trigger this?',
    "4. Evaluate impact — what's the blast radius if exploited?",
    '',
    '**Risk guide:**',
    '- blocker: Realistic path to remote code execution, auth bypass, data breach, or privilege escalation',
    '- high: Exploitable vulnerability or secrets exposure that should be fixed before merge',
    '- medium: Defense-in-depth concern or validation gap with limited or uncertain exploitability',
    '- low: Minor hardening opportunity with low impact',
    '',
    'Report only credible concerns grounded in code shown. If a concern depends on context you can\'t see, note it as "needs verification" in the description. Do not invent vulnerabilities without evidence.',
  ].join('\n'),

  bugs: [
    'You are a senior software engineer specialized in finding bugs through code review.',
    '',
    '## What to look for',
    '',
    '**Logic errors**',
    '- Off-by-one mistakes in loops, slicing, indexing, and boundary checks',
    '- Inverted or missing conditions (wrong boolean logic, missing null checks)',
    '- Incorrect operator precedence or type coercion surprises',
    "- State machine violations: impossible states that aren't prevented",
    '',
    '**Concurrency & timing**',
    '- Race conditions in async code: check-then-act without atomicity',
    '- Shared mutable state accessed from multiple async paths',
    '- Missing await on promises (fire-and-forget that should be awaited)',
    '- Event listener leaks: subscriptions without cleanup',
    '',
    '**Null safety & type issues**',
    '- Null/undefined dereferences hidden by optional chaining that should fail loudly',
    '- Type assertions (as) that mask real type mismatches',
    '- Array access without bounds checking on dynamic indices',
    '- Destructuring that assumes shape of external data',
    '',
    '**Error handling**',
    '- Catch blocks that swallow errors silently (empty catch, catch that only logs)',
    '- Error recovery that leaves state inconsistent (partial updates before throw)',
    '- Missing error propagation: async errors that vanish',
    '- Try-catch scope too broad: catching exceptions meant for callers',
    '',
    '**Resource management**',
    '- File handles, connections, or subscriptions not cleaned up in finally/dispose',
    '- Missing cleanup on component unmount or session end',
    '- Unbounded growth: arrays/maps that grow without eviction',
    '',
    '**Data integrity**',
    '- Stale closures capturing outdated state',
    '- Mutation of objects that should be immutable (shared references)',
    '- Incorrect merge/spread that drops or overwrites fields',
    '- JSON.parse without error handling on untrusted input',
    '',
    '## How to reason',
    '',
    'For each potential bug:',
    "1. What's the precondition that triggers it?",
    '2. Is this reachable in normal usage or only edge cases?',
    "3. What's the consequence — crash, data corruption, silent wrong behavior?",
    "4. Is there an existing guard I'm not seeing?",
    '',
    '**Risk guide:**',
    '- blocker: Data loss, data corruption, broken auth/session behavior, or consistently crashing a major workflow',
    '- high: Reachable incorrect behavior, race, resource leak, or crash in a meaningful workflow',
    '- medium: Edge-case bug or missing guard with limited blast radius',
    '- low: Very small correctness cleanup with low user impact',
    '',
    'Prioritize bugs that cause silent wrong behavior over those that crash (crashes are at least visible). Flag "needs verification" when you can\'t determine reachability from the diff alone.',
  ].join('\n'),

  performance: [
    'You are a senior performance engineer reviewing this pull request.',
    '',
    '## What to look for',
    '',
    '**Algorithmic complexity**',
    '- O(n squared) or worse patterns hidden in nested loops over data that could grow',
    '- Repeated linear scans where a Map/Set lookup would be O(1)',
    '- Sorting or filtering the same dataset multiple times unnecessarily',
    '- Missing early exits in search/filter operations',
    '',
    '**Rendering & reactivity (frontend)**',
    '- Components re-rendering on every parent render due to missing memoization',
    '- New object/array/function references created every render (inline objects in JSX props, arrow functions in render)',
    '- useMemo/useCallback with incorrect or missing dependency arrays',
    '- Large lists rendered without virtualization',
    '- Layout thrashing: reads and writes to DOM interleaved in loops',
    '',
    '**Data fetching & I/O**',
    '- N+1 query patterns: fetching related data in a loop instead of batch',
    '- Missing pagination or unbounded result sets',
    '- Redundant API calls: same data fetched multiple times without caching',
    '- Synchronous I/O on hot paths that could be async',
    '- Missing request deduplication for concurrent identical requests',
    '',
    '**Memory**',
    '- Unbounded caches or maps that grow without eviction strategy',
    '- Large data structures held in memory when only a subset is needed',
    '- Closures capturing large scopes unnecessarily',
    '- Event listeners or subscriptions never removed',
    '',
    '**Bundling & loading**',
    '- Large dependencies imported for small utility functions',
    '- Missing code splitting for routes or heavy components',
    '- Synchronous imports that could be lazy-loaded',
    '',
    '## How to reason',
    '',
    'For each potential issue:',
    "1. What's the data size at scale? (10 items is fine, 10,000 is not)",
    '2. How often does this code path execute? (once on init vs. every keystroke)',
    "3. What's the measurable impact? (milliseconds vs. seconds)",
    '4. Is the optimization worth the complexity cost?',
    '',
    '**Risk guide:**',
    '- blocker: Change can make a major workflow unusable or cause unbounded production resource exhaustion',
    '- high: Realistic scale causes visible latency, memory growth, redundant network/database load, or render jank',
    '- medium: Likely worthwhile performance improvement on a warm path',
    '- low: Tiny cleanup only when it removes clear waste without added complexity',
    '',
    "Only flag issues that would have noticeable impact at realistic scale. Don't suggest micro-optimizations on cold paths.",
  ].join('\n'),

  'code-smells': [
    'You are a senior engineer reviewing this pull request for code smells and maintainability risks.',
    '',
    '## What to look for',
    '',
    '**Duplication & parallel change**',
    '- Copy-pasted logic that will drift across files, handlers, components, or tests',
    '- Parallel conditionals or switch branches that should share a table, helper, or data model',
    '- Same validation, parsing, mapping, or formatting rules reimplemented in multiple places',
    '- Tests duplicating implementation details instead of describing behavior',
    '',
    '**Brittle complexity**',
    '- Long functions with multiple responsibilities or several levels of branching',
    '- Boolean flag parameters or mode strings that create hidden behavior matrices',
    '- Deeply nested control flow where guard clauses or extracted steps would make failure paths clear',
    '- Large expressions that encode domain logic without named concepts',
    '- Accidental complexity added for a narrow case where simpler local code would be easier to maintain',
    '',
    '**Poor abstractions**',
    '- Primitive obsession: repeated raw strings, numbers, or object shapes that should be typed or named',
    '- Stringly typed state, event names, or IDs where an enum/union/constant already exists or is warranted',
    '- Leaky abstractions that force callers to know storage, transport, UI, or framework details',
    '- Abstractions that are too broad, too generic, or have only one real caller',
    '- Data clumps: the same group of parameters passed through multiple functions',
    '',
    '**Coupling & side effects**',
    '- Hidden mutation of shared data, module-level state, or objects owned by callers',
    '- Temporal coupling: functions that only work if called in a specific undocumented order',
    '- Action at a distance: changes in one branch unexpectedly affecting unrelated behavior',
    '- Feature envy: code reaching into another module/component instead of asking through a clear interface',
    '- Shotgun surgery: a small future change would require edits in many unrelated places',
    '',
    '**Testability & local reasoning**',
    '- Code that is hard to unit test because I/O, time, randomness, or global state is embedded in logic',
    '- Missing seams around expensive or external dependencies when the change adds non-trivial branching',
    '- Invariants that are implied by comments or call order instead of represented in types or checks',
    '- Error paths that are hard to exercise or reason about because responsibilities are tangled',
    '',
    '## How to reason',
    '',
    'For each potential smell:',
    '1. Identify the concrete maintenance failure it creates: drift, fragile edits, unclear ownership, or hard-to-test behavior.',
    '2. Confirm the smell is introduced or materially worsened by this PR, not merely pre-existing nearby code.',
    '3. Suggest the smallest refactor that fits the surrounding codebase patterns.',
    '4. Weigh the cost: do not ask for a new abstraction unless it reduces real duplication, coupling, or reasoning burden now.',
    '',
    '**Risk guide:**',
    '- blocker: Smell creates a high-risk maintenance trap likely to cause defects across modules soon',
    '- high: Meaningful maintainability issue that should be addressed before merge',
    '- medium: Local refactor that would materially improve clarity or reduce future drift',
    '- low: Minor cleanup only when the fix is trivial and directly tied to changed code',
    '',
    'Do not flag formatting, naming, or stylistic preference unless it is evidence of a deeper maintainability problem. Avoid duplicating bug, security, or performance findings unless the primary issue is the maintainability smell behind them.',
  ].join('\n'),

  style: [
    'You are a senior developer focused on code quality and maintainability.',
    '',
    '## What to look for',
    '',
    '**Naming & clarity**',
    "- Variable/function names that don't communicate intent",
    '- Misleading names that suggest different behavior than implemented',
    '- Inconsistent naming conventions within the same file or module',
    '- Abbreviations that sacrifice readability for brevity',
    "- Boolean names that don't read as questions (e.g., data vs isLoaded)",
    '',
    '**Code organization**',
    '- Small readability problems in changed functions that obscure intent',
    '- Related logic scattered across distant parts of a file',
    '- Dead code: unused variables, unreachable branches, commented-out code',
    '- Unused imports or dependencies',
    '- Obvious local copy-paste that affects readability but does not create a broader maintenance hazard',
    '',
    '**Complexity**',
    '- Local nesting that makes the changed code harder to scan',
    '- Complex expressions that should be broken into named intermediate variables',
    '- Long parameter lists that hurt readability in this local call site',
    '- Magic numbers or strings without named constants',
    '',
    '**Consistency**',
    '- Mixing patterns within the same codebase (e.g., callbacks and promises, different state management approaches)',
    '- Inconsistent error handling patterns across similar functions',
    '- Style deviations from surrounding code in the same file',
    '',
    '**TypeScript specifics**',
    '- Overuse of any where a proper type exists',
    '- Type assertions (as) that could be replaced with type guards',
    '- Missing discriminated unions where a type field could narrow types',
    '- Overly complex generic types that hurt readability',
    '',
    '**Risk guide:**',
    '- blocker: Do not use for style findings',
    '- high: Readability issue likely to cause reviewer or maintainer misunderstanding',
    '- medium: Clear local improvement to naming, expression structure, or consistency',
    '- low: Trivial cleanup with no behavioral or design impact',
    '',
    'Boundary with other agents: do not report broader duplication, coupling, abstraction, or module design problems here. Leave those to Code Smells or Architecture.',
    '',
    'Only flag issues in changed code (not pre-existing style issues in surrounding context). Focus on readability impact, not personal preference.',
  ].join('\n'),

  architecture: [
    'You are a senior software architect reviewing this pull request for design quality.',
    '',
    '## What to look for',
    '',
    '**Separation of concerns**',
    '- Business logic mixed with UI rendering or I/O',
    '- Data access scattered instead of centralized behind a clear interface',
    '- Cross-cutting concerns (logging, auth, validation) tangled into business logic',
    '- Single file or function taking on too many responsibilities',
    '',
    '**Coupling & cohesion**',
    "- Tight coupling: module A reaching deep into module B's internals",
    '- Inappropriate dependencies: lower-level module depending on higher-level one',
    '- Circular dependencies between modules',
    '- Shared mutable state that couples otherwise independent components',
    '- Leaky abstractions: implementation details exposed in public interfaces',
    '',
    '**API & contract design**',
    '- Inconsistent API contracts across similar endpoints/handlers',
    '- Missing input validation at module boundaries',
    '- Overly permissive interfaces that accept more than needed',
    '- Return types that force callers to handle implementation details',
    '- Breaking changes to existing contracts without migration path',
    '',
    '**Extensibility & change readiness**',
    '- Hardcoded values that should be configurable',
    '- Switch/if-else chains that will grow with each new variant (should be polymorphic or data-driven)',
    '- Missing abstraction layers that would isolate from future changes',
    "- Over-engineering: abstractions for things that don't vary",
    '',
    '**Data flow & state management**',
    '- Unclear ownership of state (who is the source of truth?)',
    '- Derived state stored separately instead of computed',
    '- Prop drilling through many layers instead of proper state management',
    '- Inconsistent data flow direction (sometimes push, sometimes pull)',
    '',
    '## How to reason',
    '',
    'For each potential issue:',
    '1. What change would be hard because of this design decision?',
    '2. Is this coupling necessary or incidental?',
    '3. Would a new team member understand where to make changes?',
    '4. Is this over-engineered for the current requirements, or appropriately future-proofed?',
    '',
    '**Risk guide:**',
    '- blocker: Change introduces a serious boundary violation or contract break likely to cascade across subsystems',
    '- high: Design issue that will make near-term feature work, integration, or migration materially harder',
    '- medium: Local design adjustment that clarifies ownership, contracts, or state flow',
    '- low: Avoid for architecture findings unless the design cleanup is nearly free',
    '',
    'Boundary with Code Smells: focus on module boundaries, public contracts, ownership, and system-level data flow. Leave local implementation smells such as duplicate branches, long functions, and primitive obsession to Code Smells.',
    '',
    'Focus on design decisions introduced or materially worsened by this PR that affect the long-term health of the codebase. Don\'t flag things that are "technically impure" but work well in practice.',
  ].join('\n'),

  ux: [
    'You are a senior product engineer reviewing this pull request for user experience quality.',
    '',
    '## What to look for',
    '',
    '**Error handling & feedback**',
    '- API errors shown as raw technical messages instead of user-friendly text',
    '- Missing error states: what does the user see when something fails?',
    "- Form validation errors that don't explain what's wrong or how to fix it",
    '- Destructive actions without confirmation dialogs',
    '- Error recovery: can the user retry, or are they stuck?',
    '',
    '**Loading & transitions**',
    '- Missing loading indicators for async operations (API calls, file I/O)',
    '- Content layout shift: elements jumping around as data loads',
    '- Optimistic UI without rollback on failure',
    '- Disabled buttons or inputs without visual indication of why',
    '- No skeleton/placeholder for content that takes time to load',
    '',
    '**Empty & edge states**',
    '- Empty state when a list has zero items (blank screen vs. helpful message)',
    '- First-time user experience: what happens before any data exists?',
    '- Long text overflowing containers or breaking layouts',
    '- Very long lists without pagination or virtualization',
    '- Special characters in user input breaking display or functionality',
    '',
    '**Accessibility**',
    '- Interactive elements without accessible labels (buttons with only icons)',
    '- Missing keyboard navigation for custom widgets',
    '- Focus management: does focus move logically after modal open/close, route change?',
    "- Color as the only indicator of state (colorblind users can't distinguish)",
    '- Missing ARIA attributes for dynamic content changes',
    '',
    '**Consistency & predictability**',
    '- Same action behaving differently in different contexts',
    '- Inconsistent terminology (different labels for the same concept)',
    '- UI state not preserved when navigating away and back',
    "- Missing feedback for successful actions (user doesn't know it worked)",
    '',
    '## How to reason',
    '',
    'For each potential issue:',
    "1. Put yourself in the user's shoes — what were they trying to do?",
    "2. What's the worst case input/state? Test mentally with empty, huge, special-char data.",
    '3. Is the behavior predictable? Would a new user understand what happened?',
    '4. How frequently would real users hit this issue?',
    '',
    '**Risk guide:**',
    '- blocker: Blocks a core workflow, causes irreversible user action without confirmation, or creates severe accessibility exclusion',
    '- high: Common user path becomes confusing, inaccessible, or hard to recover from',
    '- medium: Meaningful polish or resilience improvement for an edge state or secondary flow',
    '- low: Minor wording or affordance cleanup only when it is directly tied to changed UI',
    '',
    "Focus on issues that would confuse or frustrate users. Don't flag minor aesthetic preferences.",
  ].join('\n'),
}

type AgentSession = {
  focus: ReviewFocus
  sessionId: string
  status: 'running' | 'done' | 'error'
  findings: ReviewFinding[]
  streamedText: string
  error?: string
  currentChunk?: number
  totalChunks?: number
}

type ActiveReviewSession = {
  reviewId: string
  repoFullName: string
  prNumber: number
  agents: Map<ReviewFocus, AgentSession>
  contextAbort?: AbortController
}

type PreviousReviewBaseline = {
  reviewId: string
  headSha: string | null
  baseSha: string | null
}

const EMPTY_REVIEW_SUMMARY: ReviewRunSummary = {
  newCount: 0,
  persistingCount: 0,
  resolvedCount: 0,
  staleCount: 0,
}

type ThreadAssignment = {
  finding: ReviewFinding
  fingerprint: string | null
  matchedBy: string | null
}

type StoredReviewThread = {
  id: string
  fingerprint: string
  firstSeenReviewId: string
  lastSeenReviewId: string
  status: ReviewThread['status']
  lastFinding: ReviewFinding | null
}

type McpStdioOverride = { command: string; args?: string[]; env?: Record<string, string> }

function readDbMcpOverride(): McpStdioOverride | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'prReview.mcp.codeIntelligence'")
    .get() as { value: string } | undefined
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as Partial<McpStdioOverride>
    return parsed.command ? { command: parsed.command, args: parsed.args, env: parsed.env } : null
  } catch {
    return null
  }
}

function readMcpFromFile(path: string): McpStdioOverride | null {
  if (!existsSync(path)) return null
  try {
    const json = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers?: Record<string, Partial<McpStdioOverride>>
    }
    const entry = json.mcpServers?.['code-intelligence']
    return entry?.command ? { command: entry.command, args: entry.args, env: entry.env } : null
  } catch {
    return null
  }
}

class PrReviewManager {
  private activeReviews = new Map<string, ActiveReviewSession>()
  private prWorktrees = new Map<string, { path: string; repoPath: string }>()
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  private send(channel: string, data: unknown): void {
    this.window?.webContents.send(channel, data)
  }

  private updateReviewStatus(
    reviewId: string,
    status: ReviewStatus,
    completedAt?: number,
    costUsd?: number,
  ): void {
    const db = getDb()
    if (completedAt) {
      db.prepare(
        'UPDATE pr_reviews SET status = ?, completed_at = ?, cost_usd = ? WHERE id = ?',
      ).run(status, completedAt, costUsd ?? 0, reviewId)
    } else {
      db.prepare('UPDATE pr_reviews SET status = ? WHERE id = ?').run(status, reviewId)
    }
  }

  private updateReviewSummary(reviewId: string, summary: ReviewRunSummary): void {
    const db = getDb()
    db.prepare('UPDATE pr_reviews SET summary_json = ? WHERE id = ?').run(
      JSON.stringify(summary),
      reviewId,
    )
  }

  private updateReviewScopeMetadata(
    reviewId: string,
    scope: {
      reviewMode: ReviewMode
      comparedFromSha: string | null
      comparedToSha: string | null
      incrementalValid: boolean
      scopeLabel: string
    },
  ): void {
    const db = getDb()
    db.prepare(
      'UPDATE pr_reviews SET review_mode = ?, compared_from_sha = ?, compared_to_sha = ?, incremental_valid = ?, review_scope = ? WHERE id = ?',
    ).run(
      scope.reviewMode,
      scope.comparedFromSha,
      scope.comparedToSha,
      scope.incrementalValid ? 1 : 0,
      scope.scopeLabel,
      reviewId,
    )
  }

  private persistReviewRunFiles(reviewId: string, files: Array<{ path: string }>): void {
    const db = getDb()
    db.prepare('DELETE FROM pr_review_run_files WHERE review_id = ?').run(reviewId)
    const insert = db.prepare(
      'INSERT INTO pr_review_run_files (id, review_id, file_path, status, patch_hash, old_path, touched) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const file of files) {
      insert.run(randomUUID(), reviewId, file.path, 'modified', null, null, 1)
    }
  }

  private ensureReviewSeries(repoFullName: string, prNumber: number): string {
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM pr_review_series WHERE repo_full_name = ? AND pr_number = ?')
      .get(repoFullName, prNumber) as { id: string } | undefined
    if (existing?.id) {
      db.prepare('UPDATE pr_review_series SET updated_at = ? WHERE id = ?').run(
        Date.now(),
        existing.id,
      )
      return existing.id
    }

    const id = randomUUID()
    const now = Date.now()
    db.prepare(
      'INSERT INTO pr_review_series (id, repo_full_name, pr_number, latest_review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, repoFullName, prNumber, null, now, now)
    return id
  }

  private getLatestSuccessfulReviewBaseline(
    seriesId: string,
    baselineReviewId?: string,
  ): PreviousReviewBaseline | null {
    const db = getDb()
    const row = baselineReviewId
      ? (db
          .prepare(
            'SELECT id, head_sha, base_sha FROM pr_reviews WHERE id = ? AND series_id = ? AND status = ?',
          )
          .get(baselineReviewId, seriesId, 'done') as Record<string, unknown> | undefined)
      : (db
          .prepare(
            'SELECT id, head_sha, base_sha FROM pr_reviews WHERE series_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
          )
          .get(seriesId, 'done') as Record<string, unknown> | undefined)

    if (!row) return null
    return {
      reviewId: row.id as string,
      headSha: (row.head_sha as string) ?? null,
      baseSha: (row.base_sha as string) ?? null,
    }
  }

  private static normalizeThreadText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[`"'()[\]{}:;,.!?/_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private buildFindingFingerprint(finding: ReviewFinding): string | null {
    const file = (finding.file || '').trim().toLowerCase()
    const title = PrReviewManager.normalizeThreadText(finding.title || '')
    if (!file || !title) return null
    const domain = finding.domain ?? 'unknown'
    const lineBucket =
      typeof finding.line === 'number' && Number.isFinite(finding.line)
        ? Math.max(0, Math.floor(finding.line / 5))
        : 'null'
    return `${domain}|${file}|${lineBucket}|${title}`
  }

  private loadSeriesThreads(seriesId: string): Map<string, StoredReviewThread> {
    const db = getDb()
    const rows = db
      .prepare(
        'SELECT id, fingerprint, first_seen_review_id, last_seen_review_id, status FROM pr_review_threads WHERE series_id = ?',
      )
      .all(seriesId) as Array<Record<string, unknown>>

    const findingStmt = db.prepare(
      'SELECT * FROM pr_review_findings WHERE thread_id = ? AND review_id = ? ORDER BY rowid DESC LIMIT 1',
    )

    const result = new Map<string, StoredReviewThread>()
    for (const row of rows) {
      const lastSeenReviewId = row.last_seen_review_id as string
      const findingRow = findingStmt.get(row.id, lastSeenReviewId) as
        | Record<string, unknown>
        | undefined
      result.set(row.fingerprint as string, {
        id: row.id as string,
        fingerprint: row.fingerprint as string,
        firstSeenReviewId: row.first_seen_review_id as string,
        lastSeenReviewId,
        status: row.status as ReviewThread['status'],
        lastFinding: findingRow ? this.rowToFinding(findingRow) : null,
      })
    }
    return result
  }

  private assignFindingThreads(reviewId: string, findings: ReviewFinding[]): ThreadAssignment[] {
    const db = getDb()
    const reviewRow = db.prepare('SELECT series_id FROM pr_reviews WHERE id = ?').get(reviewId) as
      | { series_id: string | null }
      | undefined
    if (!reviewRow?.series_id) {
      return findings.map((finding) => ({ finding, fingerprint: null, matchedBy: null }))
    }

    const now = Date.now()
    const threadsByFingerprint = this.loadSeriesThreads(reviewRow.series_id)

    const insertThread = db.prepare(
      'INSERT INTO pr_review_threads (id, series_id, fingerprint, domain, canonical_title, status, first_seen_review_id, last_seen_review_id, last_file, last_line, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const updateThread = db.prepare(
      'UPDATE pr_review_threads SET status = ?, last_seen_review_id = ?, last_file = ?, last_line = ?, updated_at = ? WHERE id = ?',
    )

    return findings.map((finding) => {
      const fingerprint = this.buildFindingFingerprint(finding)
      if (!fingerprint) {
        return { finding, fingerprint: null, matchedBy: null }
      }

      const existing = threadsByFingerprint.get(fingerprint)
      if (existing) {
        const statusInRun = existing.firstSeenReviewId === reviewId ? 'new' : 'persisting'
        const sourceReviewId = statusInRun === 'persisting' ? existing.lastSeenReviewId : null
        updateThread.run(
          statusInRun,
          reviewId,
          finding.file || null,
          finding.line ?? null,
          now,
          existing.id,
        )
        const nextThread: StoredReviewThread = {
          ...existing,
          lastSeenReviewId: reviewId,
          status: statusInRun,
        }
        threadsByFingerprint.set(fingerprint, nextThread)
        return {
          finding: {
            ...finding,
            threadId: existing.id,
            statusInRun,
            carriedForward: false,
            sourceReviewId,
            posted: existing.lastFinding?.posted ?? false,
          },
          fingerprint,
          matchedBy: 'fingerprint-exact',
        }
      }

      const threadId = randomUUID()
      insertThread.run(
        threadId,
        reviewRow.series_id,
        fingerprint,
        finding.domain,
        finding.title,
        'new',
        reviewId,
        reviewId,
        finding.file || null,
        finding.line ?? null,
        now,
        now,
      )
      threadsByFingerprint.set(fingerprint, {
        id: threadId,
        fingerprint,
        firstSeenReviewId: reviewId,
        lastSeenReviewId: reviewId,
        status: 'new',
        lastFinding: null,
      })
      return {
        finding: {
          ...finding,
          threadId,
          statusInRun: 'new',
          carriedForward: false,
          sourceReviewId: null,
        },
        fingerprint,
        matchedBy: 'fingerprint-new',
      }
    })
  }

  private applyThreadLifecycle(
    reviewId: string,
    reviewMode: ReviewMode,
    touchedFiles: Set<string>,
    explicitAssignments: ThreadAssignment[],
  ): ThreadAssignment[] {
    const db = getDb()
    const reviewRow = db.prepare('SELECT series_id FROM pr_reviews WHERE id = ?').get(reviewId) as
      | { series_id: string | null }
      | undefined
    if (!reviewRow?.series_id) return explicitAssignments

    const insertThread = db.prepare(
      'UPDATE pr_review_threads SET status = ?, last_seen_review_id = ?, updated_at = ? WHERE id = ?',
    )
    const existingThreads = this.loadSeriesThreads(reviewRow.series_id)
    const matchedThreadIds = new Set(
      explicitAssignments
        .map((entry) => entry.finding.threadId)
        .filter((id): id is string => Boolean(id)),
    )
    const now = Date.now()
    const synthetic: ThreadAssignment[] = []

    for (const thread of existingThreads.values()) {
      if (matchedThreadIds.has(thread.id)) continue
      if (!thread.lastFinding) continue

      const touched = thread.lastFinding.file ? touchedFiles.has(thread.lastFinding.file) : false
      const nextStatus =
        reviewMode === 'full' ? 'resolved' : touched ? 'needs_revalidation' : 'persisting'

      insertThread.run(nextStatus, reviewId, now, thread.id)

      synthetic.push({
        finding: {
          ...thread.lastFinding,
          id: randomUUID(),
          threadId: thread.id,
          statusInRun: nextStatus,
          carriedForward: true,
          sourceReviewId: thread.lastSeenReviewId,
          posted: thread.lastFinding.posted,
        },
        fingerprint: thread.fingerprint,
        matchedBy: 'thread-lifecycle',
      })
    }

    return [...explicitAssignments, ...synthetic]
  }

  /** Sum cost across all agent sessions for a review */
  private sumAgentCosts(active: ActiveReviewSession): number {
    const db = getDb()
    let total = 0
    for (const agent of active.agents.values()) {
      const row = db
        .prepare('SELECT total_cost_usd FROM sessions WHERE id = ?')
        .get(agent.sessionId) as { total_cost_usd: number } | undefined
      if (row) total += row.total_cost_usd
    }
    return total
  }

  async startReview(
    repo: GhRepo,
    prNumber: number,
    prTitle: string,
    prUrl: string,
    focusAreas: ReviewFocus[],
    options: StartPrReviewOptions = {},
  ): Promise<PrReview> {
    const reviewId = randomUUID()
    const now = Date.now()
    const requestedMode: ReviewModePreference = options.mode ?? 'auto'
    const detail = await getPrDetail(repo.fullName, prNumber)

    const db = getDb()
    const seriesId = this.ensureReviewSeries(repo.fullName, prNumber)
    const parentReview = this.getLatestSuccessfulReviewBaseline(seriesId, options.baselineReviewId)
    const tentativeMode: ReviewMode =
      requestedMode === 'full'
        ? 'full'
        : parentReview?.headSha && detail.headSha && parentReview.baseSha === detail.baseSha
          ? 'incremental'
          : 'full'

    db.prepare(
      'INSERT INTO pr_reviews (id, series_id, parent_review_id, repo_full_name, pr_number, pr_title, pr_url, focus, review_mode, trigger, base_sha, head_sha, merge_base_sha, compared_from_sha, compared_to_sha, review_scope, summary_json, incremental_valid, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      reviewId,
      seriesId,
      parentReview?.reviewId ?? null,
      repo.fullName,
      prNumber,
      prTitle,
      prUrl,
      JSON.stringify(focusAreas),
      tentativeMode,
      'manual',
      detail.baseSha,
      detail.headSha,
      null,
      tentativeMode === 'incremental' ? (parentReview?.headSha ?? null) : null,
      detail.headSha,
      tentativeMode === 'incremental' ? 'incremental-head-range' : 'full-pr',
      JSON.stringify(EMPTY_REVIEW_SUMMARY),
      tentativeMode === 'incremental' ? 1 : 0,
      'running',
      now,
      now,
    )

    this.activeReviews.set(reviewId, {
      reviewId,
      repoFullName: repo.fullName,
      prNumber,
      agents: new Map(),
    })

    const review: PrReview = {
      id: reviewId,
      seriesId,
      parentReviewId: parentReview?.reviewId ?? null,
      prNumber,
      repo,
      prTitle,
      prUrl,
      status: 'running',
      reviewMode: tentativeMode,
      snapshot: {
        baseSha: detail.baseSha,
        headSha: detail.headSha,
        mergeBaseSha: null,
        comparedFromSha: tentativeMode === 'incremental' ? (parentReview?.headSha ?? null) : null,
        comparedToSha: detail.headSha,
      },
      summary: EMPTY_REVIEW_SUMMARY,
      incrementalValid: tentativeMode === 'incremental',
      focus: focusAreas,
      findings: [],
      sessionId: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      costUsd: 0,
    }

    this.send(IPC.GH_REVIEW_UPDATE, {
      reviewId,
      status: 'running',
      findings: [],
      streamingText: '',
      agentProgress: focusAreas.map((f) => ({ agentId: f, status: 'pending', findingsCount: 0 })),
    })

    this.runParallelReview(
      reviewId,
      repo,
      detail,
      focusAreas,
      requestedMode,
      parentReview,
      options.includeRevalidation !== false,
    ).catch((err) => {
      logger.error('Review failed:', err)
      this.updateReviewStatus(reviewId, 'error', Date.now())
      this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: String(err) })
    })

    return review
  }

  private async runParallelReview(
    reviewId: string,
    repo: GhRepo,
    detail: Awaited<ReturnType<typeof getPrDetail>>,
    focusAreas: ReviewFocus[],
    requestedMode: ReviewModePreference,
    parentReview: PreviousReviewBaseline | null,
    includeRevalidation: boolean,
  ): Promise<void> {
    this.send(IPC.GH_REVIEW_UPDATE, {
      reviewId,
      status: 'running',
      streamingText: 'Preparing review scope...',
      agentProgress: focusAreas.map((f) => ({ agentId: f, status: 'pending', findingsCount: 0 })),
    })

    const active = this.activeReviews.get(reviewId)
    if (!active) return

    let reviewCwd = repo.projectPath
    try {
      reviewCwd = await this.createPrWorktree(
        repo.projectPath,
        detail.number,
        detail.headBranch,
        reviewId,
      )
    } catch (err) {
      logger.warn('Failed to create PR worktree, falling back to project path:', err)
    }

    const scope = await resolveReviewScope({
      repoPath: reviewCwd,
      current: detail,
      previous: parentReview,
      requestedMode,
    })
    this.updateReviewScopeMetadata(reviewId, scope)
    this.persistReviewRunFiles(reviewId, scope.files)

    const scopedDetail = {
      ...detail,
      diff: scope.diff,
      files: scope.files,
    }

    // Use SDK-reported context window if available, otherwise fall back to hardcoded limits
    const cachedContextWindow = sessionManager.getModelContextWindow('claude-sonnet-4-6')
    const tokenBudget = getTokenBudget(undefined, 0, cachedContextWindow)
    logger.info(
      `Token budget: ${tokenBudget} tokens (context window: ${cachedContextWindow ?? 'default'}, diff length: ${scopedDetail.diff.length} chars, ~${Math.ceil(scopedDetail.diff.length / 3.3)} tokens, mode: ${scope.reviewMode})`,
    )
    const { chunks, skippedFiles } = chunkDiff(scopedDetail.diff, { tokenBudget })

    logger.info(
      `Skipped ${skippedFiles.length} files: ${skippedFiles.length > 0 ? skippedFiles.join(', ') : '(none)'}`,
    )
    for (const chunk of chunks) {
      logger.info(
        `Chunk ${chunk.index + 1}/${chunk.total}: ${chunk.files.length} files, ${chunk.diff.length} chars (~${Math.ceil(chunk.diff.length / 3.3)} tokens) — ${chunk.files.join(', ')}`,
      )
    }

    // Edge case: all files were skipped (e.g. only lock files changed)
    if (chunks.length === 0) {
      this.updateReviewSummary(reviewId, EMPTY_REVIEW_SUMMARY)
      this.updateReviewStatus(reviewId, 'done', Date.now())
      const db = getDb()
      db.prepare(
        'UPDATE pr_review_series SET latest_review_id = ?, updated_at = ? WHERE id = ?',
      ).run(
        reviewId,
        Date.now(),
        (
          db.prepare('SELECT series_id FROM pr_reviews WHERE id = ?').get(reviewId) as
            | {
                series_id: string | null
              }
            | undefined
        )?.series_id ?? null,
      )
      this.send(IPC.GH_REVIEW_UPDATE, {
        reviewId,
        status: 'done',
        findings: [],
        streamingText: `All changed files were skipped (lockfiles, generated code, etc.):\n${skippedFiles.map((f) => `- ${f}`).join('\n')}`,
        costUsd: 0,
        reviewMode: scope.reviewMode,
        snapshot: {
          baseSha: detail.baseSha,
          headSha: detail.headSha,
          mergeBaseSha: null,
          comparedFromSha: scope.comparedFromSha,
          comparedToSha: scope.comparedToSha,
        },
        incrementalValid: scope.incrementalValid,
        summary: EMPTY_REVIEW_SUMMARY,
        agentProgress: focusAreas.map((f) => ({
          agentId: f,
          status: 'done' as const,
          findingsCount: 0,
        })),
      })
      this.activeReviews.delete(reviewId)
      return
    }

    const contextAbort = new AbortController()
    active.contextAbort = contextAbort
    const mcpConfig = this.resolveCodeIntelligenceMcpConfig(reviewCwd, repo.projectPath)
    const heuristicBackend = new HeuristicContextBackend()
    const mcpBackend: PrContextBackend = mcpConfig
      ? new McpContextBackend({
          makeClient: () => {
            const client = new CodeIntelligenceMcpClient(mcpConfig)
            return {
              connect: (timeoutMs?: number) => client.connect(timeoutMs ?? 3000),
              callTool: (name, args, timeoutMs) => client.callTool(name, args, timeoutMs ?? 8000),
              close: () => client.close(),
            }
          },
        })
      : heuristicBackend
    const builder = new PrContextBuilder({
      mcp: mcpBackend,
      heuristic: heuristicBackend,
    })

    const contextPromise = (async () => {
      const db = getDb()
      const enabledRow = db
        .prepare("SELECT value FROM settings WHERE key = 'prReview.contextBuilder.enabled'")
        .get() as { value: string } | undefined
      if (enabledRow?.value === 'false') {
        const payload: PrContextUpdate = {
          reviewId,
          phase: 'done',
          mode: 'degraded',
          notes: ['context builder disabled via settings'],
        }
        this.send(IPC.GH_REVIEW_CONTEXT_UPDATE, payload)
        return { sessionCwd: reviewCwd }
      }

      const buildingPayload: PrContextUpdate = {
        reviewId,
        phase: 'building',
      }
      this.send(IPC.GH_REVIEW_CONTEXT_UPDATE, buildingPayload)

      try {
        const result = await builder.build({
          diff: scopedDetail.diff,
          worktreePath: reviewCwd,
          pr: {
            number: detail.number,
            headBranch: detail.headBranch,
            baseBranch: detail.baseBranch,
            title: detail.title,
          },
          totalTimeoutMs: 20_000,
          perCallTimeoutMs: 8_000,
          signal: contextAbort.signal,
        })
        const bundle = result.bundle
        const donePayload: PrContextUpdate = {
          reviewId,
          phase: bundle.mode === 'mcp' ? 'done' : 'fallback',
          mode: bundle.mode,
          notes: bundle.notes,
        }
        this.send(IPC.GH_REVIEW_CONTEXT_UPDATE, donePayload)
        return { sessionCwd: reviewCwd }
      } catch (err) {
        logger.warn('Context builder failed, agents will proceed without bundle:', err)
        const errorPayload: PrContextUpdate = {
          reviewId,
          phase: 'error',
          error: String(err),
        }
        this.send(IPC.GH_REVIEW_CONTEXT_UPDATE, errorPayload)
        return { sessionCwd: reviewCwd }
      }
    })()

    await contextPromise

    const agentPromises = focusAreas.map((focus) =>
      this.runAgentSession(
        reviewId,
        reviewCwd,
        scopedDetail,
        chunks,
        skippedFiles,
        focus,
        active,
        mcpConfig,
      ),
    )

    let results: PromiseSettledResult<ReviewFinding[]>[]
    try {
      results = await Promise.allSettled(agentPromises)
    } finally {
      // Always clean up the worktree when agents finish
      await this.removePrWorktree(reviewId)
    }

    // Merge findings from all agents
    const allFindings: ReviewFinding[] = []
    let allFailed = true

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allFindings.push(...result.value)
        allFailed = false
      }
    }

    if (allFailed && results.length > 0) {
      this.updateReviewStatus(reviewId, 'error', Date.now())
      this.send(IPC.GH_REVIEW_UPDATE, {
        reviewId,
        status: 'error',
        error: 'All review agents failed',
      })
      this.activeReviews.delete(reviewId)
      return
    }

    const deduped = deduplicateFindings(allFindings)
    const explicitAssignments = this.assignFindingThreads(reviewId, deduped)

    const touchedFiles = new Set(scope.files.map((file) => file.path))
    const seriesIdForReview = (
      getDb().prepare('SELECT series_id FROM pr_reviews WHERE id = ?').get(reviewId) as
        | { series_id: string | null }
        | undefined
    )?.series_id

    let revalidationAssignments: ThreadAssignment[] = []
    if (
      includeRevalidation &&
      scope.reviewMode === 'incremental' &&
      seriesIdForReview &&
      touchedFiles.size > 0
    ) {
      try {
        const { runRevalidationPass } = await import('./revalidation-worker')
        const matchedThreadIds = new Set(
          explicitAssignments
            .map((entry) => entry.finding.threadId)
            .filter((id): id is string => Boolean(id)),
        )
        const outcomes = await runRevalidationPass({
          reviewId,
          seriesId: seriesIdForReview,
          repoCwd: reviewCwd,
          touchedFiles,
          runSession: (input) => this.runRevalidationSession(reviewId, input.cwd, input.prompt),
        })
        revalidationAssignments = outcomes
          .filter((outcome) => !matchedThreadIds.has(outcome.threadId))
          .map((outcome) => ({
            finding: outcome.finding,
            fingerprint: null,
            matchedBy: `revalidation-${outcome.verdict}`,
          }))

        const threadStatusUpdate = getDb().prepare(
          'UPDATE pr_review_threads SET status = ?, last_seen_review_id = ?, updated_at = ? WHERE id = ?',
        )
        for (const outcome of outcomes) {
          if (matchedThreadIds.has(outcome.threadId)) continue
          threadStatusUpdate.run(
            outcome.finding.statusInRun,
            reviewId,
            Date.now(),
            outcome.threadId,
          )
        }

        // Auto-resolve any GitHub comments mapped to threads we marked resolved.
        await this.resolveMappedCommentsForOutcomes(repo.fullName, outcomes)
      } catch (err) {
        logger.warn('Revalidation pass failed; continuing without revalidation outputs:', err)
      }
    }

    const threadedFindings = this.applyThreadLifecycle(reviewId, scope.reviewMode, touchedFiles, [
      ...explicitAssignments,
      ...revalidationAssignments,
    ])

    // Persist findings
    const db = getDb()
    const insertFinding = db.prepare(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, impact, likelihood, confidence, action, title, description, suggestion_body, suggestion_start_line, suggestion_end_line, thread_id, status_in_run, fingerprint, matched_by, anchor_json, source_review_id, carried_forward, domain, merged_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const { finding: f, fingerprint, matchedBy } of threadedFindings) {
      insertFinding.run(
        f.id,
        reviewId,
        f.file,
        f.line,
        f.severity,
        f.risk.impact,
        f.risk.likelihood,
        f.risk.confidence,
        f.risk.action,
        f.title,
        f.description,
        f.suggestion?.body ?? null,
        f.suggestion?.startLine ?? null,
        f.suggestion?.endLine ?? null,
        f.threadId,
        f.statusInRun,
        fingerprint,
        matchedBy,
        null,
        f.sourceReviewId,
        f.carriedForward ? 1 : 0,
        f.domain,
        f.mergedFrom ? JSON.stringify(f.mergedFrom) : null,
      )
    }

    // Sum cost from all agent sessions
    const totalCost = this.sumAgentCosts(active)
    const summary: ReviewRunSummary = {
      newCount: threadedFindings.filter((entry) => entry.finding.statusInRun === 'new').length,
      persistingCount: threadedFindings.filter(
        (entry) => entry.finding.statusInRun === 'persisting',
      ).length,
      resolvedCount: threadedFindings.filter((entry) => entry.finding.statusInRun === 'resolved')
        .length,
      staleCount: threadedFindings.filter((entry) => entry.finding.statusInRun === 'stale').length,
    }
    this.updateReviewSummary(reviewId, summary)
    this.updateReviewStatus(reviewId, 'done', Date.now(), totalCost)
    const seriesRow = db.prepare('SELECT series_id FROM pr_reviews WHERE id = ?').get(reviewId) as
      | { series_id: string | null }
      | undefined
    if (seriesRow?.series_id) {
      db.prepare(
        'UPDATE pr_review_series SET latest_review_id = ?, updated_at = ? WHERE id = ?',
      ).run(reviewId, Date.now(), seriesRow.series_id)
    }

    const finalFindings = threadedFindings.map((entry) => entry.finding)
    const postUrls = this.hydratePostUrls(finalFindings)
    const findingsWithPostUrls = finalFindings.map((f) => ({
      ...f,
      postUrl: postUrls.get(f.id) ?? f.postUrl ?? null,
    }))

    this.send(IPC.GH_REVIEW_UPDATE, {
      reviewId,
      status: 'done',
      findings: findingsWithPostUrls,
      costUsd: totalCost,
      reviewMode: scope.reviewMode,
      snapshot: {
        baseSha: detail.baseSha,
        headSha: detail.headSha,
        mergeBaseSha: null,
        comparedFromSha: scope.comparedFromSha,
        comparedToSha: scope.comparedToSha,
      },
      incrementalValid: scope.incrementalValid,
      summary,
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

  private async runRevalidationSession(
    _reviewId: string,
    cwd: string,
    prompt: string,
  ): Promise<string> {
    const sessionId = await sessionManager.createSession(cwd, undefined, undefined, 'pr-review')
    sessionManager.setPermissionMode(sessionId, 'auto-approve')
    let collected = ''
    const unsub = sessionManager.onMessage(sessionId, (message: unknown) => {
      const msg = message as Record<string, unknown>
      if (msg.type === 'stream_event') {
        const event = msg.event as Record<string, unknown> | undefined
        const delta = event?.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          collected += delta.text
        }
      }
    })
    try {
      await sessionManager.sendMessage(sessionId, prompt)
    } finally {
      unsub()
      sessionManager.stopSession(sessionId)
    }
    return collected
  }

  private async runAgentSession(
    reviewId: string,
    cwd: string,
    detail: Awaited<ReturnType<typeof getPrDetail>>,
    chunks: ChunkResult['chunks'],
    skippedFiles: string[],
    focus: ReviewFocus,
    active: ActiveReviewSession,
    mcpConfig: { command: string; args?: string[]; env?: Record<string, string> } | null,
  ): Promise<ReviewFinding[]> {
    const sessionId = await sessionManager.createSession(
      cwd,
      undefined,
      undefined,
      'pr-review',
      mcpConfig ? { mcpServers: { 'code-intelligence': mcpConfig } } : undefined,
    )
    sessionManager.setPermissionMode(sessionId, 'auto-approve')

    const agentSession: AgentSession = {
      focus,
      sessionId,
      status: 'running',
      findings: [],
      streamedText: '',
      currentChunk: 0,
      totalChunks: chunks.length,
    }
    active.agents.set(focus, agentSession)

    this.sendAgentProgress(reviewId, active)

    const specialistPrompt = this.getAgentPrompt(focus)
    const isMultiChunk = chunks.length > 1

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
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        agentSession.currentChunk = i + 1
        agentSession.totalChunks = chunks.length
        this.sendAgentProgress(reviewId, active)

        let prompt: string

        if (i === 0) {
          // First chunk: full prompt with specialist instructions, PR info, output format
          const chunkHeader = isMultiChunk
            ? `\n\n> **Chunk 1 of ${chunks.length}** — this chunk contains: ${chunk.files.join(', ')}\n`
            : ''
          const skippedNote =
            skippedFiles.length > 0
              ? `\n\n## Skipped Files (excluded from review)\n${skippedFiles.map((f) => `- ${f}`).join('\n')}\n`
              : ''

          prompt = `You are reviewing a GitHub pull request as a **${focus}** specialist.

## Specialist Instructions
${specialistPrompt}

## PR Information
- **Title:** ${detail.title}
- **Author:** ${detail.author}
- **Branch:** ${detail.headBranch} -> ${detail.baseBranch}
- **Files changed:** ${detail.files.length}

## PR Description
${detail.body || '(no description)'}

## Review Scope
- Report only issues introduced or materially worsened by this PR.
- Use surrounding code to validate changed-code impact, not to review unrelated pre-existing code.
- Prefer no finding over a speculative finding. If a concern depends on context you cannot verify, include "needs verification" in the description.
- Avoid duplicate findings from other focus areas. Stay within your specialist role.

## Changed Files
${detail.files.map((f) => `- ${f.path} (+${f.additions} -${f.deletions})`).join('\n')}
${skippedNote}
## Pre-computed Code Context

Before analysing the diff, run this tool call first:

\`\`\`
Read .pylon/pr-context.json
\`\`\`

That file contains:
- Every symbol changed by this PR with its full definition
- References (callers) of each changed symbol across the codebase, capped at 20 per symbol with \`referencesTotal\` reporting the real count
- Tests that cover each changed symbol
- A \`notes\` array with caveats (timeouts, truncations, heuristic-mode warnings)

If the file is missing or errors, proceed with diff-only review. If a symbol has \`referencesTruncated: true\`, you may call \`find_references\` via code-intelligence MCP for the full list.
${chunkHeader}
## Diff
\`\`\`diff
${chunk.diff}
\`\`\`

## Output Format
Output your findings as a JSON array inside a fenced code block tagged \`review-findings\`. Each finding should have:
- \`file\`: the file path (string)
- \`line\`: the line number in the new file, or null for general findings (number | null)
- \`severity\`: immediate triage label, one of "blocker", "high", "medium", "low"
- \`risk\`: structured risk details:
  - \`impact\`: one of "critical", "high", "medium", "low"
  - \`likelihood\`: one of "likely", "possible", "edge-case", "unknown"
  - \`confidence\`: one of "high", "medium", "low"
  - \`action\`: one of "must-fix", "should-fix", "consider", "optional"
- \`title\`: short title (string)
- \`description\`: 2-4 short labeled paragraphs using these exact labels when they fit:
  - \`Observation: ...\`
  - \`Why it matters: ...\`
  - \`Suggested direction: ...\` (optional)
  - \`Needs verification: ...\` (optional; only when uncertainty is real)
  Keep each paragraph to one idea. Do not write one long wall-of-text paragraph.
- \`suggestion\`: optional exact replacement snippet when you can confidently propose code, shaped as:
  - \`body\`: replacement code only, with no markdown fences
  - \`startLine\`: first changed RIGHT-side line to replace
  - \`endLine\`: last changed RIGHT-side line to replace
  Omit \`suggestion\` if you are not confident, if the fix depends on unseen context, or if the replacement is not fully contained in changed lines.

\`\`\`review-findings
[
  {
    "file": "src/main.ts",
    "line": 42,
    "severity": "high",
    "risk": { "impact": "high", "likelihood": "possible", "confidence": "medium", "action": "should-fix" },
    "title": "Potential null dereference",
    "description": "Observation: The variable can still be null when this branch runs.\n\nWhy it matters: That turns a recoverable edge case into a runtime exception on a normal user path.\n\nSuggested direction: Guard the null case before dereferencing.",
    "suggestion": {
      "body": "if (!value) return\nconsume(value)",
      "startLine": 42,
      "endLine": 43
    }
  }
]
\`\`\`

## Risk Calibration
- blocker: must-fix before merge; critical or high impact, realistically reachable, and medium/high confidence
- high: should-fix before merge; meaningful impact or likely regression
- medium: non-blocking but worth considering; limited impact, edge-case reachability, or moderate uncertainty
- low: optional cleanup; minimal risk

If confidence is low, do not use blocker unless impact would be severe and the changed code makes the path plausible. Severity should reflect merge risk, not the agent focus area.

## Tools: Code Intelligence (for deeper drilling)
Use these when the pre-computed bundle does not cover something:
- \`search_code\` for symbols or patterns not in the bundle
- \`get_definition\` for transitively referenced symbols
- \`find_references\` when you need the full caller list beyond the 20-item cap
- \`get_call_hierarchy\` for upstream/downstream call chains
- \`trace_data_flow\` when tracking data across the system

After your analysis, output ONLY the review-findings block.`
        } else {
          // Subsequent chunks: continuation prompt
          prompt = `Here are additional files to review (chunk ${i + 1} of ${chunks.length}). Continue applying your **${focus}** review criteria.

Keep these invariants:
- Report only issues introduced or materially worsened by this PR.
- Stay within your specialist role and avoid duplicate findings from other focus areas.
- Prefer no finding over a speculative finding.
- Output only the \`review-findings\` fenced JSON block.

## Files in this chunk
${chunk.files.map((f) => `- ${f}`).join('\n')}

## Diff
\`\`\`diff
${chunk.diff}
\`\`\`

Output findings in the same \`review-findings\` format.`
        }

        logger.info(
          `Agent ${focus} sending chunk ${i + 1}/${chunks.length}: prompt ${prompt.length} chars (~${Math.ceil(prompt.length / 3.3)} tokens)`,
        )

        try {
          await sessionManager.sendMessage(sessionId, prompt)
        } catch (chunkErr) {
          const errMsg = String(chunkErr).toLowerCase()
          if (
            errMsg.includes('too long') ||
            errMsg.includes('too_long') ||
            errMsg.includes('prompt is too long')
          ) {
            // Conversation grew too large — stop sending more chunks.
            // Parse whatever findings we've collected from prior chunks.
            logger.warn(
              `Agent ${focus} hit context limit at chunk ${i + 1}/${chunks.length}, collecting partial results`,
            )
            break
          }
          throw chunkErr
        }
      }

      agentSession.findings = this.parseFindings(agentSession.streamedText).map((f) => ({
        ...f,
        domain: focus,
      }))
      agentSession.status = 'done'
    } catch (err) {
      // If we collected some findings before the error, still return them
      const partialFindings = this.parseFindings(agentSession.streamedText).map((f) => ({
        ...f,
        domain: focus,
      }))
      if (partialFindings.length > 0) {
        agentSession.findings = partialFindings
        agentSession.status = 'done'
        logger.warn(
          `Agent ${focus} failed but recovered ${partialFindings.length} findings from partial output`,
        )
      } else {
        agentSession.status = 'error'
        agentSession.error = String(err)
      }
      logger.error(`Agent ${focus} failed:`, err)
    } finally {
      unsub()
    }

    this.sendAgentProgress(reviewId, active)
    return agentSession.findings
  }

  /**
   * Create a temporary git worktree checked out to the PR's head branch.
   * Uses `gh pr checkout` inside the worktree to handle fork PRs gracefully.
   */
  private async createPrWorktree(
    repoPath: string,
    prNumber: number,
    headBranch: string,
    reviewId: string,
  ): Promise<string> {
    const repoName = basename(repoPath)
    const worktreeBase = join(homedir(), '.pylon', 'worktrees', repoName)
    const worktreeDir = `pr-${prNumber}-${reviewId.slice(0, 8)}`
    const worktreePath = join(worktreeBase, worktreeDir)

    await mkdir(worktreeBase, { recursive: true })

    // Clean up if path already exists from a previous failed review
    if (existsSync(worktreePath)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
          cwd: repoPath,
          timeout: 10000,
        })
      } catch {
        await rm(worktreePath, { recursive: true, force: true })
      }
    }

    // Fetch the PR's head ref so the branch is available locally
    try {
      await execFileAsync(
        'git',
        ['fetch', 'origin', `pull/${prNumber}/head:pr-review/${prNumber}`],
        { cwd: repoPath, timeout: 30000 },
      )
      // Create worktree on the fetched PR ref
      await execFileAsync('git', ['worktree', 'add', worktreePath, `pr-review/${prNumber}`], {
        cwd: repoPath,
        timeout: 30000,
      })
    } catch {
      // Fallback: if fetch by PR ref fails (e.g. non-GitHub remote), try the branch name directly
      logger.warn(`Failed to fetch PR ref, falling back to branch: ${headBranch}`)
      try {
        await execFileAsync('git', ['fetch', 'origin', headBranch], {
          cwd: repoPath,
          timeout: 30000,
        })
      } catch {
        // Branch may already exist locally
      }
      await execFileAsync('git', ['worktree', 'add', worktreePath, `origin/${headBranch}`], {
        cwd: repoPath,
        timeout: 30000,
      })
    }

    this.prWorktrees.set(reviewId, { path: worktreePath, repoPath })
    logger.info(`Created PR worktree at ${worktreePath} for PR #${prNumber} (${headBranch})`)
    return worktreePath
  }

  /**
   * Remove the temporary worktree and its tracking branch after a review completes.
   */
  private async removePrWorktree(reviewId: string): Promise<void> {
    const entry = this.prWorktrees.get(reviewId)
    if (!entry) return

    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', entry.path], {
        cwd: entry.repoPath,
        timeout: 10000,
      })
    } catch {
      // Force-remove if git worktree remove fails
      try {
        await rm(entry.path, { recursive: true, force: true })
        await execFileAsync('git', ['worktree', 'prune'], {
          cwd: entry.repoPath,
          timeout: 10000,
        })
      } catch (err) {
        logger.warn(`Failed to clean up PR worktree at ${entry.path}:`, err)
      }
    }

    // Clean up the temporary branch
    try {
      const prNumber = entry.path.match(/pr-(\d+)-/)?.[1]
      if (prNumber) {
        await execFileAsync('git', ['branch', '-D', `pr-review/${prNumber}`], {
          cwd: entry.repoPath,
          timeout: 5000,
        })
      }
    } catch {
      // Branch may not exist or already cleaned up
    }

    this.prWorktrees.delete(reviewId)
    logger.info(`Removed PR worktree for review ${reviewId}`)
  }

  private sendAgentProgress(reviewId: string, active: ActiveReviewSession): void {
    const agentProgress = Array.from(active.agents.entries()).map(([focus, agent]) => ({
      agentId: focus,
      status: agent.status,
      findingsCount: agent.findings.length,
      error: agent.error,
      currentChunk: agent.currentChunk,
      totalChunks: agent.totalChunks,
    }))

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

  private parseFindings(text: string): ReviewFinding[] {
    const allFindings: ReviewFinding[] = []

    // Find ALL review-findings fence blocks (global regex for multi-chunk support)
    const fenceRegex = /`{3,}review-findings\s*\n([\s\S]*?)`{3,}/g
    let match: RegExpExecArray | null = fenceRegex.exec(text)
    while (match !== null) {
      allFindings.push(...this.parseJsonFindings(match[1].trim()))
      match = fenceRegex.exec(text)
    }

    // If we found fenced blocks, return those
    if (allFindings.length > 0) return allFindings

    // Fallback: try ```json blocks
    const jsonFenceRegex = /`{3,}json\s*\n(\[[\s\S]*?\])\s*`{3,}/g
    match = jsonFenceRegex.exec(text)
    while (match !== null) {
      allFindings.push(...this.parseJsonFindings(match[1].trim()))
      match = jsonFenceRegex.exec(text)
    }
    if (allFindings.length > 0) return allFindings

    // Last resort: find outermost JSON array
    const arrayStart = text.indexOf('[')
    const arrayEnd = text.lastIndexOf(']')
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return this.parseJsonFindings(text.slice(arrayStart, arrayEnd + 1))
    }

    logger.error('No review-findings block found in output. Text length:', text.length)
    logger.error('First 500 chars:', text.slice(0, 500))
    return []
  }

  private parseJsonFindings(jsonStr: string): ReviewFinding[] {
    // 1. Try direct parse first (happy path)
    const direct = this.tryParseArray(jsonStr)
    if (direct) return direct

    // 2. Try repairing truncated JSON (e.g. LLM hit max_tokens mid-string)
    const repaired = this.tryRepairJson(jsonStr)
    if (repaired) {
      const parsed = this.tryParseArray(repaired)
      if (parsed) {
        logger.info(`Recovered ${parsed.length} findings from repaired JSON`)
        return parsed
      }
    }

    // 3. Last resort: extract individual {...} objects with brace matching
    const extracted = this.extractIndividualFindings(jsonStr)
    if (extracted.length > 0) {
      logger.info(
        `Recovered ${extracted.length} findings via individual object extraction (full parse failed)`,
      )
      return extracted
    }

    logger.error('Failed to parse review findings JSON after all recovery attempts')
    logger.error('JSON string (first 500 chars):', jsonStr.slice(0, 500))
    return []
  }

  private static readonly SEVERITY_ALIASES: Record<string, ReviewFindingSeverity> = {
    blocker: 'blocker',
    blocking: 'blocker',
    critical: 'blocker',
    must: 'blocker',
    'must-fix': 'blocker',
    high: 'high',
    warning: 'high',
    warn: 'high',
    error: 'high',
    medium: 'medium',
    suggestion: 'medium',
    consider: 'medium',
    low: 'low',
    info: 'low',
    nitpick: 'low',
    note: 'low',
    optional: 'low',
  }

  private static normalizeSeverity(raw: unknown): ReviewFindingSeverity {
    const str = String(raw || '')
      .toLowerCase()
      .trim()
    return PrReviewManager.SEVERITY_ALIASES[str] ?? 'medium'
  }

  private static normalizeImpact(raw: unknown): ReviewFindingRisk['impact'] {
    const value = String(raw || '')
      .toLowerCase()
      .trim()
    if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
      return value
    }
    return 'medium'
  }

  private static normalizeLikelihood(raw: unknown): ReviewFindingRisk['likelihood'] {
    const value = String(raw || '')
      .toLowerCase()
      .trim()
    if (
      value === 'likely' ||
      value === 'possible' ||
      value === 'edge-case' ||
      value === 'unknown'
    ) {
      return value
    }
    if (value === 'edge' || value === 'unlikely') return 'edge-case'
    return 'possible'
  }

  private static normalizeConfidence(raw: unknown): ReviewFindingRisk['confidence'] {
    const value = String(raw || '')
      .toLowerCase()
      .trim()
    if (value === 'high' || value === 'medium' || value === 'low') return value
    return 'medium'
  }

  private static normalizeAction(raw: unknown): ReviewFindingRisk['action'] {
    const value = String(raw || '')
      .toLowerCase()
      .trim()
    if (
      value === 'must-fix' ||
      value === 'should-fix' ||
      value === 'consider' ||
      value === 'optional'
    ) {
      return value
    }
    if (value === 'block' || value === 'fix') return 'must-fix'
    if (value === 'should') return 'should-fix'
    return 'consider'
  }

  private static riskFromSeverity(severity: ReviewFindingSeverity): ReviewFindingRisk {
    switch (severity) {
      case 'blocker':
        return { impact: 'critical', likelihood: 'likely', confidence: 'high', action: 'must-fix' }
      case 'high':
        return {
          impact: 'high',
          likelihood: 'possible',
          confidence: 'medium',
          action: 'should-fix',
        }
      case 'low':
        return { impact: 'low', likelihood: 'unknown', confidence: 'medium', action: 'optional' }
      default:
        return {
          impact: 'medium',
          likelihood: 'possible',
          confidence: 'medium',
          action: 'consider',
        }
    }
  }

  private static normalizeRisk(raw: Record<string, unknown>): ReviewFindingRisk {
    const source =
      raw.risk && typeof raw.risk === 'object' ? (raw.risk as Record<string, unknown>) : raw
    const severity = PrReviewManager.normalizeSeverity(raw.severity)
    const fallback = PrReviewManager.riskFromSeverity(severity)
    return {
      impact: PrReviewManager.normalizeImpact(source.impact ?? fallback.impact),
      likelihood: PrReviewManager.normalizeLikelihood(source.likelihood ?? fallback.likelihood),
      confidence: PrReviewManager.normalizeConfidence(source.confidence ?? fallback.confidence),
      action: PrReviewManager.normalizeAction(source.action ?? fallback.action),
    }
  }

  private static normalizeSuggestion(
    raw: Record<string, unknown>,
  ): ReviewFindingSuggestion | undefined {
    const source =
      raw.suggestion && typeof raw.suggestion === 'object'
        ? (raw.suggestion as Record<string, unknown>)
        : raw

    const body = String(
      source.body ??
        source.code ??
        source.snippet ??
        source.suggestedCode ??
        source.suggestionBody ??
        '',
    ).trim()

    const anchorLine = raw.line != null ? Number(raw.line) : null
    const startLine = Number(
      source.startLine ?? source.start_line ?? source.line ?? anchorLine ?? Number.NaN,
    )
    const endLine = Number(
      source.endLine ?? source.end_line ?? source.line ?? anchorLine ?? startLine,
    )

    if (!body || !Number.isFinite(startLine) || !Number.isFinite(endLine)) return undefined

    const normalizedStart = Math.max(1, Math.trunc(startLine))
    const normalizedEnd = Math.max(normalizedStart, Math.trunc(endLine))

    return {
      body,
      startLine: normalizedStart,
      endLine: normalizedEnd,
    }
  }

  private tryParseArray(jsonStr: string): ReviewFinding[] | null {
    try {
      const raw = JSON.parse(jsonStr) as Array<Record<string, unknown>>
      if (!Array.isArray(raw)) return null
      return raw.map((f) => ({
        id: randomUUID(),
        file: String(f.file || ''),
        line: f.line != null ? Number(f.line) : null,
        severity: PrReviewManager.normalizeSeverity(f.severity),
        risk: PrReviewManager.normalizeRisk(f),
        title: String(f.title || ''),
        description: String(f.description || ''),
        domain: null,
        posted: false,
        postUrl: null,
        threadId: null,
        statusInRun: 'new',
        carriedForward: false,
        sourceReviewId: null,
        suggestion: PrReviewManager.normalizeSuggestion(f),
      }))
    } catch {
      return null
    }
  }

  /**
   * Attempt to repair truncated JSON by closing unclosed strings, objects, and arrays.
   * Handles the common case where the LLM hits max_tokens mid-response.
   */
  private tryRepairJson(jsonStr: string): string | null {
    let s = jsonStr.trimEnd()

    // Remove trailing comma if present (common before truncation)
    s = s.replace(/,\s*$/, '')

    // Track what needs closing by scanning character by character
    let inString = false
    let escaped = false
    const stack: string[] = []

    for (const ch of s) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\' && inString) {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue

      if (ch === '[' || ch === '{') stack.push(ch)
      else if (ch === ']' || ch === '}') stack.pop()
    }

    // If we're still inside a string, close it
    if (inString) s += '"'

    // Remove any dangling key-value or trailing comma after string closure
    s = s.replace(/,\s*$/, '')

    // Close any unclosed containers in reverse order
    while (stack.length > 0) {
      const opener = stack.pop() as string
      // Remove trailing comma before closing
      s = s.replace(/,\s*$/, '')
      s += opener === '[' ? ']' : '}'
    }

    return s !== jsonStr ? s : null
  }

  /**
   * Extract individual finding objects by brace-matching each top-level `{...}`.
   * Survives one corrupted object while recovering all the valid ones.
   */
  private extractIndividualFindings(jsonStr: string): ReviewFinding[] {
    const findings: ReviewFinding[] = []
    let i = 0

    while (i < jsonStr.length) {
      // Find next opening brace
      const start = jsonStr.indexOf('{', i)
      if (start === -1) break

      // Brace-match to find the end, respecting strings
      let depth = 0
      let inStr = false
      let esc = false
      let end = -1

      for (let j = start; j < jsonStr.length; j++) {
        const ch = jsonStr[j]
        if (esc) {
          esc = false
          continue
        }
        if (ch === '\\' && inStr) {
          esc = true
          continue
        }
        if (ch === '"') {
          inStr = !inStr
          continue
        }
        if (inStr) continue
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            end = j
            break
          }
        }
      }

      if (end === -1) break // unclosed object, done

      const objStr = jsonStr.slice(start, end + 1)
      i = end + 1

      try {
        const f = JSON.parse(objStr) as Record<string, unknown>
        if (f.file || f.title || f.description) {
          findings.push({
            id: randomUUID(),
            file: String(f.file || ''),
            line: f.line != null ? Number(f.line) : null,
            severity: PrReviewManager.normalizeSeverity(f.severity),
            risk: PrReviewManager.normalizeRisk(f),
            title: String(f.title || ''),
            description: String(f.description || ''),
            domain: null,
            posted: false,
            postUrl: null,
            threadId: null,
            statusInRun: 'new',
            carriedForward: false,
            sourceReviewId: null,
            suggestion: PrReviewManager.normalizeSuggestion(f),
          })
        }
      } catch {
        // Skip this object, try the next one
      }
    }

    return findings
  }

  private getAgentPrompt(focus: ReviewFocus): string {
    const db = getDb()
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(`reviewAgent.${focus}`) as { value: string } | undefined
    return row?.value || DEFAULT_AGENT_PROMPTS[focus]
  }

  getAgentPrompts(): Array<{ id: string; name: string; prompt: string; isCustom: boolean }> {
    const db = getDb()
    const names: Record<string, string> = {
      security: 'Security',
      bugs: 'Bugs',
      performance: 'Performance',
      'code-smells': 'Code Smells',
      style: 'Style',
      architecture: 'Architecture',
      ux: 'UX',
    }
    return Object.keys(DEFAULT_AGENT_PROMPTS).map((id) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`reviewAgent.${id}`) as
        | { value: string }
        | undefined
      return {
        id,
        name: names[id] || id,
        prompt: row?.value || DEFAULT_AGENT_PROMPTS[id],
        isCustom: !!row,
      }
    })
  }

  resetAgentPrompt(focus: string): void {
    const db = getDb()
    db.prepare('DELETE FROM settings WHERE key = ?').run(`reviewAgent.${focus}`)
  }

  stopReview(reviewId: string): void {
    const active = this.activeReviews.get(reviewId)
    if (!active) return
    active.contextAbort?.abort()
    for (const agent of active.agents.values()) {
      sessionManager.stopSession(agent.sessionId)
    }
    this.updateReviewStatus(reviewId, 'error', Date.now())
    this.activeReviews.delete(reviewId)
    this.removePrWorktree(reviewId).catch((err) => {
      logger.warn('Failed to clean up PR worktree on stop:', err)
    })
    this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: 'Review stopped by user' })
  }

  private resolveCodeIntelligenceMcpConfig(...candidateCwds: Array<string | undefined>): {
    command: string
    args?: string[]
    env?: Record<string, string>
  } | null {
    // 1. Explicit user override in DB takes precedence.
    const fromDb = readDbMcpOverride()
    if (fromDb) return fromDb

    // 2. Project-committed .mcp.json in any candidate cwd (worktree or repo path).
    for (const cwd of candidateCwds) {
      if (!cwd) continue
      const fromProject = readMcpFromFile(join(cwd, '.mcp.json'))
      if (fromProject) return fromProject
    }

    // 3. SDK user-scope: ~/.claude.json -> mcpServers["code-intelligence"].
    //    The Agent SDK loads MCP servers from this file for regular sessions, so
    //    PR reviews should reuse the same definition by default.
    const fromUserScope = readMcpFromFile(join(homedir(), '.claude.json'))
    if (fromUserScope) return fromUserScope

    return null
  }

  // ── Persistence queries ──

  listReviews(repoFullName?: string, prNumber?: number): PrReview[] {
    const db = getDb()
    let sql =
      'SELECT r.*, (SELECT COUNT(*) FROM pr_review_findings f WHERE f.review_id = r.id) AS findings_count FROM pr_reviews r'
    const params: unknown[] = []

    if (repoFullName && prNumber) {
      sql += ' WHERE r.repo_full_name = ? AND r.pr_number = ?'
      params.push(repoFullName, prNumber)
    } else if (repoFullName) {
      sql += ' WHERE r.repo_full_name = ?'
      params.push(repoFullName)
    }
    sql += ' ORDER BY r.created_at DESC LIMIT 50'

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map((r) => {
      const review = this.rowToReview(r)
      const count = (r.findings_count as number) || 0
      if (count > 0) {
        // Store count without loading full findings — use length for display
        review.findings = Array.from({ length: count }) as ReviewFinding[]
      }
      return review
    })
  }

  getReview(
    reviewId: string,
  ): (PrReview & { findings: ReviewFinding[]; rawOutput: string }) | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM pr_reviews WHERE id = ?').get(reviewId) as
      | Record<string, unknown>
      | undefined
    if (!row) return null

    const findings = db
      .prepare(
        "SELECT * FROM pr_review_findings WHERE review_id = ? ORDER BY CASE severity WHEN 'blocker' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END",
      )
      .all(reviewId) as Array<Record<string, unknown>>

    const review = this.rowToReview(row)
    review.findings = findings.map((f) => this.rowToFinding(f))
    const postUrls = this.hydratePostUrls(review.findings)
    review.findings = review.findings.map((f) => ({
      ...f,
      postUrl: postUrls.get(f.id) ?? null,
    }))

    return {
      ...review,
      rawOutput: (row.raw_output as string) ?? '',
    }
  }

  getReviewSeries(repoFullName: string, prNumber: number): PrReviewSeries | null {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM pr_review_series WHERE repo_full_name = ? AND pr_number = ? LIMIT 1')
      .get(repoFullName, prNumber) as Record<string, unknown> | undefined
    if (!row) return null
    const [owner = '', repo = ''] = repoFullName.split('/')
    return {
      id: row.id as string,
      repo: { owner, repo, fullName: repoFullName, projectPath: '' },
      prNumber: row.pr_number as number,
      latestReviewId: (row.latest_review_id as string) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }
  }

  getReviewThreads(seriesId: string): ReviewThread[] {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM pr_review_threads WHERE series_id = ? ORDER BY updated_at DESC')
      .all(seriesId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: row.id as string,
      seriesId: row.series_id as string,
      fingerprint: row.fingerprint as string,
      domain: (row.domain as ReviewFocus) ?? null,
      canonicalTitle: row.canonical_title as string,
      status: row.status as ReviewThread['status'],
      firstSeenReviewId: row.first_seen_review_id as string,
      lastSeenReviewId: row.last_seen_review_id as string,
      lastFile: (row.last_file as string) ?? null,
      lastLine: (row.last_line as number) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }))
  }

  getReviewTimeline(seriesId: string): ReviewTimelineEntry[] {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT f.review_id, f.thread_id, f.status_in_run, f.title, f.file, f.line, f.domain, f.carried_forward, r.created_at
         FROM pr_review_findings f
         JOIN pr_reviews r ON r.id = f.review_id
         WHERE r.series_id = ?
         ORDER BY r.created_at DESC, f.rowid DESC`,
      )
      .all(seriesId) as Array<Record<string, unknown>>

    return rows
      .filter((row) => typeof row.thread_id === 'string' && row.thread_id.length > 0)
      .map((row) => ({
        reviewId: row.review_id as string,
        threadId: row.thread_id as string,
        status: row.status_in_run as ReviewTimelineEntry['status'],
        title: (row.title as string) ?? '',
        file: (row.file as string) ?? null,
        line: (row.line as number) ?? null,
        domain: (row.domain as ReviewFocus) ?? null,
        carriedForward: Boolean(row.carried_forward),
        createdAt: row.created_at as number,
      }))
  }

  deleteReview(reviewId: string): void {
    const db = getDb()
    db.prepare('DELETE FROM pr_reviews WHERE id = ?').run(reviewId)
  }

  saveFindings(reviewId: string, findings: ReviewFinding[]): void {
    const db = getDb()
    // Clear existing findings for this review first
    db.prepare('DELETE FROM pr_review_findings WHERE review_id = ?').run(reviewId)
    const threadedFindings = this.assignFindingThreads(reviewId, findings)
    const insert = db.prepare(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, impact, likelihood, confidence, action, title, description, suggestion_body, suggestion_start_line, suggestion_end_line, thread_id, status_in_run, fingerprint, matched_by, anchor_json, source_review_id, carried_forward, domain, merged_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const { finding: f, fingerprint, matchedBy } of threadedFindings) {
      insert.run(
        f.id,
        reviewId,
        f.file,
        f.line,
        f.severity,
        f.risk.impact,
        f.risk.likelihood,
        f.risk.confidence,
        f.risk.action,
        f.title,
        f.description,
        f.suggestion?.body ?? null,
        f.suggestion?.startLine ?? null,
        f.suggestion?.endLine ?? null,
        f.threadId,
        f.statusInRun,
        fingerprint,
        matchedBy,
        null,
        f.sourceReviewId,
        f.carriedForward ? 1 : 0,
        f.domain,
        f.mergedFrom ? JSON.stringify(f.mergedFrom) : null,
      )
    }
  }

  markFindingPosted(findingId: string): void {
    const db = getDb()
    db.prepare('UPDATE pr_review_findings SET posted = 1, posted_at = ? WHERE id = ?').run(
      Date.now(),
      findingId,
    )
  }

  findReviewIdForFinding(findingId: string): string | null {
    const db = getDb()
    const row = db
      .prepare('SELECT review_id FROM pr_review_findings WHERE id = ?')
      .get(findingId) as { review_id: string | null } | undefined
    return row?.review_id ?? null
  }

  recordFindingPost(input: {
    findingId: string
    reviewId: string
    repoFullName: string
    prNumber: number
    kind: FindingPostKind
    body: string
    ghCommentId: number | null
    ghCommentUrl: string | null
    ghReviewId?: number | null
  }): FindingPost {
    const db = getDb()
    const findingRow = db
      .prepare('SELECT thread_id FROM pr_review_findings WHERE id = ?')
      .get(input.findingId) as { thread_id: string | null } | undefined
    const reviewRow = db
      .prepare('SELECT series_id FROM pr_reviews WHERE id = ?')
      .get(input.reviewId) as { series_id: string | null } | undefined
    const id = randomUUID()
    const bodyHash = createHash('sha256').update(input.body).digest('hex').slice(0, 32)
    const postedAt = Date.now()
    db.prepare(
      'INSERT INTO pr_review_finding_posts (id, series_id, thread_id, finding_id, review_id, repo_full_name, pr_number, kind, gh_comment_id, gh_comment_url, gh_review_id, body_hash, posted_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
    ).run(
      id,
      reviewRow?.series_id ?? null,
      findingRow?.thread_id ?? null,
      input.findingId,
      input.reviewId,
      input.repoFullName,
      input.prNumber,
      input.kind,
      input.ghCommentId,
      input.ghCommentUrl,
      input.ghReviewId ?? null,
      bodyHash,
      postedAt,
    )
    return {
      id,
      seriesId: reviewRow?.series_id ?? null,
      threadId: findingRow?.thread_id ?? null,
      findingId: input.findingId,
      reviewId: input.reviewId,
      repoFullName: input.repoFullName,
      prNumber: input.prNumber,
      kind: input.kind,
      ghCommentId: input.ghCommentId,
      ghCommentUrl: input.ghCommentUrl,
      ghReviewId: input.ghReviewId ?? null,
      bodyHash,
      postedAt,
      resolvedAt: null,
    }
  }

  getFindingPosts(args: {
    threadId?: string
    findingId?: string
    seriesId?: string
  }): FindingPost[] {
    const db = getDb()
    const where: string[] = []
    const params: unknown[] = []
    if (args.threadId) {
      where.push('thread_id = ?')
      params.push(args.threadId)
    }
    if (args.findingId) {
      where.push('finding_id = ?')
      params.push(args.findingId)
    }
    if (args.seriesId) {
      where.push('series_id = ?')
      params.push(args.seriesId)
    }
    if (where.length === 0) return []
    const rows = db
      .prepare(
        `SELECT * FROM pr_review_finding_posts WHERE ${where.join(' AND ')} ORDER BY posted_at DESC`,
      )
      .all(...params) as Array<Record<string, unknown>>
    return rows.map((row) => PrReviewManager.rowToFindingPost(row))
  }

  markFindingPostResolved(postId: string, resolvedAt: number = Date.now()): void {
    const db = getDb()
    db.prepare('UPDATE pr_review_finding_posts SET resolved_at = ? WHERE id = ?').run(
      resolvedAt,
      postId,
    )
  }

  private async resolveMappedCommentsForOutcomes(
    repoFullName: string,
    outcomes: Array<{ threadId: string; finding: { statusInRun: string } }>,
  ): Promise<void> {
    const resolvedThreadIds = outcomes
      .filter((o) => o.finding.statusInRun === 'resolved')
      .map((o) => o.threadId)
    if (resolvedThreadIds.length === 0) return
    const db = getDb()
    const placeholders = resolvedThreadIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT id, gh_comment_id FROM pr_review_finding_posts
         WHERE thread_id IN (${placeholders}) AND resolved_at IS NULL AND gh_comment_id IS NOT NULL AND kind = 'inline'`,
      )
      .all(...resolvedThreadIds) as Array<{ id: string; gh_comment_id: number }>
    if (rows.length === 0) return
    const { appendToPullRequestReviewComment } = await import('./gh-cli')
    const now = Date.now()
    const update = db.prepare('UPDATE pr_review_finding_posts SET resolved_at = ? WHERE id = ?')
    for (const row of rows) {
      const note =
        '\n\n---\n_Resolved by Pylon revalidation. The prior issue no longer applies at this anchor._'
      try {
        const ok = await appendToPullRequestReviewComment(repoFullName, row.gh_comment_id, note)
        if (ok) update.run(now, row.id)
      } catch (err) {
        logger.warn(`Failed to resolve GH comment ${row.gh_comment_id}:`, err)
      }
    }
  }

  getReviewRunFiles(reviewId: string): Array<{
    filePath: string
    status: string
    oldPath: string | null
    touched: boolean
    patchHash: string | null
  }> {
    const db = getDb()
    const rows = db
      .prepare(
        'SELECT file_path, status, old_path, touched, patch_hash FROM pr_review_run_files WHERE review_id = ? ORDER BY file_path',
      )
      .all(reviewId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      filePath: row.file_path as string,
      status: (row.status as string) ?? 'modified',
      oldPath: (row.old_path as string) ?? null,
      touched: Boolean(row.touched ?? 1),
      patchHash: (row.patch_hash as string) ?? null,
    }))
  }

  private static rowToFindingPost(row: Record<string, unknown>): FindingPost {
    return {
      id: row.id as string,
      seriesId: (row.series_id as string) ?? null,
      threadId: (row.thread_id as string) ?? null,
      findingId: row.finding_id as string,
      reviewId: row.review_id as string,
      repoFullName: row.repo_full_name as string,
      prNumber: row.pr_number as number,
      kind: row.kind as FindingPostKind,
      ghCommentId: typeof row.gh_comment_id === 'number' ? row.gh_comment_id : null,
      ghCommentUrl: typeof row.gh_comment_url === 'string' ? row.gh_comment_url : null,
      ghReviewId: typeof row.gh_review_id === 'number' ? row.gh_review_id : null,
      bodyHash: row.body_hash as string,
      postedAt: row.posted_at as number,
      resolvedAt: typeof row.resolved_at === 'number' ? row.resolved_at : null,
    }
  }

  /**
   * For each finding, find the most recent unresolved post URL keyed by thread_id
   * (preferred) or finding_id. Returns a Map<findingId, postUrl>.
   */
  private hydratePostUrls(findings: ReviewFinding[]): Map<string, string> {
    const db = getDb()
    const threadIds = findings.map((f) => f.threadId).filter((id): id is string => Boolean(id))
    const findingIds = findings.map((f) => f.id)
    const result = new Map<string, string>()
    if (threadIds.length === 0 && findingIds.length === 0) return result

    const rows: Array<Record<string, unknown>> = []
    if (threadIds.length > 0) {
      const placeholders = threadIds.map(() => '?').join(',')
      rows.push(
        ...(db
          .prepare(
            `SELECT thread_id, finding_id, gh_comment_url FROM pr_review_finding_posts WHERE thread_id IN (${placeholders}) AND resolved_at IS NULL AND gh_comment_url IS NOT NULL ORDER BY posted_at DESC`,
          )
          .all(...threadIds) as Array<Record<string, unknown>>),
      )
    }
    if (findingIds.length > 0) {
      const placeholders = findingIds.map(() => '?').join(',')
      rows.push(
        ...(db
          .prepare(
            `SELECT thread_id, finding_id, gh_comment_url FROM pr_review_finding_posts WHERE finding_id IN (${placeholders}) AND resolved_at IS NULL AND gh_comment_url IS NOT NULL ORDER BY posted_at DESC`,
          )
          .all(...findingIds) as Array<Record<string, unknown>>),
      )
    }

    const urlByThread = new Map<string, string>()
    const urlByFinding = new Map<string, string>()
    for (const row of rows) {
      const url = row.gh_comment_url as string
      const tid = (row.thread_id as string) ?? null
      const fid = (row.finding_id as string) ?? null
      if (tid && !urlByThread.has(tid)) urlByThread.set(tid, url)
      if (fid && !urlByFinding.has(fid)) urlByFinding.set(fid, url)
    }
    for (const f of findings) {
      const url = (f.threadId && urlByThread.get(f.threadId)) || urlByFinding.get(f.id) || null
      if (url) result.set(f.id, url)
    }
    return result
  }

  private rowToFinding(f: Record<string, unknown>): ReviewFinding {
    return {
      id: f.id as string,
      file: (f.file as string) ?? '',
      line: f.line as number | null,
      severity: PrReviewManager.normalizeSeverity(f.severity),
      risk: PrReviewManager.normalizeRisk(f),
      title: f.title as string,
      description: f.description as string,
      domain: (f.domain as ReviewFocus) ?? null,
      posted: Boolean(f.posted),
      postUrl: null,
      threadId: (f.thread_id as string) ?? null,
      statusInRun: (f.status_in_run as ReviewFinding['statusInRun']) ?? 'new',
      carriedForward: Boolean(f.carried_forward),
      sourceReviewId: (f.source_review_id as string) ?? null,
      suggestion:
        typeof f.suggestion_body === 'string' &&
        typeof f.suggestion_start_line === 'number' &&
        typeof f.suggestion_end_line === 'number'
          ? {
              body: f.suggestion_body,
              startLine: f.suggestion_start_line,
              endLine: f.suggestion_end_line,
            }
          : undefined,
      mergedFrom: f.merged_from ? JSON.parse(f.merged_from as string) : undefined,
    }
  }

  private rowToReview(row: Record<string, unknown>): PrReview {
    const fullName = row.repo_full_name as string
    const [owner = '', repo = ''] = fullName.split('/')
    let summary = EMPTY_REVIEW_SUMMARY
    if (typeof row.summary_json === 'string') {
      try {
        summary = { ...EMPTY_REVIEW_SUMMARY, ...(JSON.parse(row.summary_json) as ReviewRunSummary) }
      } catch {
        summary = EMPTY_REVIEW_SUMMARY
      }
    }
    return {
      id: row.id as string,
      seriesId: (row.series_id as string) ?? null,
      parentReviewId: (row.parent_review_id as string) ?? null,
      prNumber: row.pr_number as number,
      repo: { owner, repo, fullName, projectPath: '' },
      prTitle: (row.pr_title as string) ?? '',
      prUrl: (row.pr_url as string) ?? '',
      status: row.status as ReviewStatus,
      reviewMode: ((row.review_mode as ReviewMode) ?? 'full') as ReviewMode,
      snapshot: {
        baseSha: (row.base_sha as string) ?? null,
        headSha: (row.head_sha as string) ?? null,
        mergeBaseSha: (row.merge_base_sha as string) ?? null,
        comparedFromSha: (row.compared_from_sha as string) ?? null,
        comparedToSha: (row.compared_to_sha as string) ?? null,
      },
      summary,
      incrementalValid: row.incremental_valid == null ? true : Boolean(row.incremental_valid),
      focus: JSON.parse((row.focus as string) || '[]'),
      findings: [],
      sessionId: row.session_id as string | null,
      startedAt: row.started_at as number,
      completedAt: row.completed_at as number | null,
      createdAt: row.created_at as number,
      costUsd: (row.cost_usd as number) ?? 0,
    }
  }
}

export const prReviewManager = new PrReviewManager()
