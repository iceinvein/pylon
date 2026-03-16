import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type { GhPullRequest, GhRepo } from '../shared/types'
import { getDb } from './db'

const logger = log.child('pr-polling')

const POLL_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

class PrPollingService {
  private interval: ReturnType<typeof setInterval> | null = null
  private window: BrowserWindow | null = null
  private polling = false

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  start(): void {
    // Immediate first poll (delayed slightly to let the app finish booting)
    setTimeout(() => this.poll().catch((err) => logger.error('Initial poll failed:', err)), 3000)
    this.interval = setInterval(
      () => this.poll().catch((err) => logger.error('Poll failed:', err)),
      POLL_INTERVAL_MS,
    )
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true

    try {
      const { checkGhStatus, discoverRepos, listPrs } = await import('./gh-cli')
      const { sessionManager } = await import('./session-manager')

      // Check gh availability
      const status = await checkGhStatus()
      if (!status.available || !status.authenticated) return

      // Discover repos
      const projects = sessionManager.getProjectFolders()
      const paths = projects.map((p: { path: string }) => p.path)
      const repos = await discoverRepos(paths)
      if (repos.length === 0) return

      const db = getDb()
      const now = Date.now()

      const upsertStmt = db.prepare(`
        INSERT INTO pr_cache (repo_full_name, pr_number, title, author, state, created_at,
          updated_at, head_branch, base_branch, additions, deletions, review_decision,
          is_draft, url, repo_owner, repo_name, project_path, last_polled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_full_name, pr_number) DO UPDATE SET
          title = excluded.title,
          author = excluded.author,
          state = excluded.state,
          updated_at = excluded.updated_at,
          head_branch = excluded.head_branch,
          base_branch = excluded.base_branch,
          additions = excluded.additions,
          deletions = excluded.deletions,
          review_decision = excluded.review_decision,
          is_draft = excluded.is_draft,
          url = excluded.url,
          repo_owner = excluded.repo_owner,
          repo_name = excluded.repo_name,
          project_path = excluded.project_path,
          last_polled_at = excluded.last_polled_at
      `)

      const batchUpsert = db.transaction((prs: GhPullRequest[], repo: GhRepo, polledAt: number) => {
        for (const pr of prs) {
          upsertStmt.run(
            repo.fullName,
            pr.number,
            pr.title,
            pr.author,
            pr.state,
            new Date(pr.createdAt).getTime(),
            new Date(pr.updatedAt).getTime(),
            pr.headBranch,
            pr.baseBranch,
            pr.additions,
            pr.deletions,
            pr.reviewDecision,
            pr.isDraft ? 1 : 0,
            pr.url,
            repo.owner,
            repo.repo,
            repo.projectPath,
            polledAt,
          )
        }

        // Mark stale PRs as closed for this repo
        if (prs.length > 0) {
          const placeholders = prs.map(() => '?').join(', ')
          db.prepare(
            `UPDATE pr_cache SET state = 'closed'
               WHERE repo_full_name = ? AND state = 'open'
               AND pr_number NOT IN (${placeholders})`,
          ).run(repo.fullName, ...prs.map((pr) => pr.number))
        } else {
          db.prepare(
            `UPDATE pr_cache SET state = 'closed'
               WHERE repo_full_name = ? AND state = 'open'`,
          ).run(repo.fullName)
        }
      })

      for (const repo of repos) {
        try {
          const prs = await listPrs(repo.fullName)
          batchUpsert(prs, repo, now)
        } catch (err) {
          logger.warn(`Failed to poll PRs for ${repo.fullName}:`, err)
        }
      }

      this.pushUnseenCount()
    } finally {
      this.polling = false
    }
  }

  async forcePoll(): Promise<void> {
    await this.poll()
  }

  markSeen(repo: string, prNumber: number): void {
    const db = getDb()
    db.prepare(
      'UPDATE pr_cache SET last_seen_at = ? WHERE repo_full_name = ? AND pr_number = ?',
    ).run(Date.now(), repo, prNumber)
    this.pushUnseenCount()
  }

  getUnseenCount(): number {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT COUNT(*) as count FROM pr_cache
       WHERE state = 'open'
       AND (last_seen_at IS NULL OR updated_at > last_seen_at)`,
      )
      .get() as { count: number }
    return row.count
  }

  getCachedPrs(repo?: string): GhPullRequest[] {
    const db = getDb()
    const query = repo
      ? `SELECT * FROM pr_cache WHERE state = 'open' AND repo_full_name = ? ORDER BY updated_at DESC`
      : `SELECT * FROM pr_cache WHERE state = 'open' ORDER BY updated_at DESC`
    const rows = (repo ? db.prepare(query).all(repo) : db.prepare(query).all()) as Array<
      Record<string, unknown>
    >
    return rows.map((row) => ({
      number: row.pr_number as number,
      title: row.title as string,
      author: row.author as string,
      state: row.state as 'open' | 'closed' | 'merged',
      createdAt: new Date(row.created_at as number).toISOString(),
      updatedAt: new Date(row.updated_at as number).toISOString(),
      headBranch: row.head_branch as string,
      baseBranch: row.base_branch as string,
      additions: row.additions as number,
      deletions: row.deletions as number,
      reviewDecision: (row.review_decision as string) ?? null,
      isDraft: (row.is_draft as number) === 1,
      url: row.url as string,
      repo: {
        owner: row.repo_owner as string,
        repo: row.repo_name as string,
        fullName: row.repo_full_name as string,
        projectPath: row.project_path as string,
      },
    }))
  }

  private pushUnseenCount(): void {
    const count = this.getUnseenCount()
    this.window?.webContents.send(IPC.PR_POLL_UNSEEN_COUNT, { count })
  }
}

export const prPollingService = new PrPollingService()
