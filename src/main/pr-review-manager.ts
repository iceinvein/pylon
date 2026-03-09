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
