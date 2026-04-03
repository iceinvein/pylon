import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type { GhRepo, PrReview, ReviewFinding, ReviewFocus, ReviewStatus } from '../shared/types'
import { getDb } from './db'
import { type ChunkResult, chunkDiff, getTokenBudget } from './diff-chunker'
import { getPrDetail } from './gh-cli'
import { sessionManager } from './session-manager'

const execFileAsync = promisify(execFile)

const logger = log.child('pr-review')
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
    '- XSS: unescapedd output in HTML/JSX, unsafe innerHTML usage, React dangerouslySetInnerHTML',
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
    '**Severity guide:**',
    '- critical: Remote code execution, auth bypass, data breach, privilege escalation',
    '- warning: XSS, CSRF, injection with partial mitigation, secrets exposure',
    "- suggestion: Defense-in-depth improvements, missing validation that's hard to exploit",
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
    "Only flag issues that would have noticeable impact at realistic scale. Don't suggest micro-optimizations on cold paths.",
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
  ): Promise<PrReview> {
    const reviewId = randomUUID()
    const now = Date.now()

    const db = getDb()
    db.prepare(
      'INSERT INTO pr_reviews (id, repo_full_name, pr_number, pr_title, pr_url, focus, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      reviewId,
      repo.fullName,
      prNumber,
      prTitle,
      prUrl,
      JSON.stringify(focusAreas),
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
      costUsd: 0,
    }

    this.send(IPC.GH_REVIEW_UPDATE, {
      reviewId,
      status: 'running',
      findings: [],
      streamingText: '',
      agentProgress: focusAreas.map((f) => ({ agentId: f, status: 'pending', findingsCount: 0 })),
    })

    this.runParallelReview(reviewId, repo, prNumber, focusAreas).catch((err) => {
      logger.error('Review failed:', err)
      this.updateReviewStatus(reviewId, 'error', Date.now())
      this.send(IPC.GH_REVIEW_UPDATE, { reviewId, status: 'error', error: String(err) })
    })

    return review
  }

  private async runParallelReview(
    reviewId: string,
    repo: GhRepo,
    prNumber: number,
    focusAreas: ReviewFocus[],
  ): Promise<void> {
    this.send(IPC.GH_REVIEW_UPDATE, {
      reviewId,
      status: 'running',
      streamingText: 'Fetching PR diff...',
      agentProgress: focusAreas.map((f) => ({ agentId: f, status: 'pending', findingsCount: 0 })),
    })

    const detail = await getPrDetail(repo.fullName, prNumber)

    // Use SDK-reported context window if available, otherwise fall back to hardcoded limits
    const cachedContextWindow = sessionManager.getModelContextWindow('claude-sonnet-4-6')
    const tokenBudget = getTokenBudget(undefined, 0, cachedContextWindow)
    logger.info(
      `Token budget: ${tokenBudget} tokens (context window: ${cachedContextWindow ?? 'default'}, diff length: ${detail.diff.length} chars, ~${Math.ceil(detail.diff.length / 3.3)} tokens)`,
    )
    const { chunks, skippedFiles } = chunkDiff(detail.diff, { tokenBudget })

    logger.info(
      `Skipped ${skippedFiles.length} files: ${skippedFiles.length > 0 ? skippedFiles.join(', ') : '(none)'}`,
    )
    for (const chunk of chunks) {
      logger.info(
        `Chunk ${chunk.index + 1}/${chunk.total}: ${chunk.files.length} files, ${chunk.diff.length} chars (~${Math.ceil(chunk.diff.length / 3.3)} tokens) — ${chunk.files.join(', ')}`,
      )
    }

    const active = this.activeReviews.get(reviewId)
    if (!active) return

    // Edge case: all files were skipped (e.g. only lock files changed)
    if (chunks.length === 0) {
      this.updateReviewStatus(reviewId, 'done', Date.now())
      this.send(IPC.GH_REVIEW_UPDATE, {
        reviewId,
        status: 'done',
        findings: [],
        streamingText: `All changed files were skipped (lockfiles, generated code, etc.):\n${skippedFiles.map((f) => `- ${f}`).join('\n')}`,
        agentProgress: focusAreas.map((f) => ({
          agentId: f,
          status: 'done' as const,
          findingsCount: 0,
        })),
      })
      this.activeReviews.delete(reviewId)
      return
    }

    // Create a worktree checked out to the PR's head branch so agents
    // explore the actual PR code, not whatever branch is checked out locally
    let sessionCwd = repo.projectPath
    try {
      sessionCwd = await this.createPrWorktree(
        repo.projectPath,
        prNumber,
        detail.headBranch,
        reviewId,
      )
    } catch (err) {
      logger.warn('Failed to create PR worktree, falling back to project path:', err)
    }

    const agentPromises = focusAreas.map((focus) =>
      this.runAgentSession(reviewId, sessionCwd, detail, chunks, skippedFiles, focus, active),
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

    const deduped = await this.deduplicateFindings(allFindings)

    // Persist findings
    const db = getDb()
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

    // Sum cost from all agent sessions
    const totalCost = this.sumAgentCosts(active)
    this.updateReviewStatus(reviewId, 'done', Date.now(), totalCost)

    this.send(IPC.GH_REVIEW_UPDATE, {
      reviewId,
      status: 'done',
      findings: deduped,
      costUsd: totalCost,
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
    cwd: string,
    detail: Awaited<ReturnType<typeof getPrDetail>>,
    chunks: ChunkResult['chunks'],
    skippedFiles: string[],
    focus: ReviewFocus,
    active: ActiveReviewSession,
  ): Promise<ReviewFinding[]> {
    const sessionId = await sessionManager.createSession(cwd, undefined, undefined, 'pr-review')
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

## Changed Files
${detail.files.map((f) => `- ${f.path} (+${f.additions} -${f.deletions})`).join('\n')}
${skippedNote}${chunkHeader}
## Diff
\`\`\`diff
${chunk.diff}
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

## Tools — Code Intelligence (use first!)
Before analyzing the diff, use code-intelligence MCP tools to build context around the changed code:
- \`search_code\` — find related symbols, patterns, or usages across the codebase
- \`get_definition\` — jump to a symbol's definition to understand its contract
- \`find_references\` — find all call sites of changed functions to assess blast radius
- \`get_call_hierarchy\` — understand upstream/downstream call chains
- \`trace_data_flow\` — follow data through the system to spot issues the diff alone won't reveal

Use these tools to understand the surrounding code before making judgments. This ensures your findings account for the full context, not just the diff in isolation.

After your analysis, output ONLY the review-findings block.`
        } else {
          // Subsequent chunks: continuation prompt
          prompt = `Here are additional files to review (chunk ${i + 1} of ${chunks.length}). Continue applying your **${focus}** review criteria.

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

      const cleaned = text.replace(/^```json?\s*|\s*```$/g, '').trim()
      const parsed = JSON.parse(cleaned) as { groups: number[][] }
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
      valid.sort(
        (a, b) => (severityRank[group[a].severity] ?? 99) - (severityRank[group[b].severity] ?? 99),
      )
      const primary = group[valid[0]]
      const others = valid.slice(1).map((i) => group[i])

      const mergedFrom = others
        .filter((o) => o.domain !== primary.domain)
        .map((o) => ({ domain: o.domain ?? 'unknown', title: o.title }))

      result.push({
        ...primary,
        description:
          primary.description +
          (mergedFrom.length > 0
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
        description:
          primary.description +
          (mergedFrom.length > 0
            ? `\n\n_Also flagged by: ${mergedFrom.map((m) => m.domain).join(', ')}_`
            : ''),
        mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
      },
    ]
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

  private static readonly SEVERITY_ALIASES: Record<string, ReviewFinding['severity']> = {
    critical: 'critical',
    high: 'critical',
    error: 'critical',
    warning: 'warning',
    medium: 'warning',
    warn: 'warning',
    suggestion: 'suggestion',
    low: 'suggestion',
    info: 'nitpick',
    nitpick: 'nitpick',
    note: 'nitpick',
  }

  private static normalizeSeverity(raw: unknown): ReviewFinding['severity'] {
    const str = String(raw || '')
      .toLowerCase()
      .trim()
    return PrReviewManager.SEVERITY_ALIASES[str] ?? 'suggestion'
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
        title: String(f.title || ''),
        description: String(f.description || ''),
        domain: null,
        posted: false,
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
            title: String(f.title || ''),
            description: String(f.description || ''),
            domain: null,
            posted: false,
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
    return row?.value || DEFAULT_AGENT_PROMPTS[focus] || DEFAULT_AGENT_PROMPTS.general
  }

  getAgentPrompts(): Array<{ id: string; name: string; prompt: string; isCustom: boolean }> {
    const db = getDb()
    const names: Record<string, string> = {
      security: 'Security',
      bugs: 'Bugs',
      performance: 'Performance',
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
        "SELECT * FROM pr_review_findings WHERE review_id = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'suggestion' THEN 2 WHEN 'nitpick' THEN 3 END",
      )
      .all(reviewId) as Array<Record<string, unknown>>

    const review = this.rowToReview(row)
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

  markFindingPosted(findingId: string): void {
    const db = getDb()
    db.prepare('UPDATE pr_review_findings SET posted = 1, posted_at = ? WHERE id = ?').run(
      Date.now(),
      findingId,
    )
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
      costUsd: (row.cost_usd as number) ?? 0,
    }
  }
}

export const prReviewManager = new PrReviewManager()
