import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { getDb } from './db'
import { sessionManager } from './session-manager'
import { getPrDetail } from './gh-cli'
import { IPC } from '../shared/ipc-channels'
import type { GhRepo, ReviewFocus, ReviewFinding, PrReview, ReviewStatus } from '../shared/types'

const MAX_DIFF_LINES = 50_000
const STREAM_THROTTLE_MS = 300

const DEFAULT_AGENT_PROMPTS: Record<string, string> = {
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
    '- Broken access control: one user accessing another\'s resources',
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
    '4. Evaluate impact — what\'s the blast radius if exploited?',
    '',
    '**Severity guide:**',
    '- critical: Remote code execution, auth bypass, data breach, privilege escalation',
    '- warning: XSS, CSRF, injection with partial mitigation, secrets exposure',
    '- suggestion: Defense-in-depth improvements, missing validation that\'s hard to exploit',
    '- nitpick: Minor hardening opportunities, informational',
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
    '- State machine violations: impossible states that aren\'t prevented',
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
    '1. What\'s the precondition that triggers it?',
    '2. Is this reachable in normal usage or only edge cases?',
    '3. What\'s the consequence — crash, data corruption, silent wrong behavior?',
    '4. Is there an existing guard I\'m not seeing?',
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
    '1. What\'s the data size at scale? (10 items is fine, 10,000 is not)',
    '2. How often does this code path execute? (once on init vs. every keystroke)',
    '3. What\'s the measurable impact? (milliseconds vs. seconds)',
    '4. Is the optimization worth the complexity cost?',
    '',
    'Only flag issues that would have noticeable impact at realistic scale. Don\'t suggest micro-optimizations on cold paths.',
  ].join('\n'),

  style: [
    'You are a senior developer focused on code quality and maintainability.',
    '',
    '## What to look for',
    '',
    '**Naming & clarity**',
    '- Variable/function names that don\'t communicate intent',
    '- Misleading names that suggest different behavior than implemented',
    '- Inconsistent naming conventions within the same file or module',
    '- Abbreviations that sacrifice readability for brevity',
    '- Boolean names that don\'t read as questions (e.g., data vs isLoaded)',
    '',
    '**Code organization**',
    '- Functions doing too many things (should be split)',
    '- Related logic scattered across distant parts of a file',
    '- Dead code: unused variables, unreachable branches, commented-out code',
    '- Unused imports or dependencies',
    '- Copy-pasted code that should be extracted into a shared function',
    '',
    '**Complexity**',
    '- Deeply nested conditionals that could be flattened with early returns',
    '- Complex expressions that should be broken into named intermediate variables',
    '- Long parameter lists that suggest a missing abstraction',
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
    '- Tight coupling: module A reaching deep into module B\'s internals',
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
    '- Over-engineering: abstractions for things that don\'t vary',
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
    'Focus on design decisions that affect the long-term health of the codebase. Don\'t flag things that are "technically impure" but work well in practice.',
  ].join('\n'),

  ux: [
    'You are a senior product engineer reviewing this pull request for user experience quality.',
    '',
    '## What to look for',
    '',
    '**Error handling & feedback**',
    '- API errors shown as raw technical messages instead of user-friendly text',
    '- Missing error states: what does the user see when something fails?',
    '- Form validation errors that don\'t explain what\'s wrong or how to fix it',
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
    '- Color as the only indicator of state (colorblind users can\'t distinguish)',
    '- Missing ARIA attributes for dynamic content changes',
    '',
    '**Consistency & predictability**',
    '- Same action behaving differently in different contexts',
    '- Inconsistent terminology (different labels for the same concept)',
    '- UI state not preserved when navigating away and back',
    '- Missing feedback for successful actions (user doesn\'t know it worked)',
    '',
    '## How to reason',
    '',
    'For each potential issue:',
    '1. Put yourself in the user\'s shoes — what were they trying to do?',
    '2. What\'s the worst case input/state? Test mentally with empty, huge, special-char data.',
    '3. Is the behavior predictable? Would a new user understand what happened?',
    '4. How frequently would real users hit this issue?',
    '',
    'Focus on issues that would confuse or frustrate users. Don\'t flag minor aesthetic preferences.',
  ].join('\n'),
}

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

  private async runParallelReview(
    reviewId: string,
    repo: GhRepo,
    prNumber: number,
    focusAreas: ReviewFocus[]
  ): Promise<void> {
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

    const active = this.activeReviews.get(reviewId)
    if (!active) return

    const agentPromises = focusAreas.map((focus) =>
      this.runAgentSession(reviewId, repo, detail, diff, truncated, focus, active)
    )

    const results = await Promise.allSettled(agentPromises)

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
      this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: 'All review agents failed' })
      this.activeReviews.delete(reviewId)
      return
    }

    const deduped = this.deduplicateFindings(allFindings)

    // Persist findings
    const db = getDb()
    const insertFinding = db.prepare(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description, domain) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const f of deduped) {
      insertFinding.run(f.id, reviewId, f.file, f.line, f.severity, f.title, f.description, f.domain)
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
      agentSession.findings = this.parseFindings(agentSession.streamedText).map((f) => ({ ...f, domain: focus }))
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

  private sendAgentProgress(reviewId: string, active: ActiveReviewSession): void {
    const agentProgress = Array.from(active.agents.entries()).map(([focus, agent]) => ({
      agentId: focus,
      status: agent.status,
      findingsCount: agent.findings.length,
      error: agent.error,
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
          grouped.set(key, {
            ...f,
            description: f.description + `\n\n_Also flagged by another agent:_ ${existing.title}`,
          })
        } else {
          grouped.set(key, {
            ...existing,
            description: existing.description + `\n\n_Also flagged by another agent:_ ${f.title}`,
          })
        }
      }
    }
    return Array.from(grouped.values())
  }

  private parseFindings(text: string): ReviewFinding[] {
    // Try multiple fence patterns: ```review-findings, ````review-findings, ```json, or bare JSON array
    const fencePatterns = [
      /`{3,}review-findings\s*\n([\s\S]*?)`{3,}/,
      /`{3,}json\s*\n(\[[\s\S]*?\])\s*`{3,}/,
    ]

    let jsonStr: string | null = null
    for (const regex of fencePatterns) {
      const match = text.match(regex)
      if (match) {
        jsonStr = match[1].trim()
        break
      }
    }

    // Fallback: find the outermost JSON array in the text
    if (!jsonStr) {
      const arrayStart = text.indexOf('[')
      const arrayEnd = text.lastIndexOf(']')
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        jsonStr = text.slice(arrayStart, arrayEnd + 1)
      }
    }

    if (!jsonStr) {
      console.error('No review-findings block found in output. Text length:', text.length)
      console.error('First 500 chars:', text.slice(0, 500))
      return []
    }

    try {
      const raw = JSON.parse(jsonStr) as Array<Record<string, unknown>>
      if (!Array.isArray(raw)) return []
      return raw.map((f) => ({
        id: randomUUID(),
        file: String(f.file || ''),
        line: f.line != null ? Number(f.line) : null,
        severity: (f.severity as ReviewFinding['severity']) || 'suggestion',
        title: String(f.title || ''),
        description: String(f.description || ''),
        domain: null,
        posted: false,
      }))
    } catch (err) {
      console.error('Failed to parse review findings JSON:', err)
      console.error('JSON string (first 500 chars):', jsonStr.slice(0, 500))
      return []
    }
  }

  private getAgentPrompt(focus: ReviewFocus): string {
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`reviewAgent.${focus}`) as { value: string } | undefined
    return row?.value || DEFAULT_AGENT_PROMPTS[focus] || DEFAULT_AGENT_PROMPTS.general
  }

  getAgentPrompts(): Array<{ id: string; name: string; prompt: string; isCustom: boolean }> {
    const db = getDb()
    const names: Record<string, string> = {
      security: 'Security', bugs: 'Bugs',
      performance: 'Performance', style: 'Style',
      architecture: 'Architecture', ux: 'UX',
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

  resetAgentPrompt(focus: string): void {
    const db = getDb()
    db.prepare('DELETE FROM settings WHERE key = ?').run(`reviewAgent.${focus}`)
  }

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

  // ── Persistence queries ──

  listReviews(repoFullName?: string, prNumber?: number): PrReview[] {
    const db = getDb()
    let sql = 'SELECT r.*, (SELECT COUNT(*) FROM pr_review_findings f WHERE f.review_id = r.id) AS findings_count FROM pr_reviews r'
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

  getReview(reviewId: string): (PrReview & { findings: ReviewFinding[]; rawOutput: string }) | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM pr_reviews WHERE id = ?').get(reviewId) as Record<string, unknown> | undefined
    if (!row) return null

    const findings = db.prepare(
      "SELECT * FROM pr_review_findings WHERE review_id = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'suggestion' THEN 2 WHEN 'nitpick' THEN 3 END"
    ).all(reviewId) as Array<Record<string, unknown>>

    const review = this.rowToReview(row)
    review.findings = findings.map((f) => ({
      id: f.id as string,
      file: f.file as string,
      line: f.line as number | null,
      severity: f.severity as ReviewFinding['severity'],
      title: f.title as string,
      description: f.description as string,
      domain: (f.domain as ReviewFocus) ?? null,
      posted: Boolean(f.posted),
    }))

    return {
      ...review,
      rawOutput: (row.raw_output as string) ?? '',
    }
  }

  deleteReview(reviewId: string): void {
    const db = getDb()
    db.prepare('DELETE FROM pr_reviews WHERE id = ?').run(reviewId)
  }

  saveFindings(reviewId: string, findings: ReviewFinding[]): void {
    const db = getDb()
    // Clear existing findings for this review first
    db.prepare('DELETE FROM pr_review_findings WHERE review_id = ?').run(reviewId)
    const insert = db.prepare(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description, domain) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const f of findings) {
      insert.run(f.id, reviewId, f.file, f.line, f.severity, f.title, f.description, f.domain)
    }
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
