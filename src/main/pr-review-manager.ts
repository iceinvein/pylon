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

  architecture: `You are an architecture and design reviewer. Look for:
- Poor separation of concerns or leaky abstractions
- Tight coupling between modules that should be independent
- Missing or misused design patterns
- API design issues (inconsistent contracts, poor naming, missing validation)
- Scalability concerns in data structures or algorithms
- Violations of SOLID principles
Be thorough but avoid false positives. Only flag issues you're confident about.`,

  ux: `You are a UI/UX reviewer. Look for:
- Missing or unhelpful error messages shown to users
- Loading states not handled (spinners, skeletons, disabled buttons)
- Accessibility issues (missing labels, keyboard navigation, contrast)
- Inconsistent user-facing behavior or confusing flows
- Missing confirmation for destructive actions
- Edge cases in user input (empty states, long text, special characters)
Be thorough but avoid false positives. Only flag issues you're confident about.`,
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
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    for (const f of findings) {
      insert.run(f.id, reviewId, f.file, f.line, f.severity, f.title, f.description)
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
