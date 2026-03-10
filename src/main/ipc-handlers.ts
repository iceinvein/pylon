import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { IPC } from '../shared/ipc-channels'
import { getDb } from './db'
import { sessionManager } from './session-manager'
import type { AppSettings, PermissionMode, PermissionResponse, QuestionResponse, ReviewFinding, ReviewFocus } from '../shared/types'
import { log } from '../shared/logger'
const logger = log.child('ipc')

const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: 'claude-opus-4-6',
  defaultPermissionMode: 'default',
  theme: 'dark',
}

function getSettings(): AppSettings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, string> = {}
  for (const row of rows) {
    stored[row.key] = row.value
  }
  return {
    defaultModel: stored.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
    defaultPermissionMode: (stored.defaultPermissionMode as PermissionMode) ?? DEFAULT_SETTINGS.defaultPermissionMode,
    theme: 'dark',
  }
}

function updateSetting(key: string, value: unknown): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SESSION_CREATE, async (_e, args: { cwd: string; model?: string; useWorktree?: boolean }) => {
    return sessionManager.createSession(args.cwd, args.model, args.useWorktree)
  })

  ipcMain.handle(IPC.SESSION_SEND, async (_e, args: {
    sessionId: string; text: string;
    attachments?: Array<{ type: string; content: string; mediaType?: string; name?: string }>
  }) => {
    sessionManager.sendMessage(args.sessionId, args.text, args.attachments).catch((err) => logger.error('SESSION_SEND failed:', err))
    return true
  })

  ipcMain.handle(IPC.SESSION_STOP, async (_e, args: { sessionId: string }) => {
    await sessionManager.stopSession(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.SESSION_RESUME, async (_e, args: { sessionId: string }) => {
    const success = sessionManager.resumeSession(args.sessionId)
    if (success) {
      const db = getDb()
      const row = db.prepare('SELECT title, status FROM sessions WHERE id = ?').get(args.sessionId) as { title: string; status: string } | undefined
      return { success: true, title: row?.title ?? '', status: row?.status ?? 'done' }
    }
    return { success: false, title: '', status: 'done' }
  })

  ipcMain.handle(IPC.SESSION_LIST, async () => {
    return sessionManager.getStoredSessions()
  })

  ipcMain.handle(IPC.SESSION_MESSAGES, async (_e, args: { sessionId: string }) => {
    return sessionManager.getSessionMessages(args.sessionId)
  })

  ipcMain.handle(IPC.SESSION_DELETE, async (_e, args: { sessionId: string }) => {
    await sessionManager.deleteSession(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.FOLDER_OPEN, async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.FOLDER_CHECK_GIT_STATUS, async (_e, args: { path: string }) => {
    return sessionManager.checkRepoStatus(args.path)
  })

  ipcMain.handle(IPC.FOLDER_LIST_PROJECTS, async () => {
    return sessionManager.getProjectFolders()
  })

  ipcMain.handle(IPC.FILE_READ_BASE64, async (_e, args: { path: string }) => {
    const buffer = await readFile(args.path)
    return buffer.toString('base64')
  })

  ipcMain.handle(IPC.FILE_READ_PLAN, async (_e, args: { path: string }) => {
    // Security: only allow reading plan/design files
    const p = args.path.toLowerCase()
    const isInPlansDir = p.includes('/plans/') || p.includes('/specs/')
    const hasPlanSuffix = p.endsWith('-plan.md') || p.endsWith('-design.md')
    if (!isInPlansDir && !hasPlanSuffix) {
      throw new Error('Not a plan file path')
    }
    const buffer = await readFile(args.path)
    return buffer.toString('utf-8')
  })

  ipcMain.handle(IPC.PERMISSION_RESPONSE, async (_e, response: PermissionResponse) => {
    sessionManager.resolvePermission(response)
    return true
  })

  ipcMain.handle(IPC.QUESTION_RESPONSE, async (_e, response: QuestionResponse) => {
    sessionManager.resolveQuestion(response)
    return true
  })

  ipcMain.handle(IPC.SESSION_SET_MODEL, async (_e, args: { sessionId: string; model: string }) => {
    sessionManager.setModel(args.sessionId, args.model)
    return true
  })

  ipcMain.handle(IPC.SESSION_SET_PERMISSION_MODE, async (_e, args: { sessionId: string; mode: PermissionMode }) => {
    sessionManager.setPermissionMode(args.sessionId, args.mode)
    return true
  })

  ipcMain.handle(IPC.SESSION_GET_INFO, async (_e, args: { sessionId: string }) => {
    return sessionManager.getSessionInfo(args.sessionId)
  })

  ipcMain.handle(IPC.SESSION_FILE_DIFFS, async (_e, args: { sessionId: string; filePaths: string[] }) => {
    return sessionManager.getFileDiffs(args.sessionId, args.filePaths)
  })

  ipcMain.handle(IPC.SESSION_FILE_STATUSES, async (_e, args: { sessionId: string; filePaths: string[] }) => {
    return sessionManager.getFileStatuses(args.sessionId, args.filePaths)
  })

  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return getSettings()
  })

  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, args: { key: string; value: unknown }) => {
    updateSetting(args.key, args.value)
    return true
  })

  ipcMain.handle(IPC.WORKTREE_MERGE_CLEANUP, async (_e, args: { sessionId: string }) => {
    return sessionManager.mergeAndCleanupWorktree(args.sessionId)
  })

  ipcMain.handle(IPC.WORKTREE_DISCARD_CLEANUP, async (_e, args: { sessionId: string }) => {
    await sessionManager.removeWorktree(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.WORKTREE_INFO, async (_e, args: { sessionId: string }) => {
    return sessionManager.getWorktreeInfo(args.sessionId)
  })

  // ── PR Review ──

  ipcMain.handle(IPC.GH_CHECK_STATUS, async () => {
    const { checkGhStatus } = await import('./gh-cli')
    return checkGhStatus()
  })

  ipcMain.handle(IPC.GH_SET_PATH, async (_e, args: { path: string }) => {
    const { setGhPath, checkGhStatus } = await import('./gh-cli')
    await setGhPath(args.path)
    return checkGhStatus()
  })

  ipcMain.handle(IPC.GH_LIST_REPOS, async () => {
    const { discoverRepos } = await import('./gh-cli')
    const projects = sessionManager.getProjectFolders()
    const paths = projects.map((p: { path: string }) => p.path)
    return discoverRepos(paths)
  })

  ipcMain.handle(IPC.GH_LIST_PRS, async (_e, args: { repo: string; state?: string }) => {
    const { listPrs } = await import('./gh-cli')
    return listPrs(args.repo, args.state)
  })

  ipcMain.handle(IPC.GH_PR_DETAIL, async (_e, args: { repo: string; number: number }) => {
    const { getPrDetail } = await import('./gh-cli')
    return getPrDetail(args.repo, args.number)
  })

  ipcMain.handle(IPC.GH_START_REVIEW, async (_e, args: {
    repo: { owner: string; repo: string; fullName: string; projectPath: string }
    prNumber: number
    prTitle: string
    prUrl: string
    focus: string[]
  }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.startReview(args.repo, args.prNumber, args.prTitle, args.prUrl, args.focus as ReviewFocus[])
  })

  ipcMain.handle(IPC.GH_STOP_REVIEW, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.stopReview(args.reviewId)
    return true
  })

  ipcMain.handle(IPC.GH_LIST_REVIEWS, async (_e, args: { repo?: string; prNumber?: number }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.listReviews(args.repo, args.prNumber)
  })

  ipcMain.handle(IPC.GH_GET_REVIEW, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getReview(args.reviewId)
  })

  ipcMain.handle(IPC.GH_DELETE_REVIEW, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.deleteReview(args.reviewId)
    return true
  })

  ipcMain.handle(IPC.GH_SAVE_FINDINGS, async (_e, args: { reviewId: string; findings: ReviewFinding[] }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.saveFindings(args.reviewId, args.findings)
    return true
  })

  ipcMain.handle(IPC.GH_GET_AGENT_PROMPTS, async () => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getAgentPrompts()
  })

  ipcMain.handle(IPC.GH_RESET_AGENT_PROMPT, async (_e, args: { focus: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.resetAgentPrompt(args.focus)
    return true
  })

  ipcMain.handle(IPC.GH_POST_COMMENT, async (_e, args: { repo: string; number: number; body: string }) => {
    const { postComment } = await import('./gh-cli')
    await postComment(args.repo, args.number, args.body)
    return true
  })

  ipcMain.handle(IPC.GH_POST_REVIEW, async (_e, args: { repo: string; number: number; findings: ReviewFinding[]; commitId: string }) => {
    const { postReview, getHeadCommitSha } = await import('./gh-cli')
    const commitId = args.commitId || await getHeadCommitSha(args.repo, args.number).catch(() => '')
    await postReview(args.repo, args.number, args.findings, commitId)
    const { prReviewManager } = await import('./pr-review-manager')
    for (const f of args.findings) {
      prReviewManager.markFindingPosted(f.id)
    }
    return true
  })

  ipcMain.handle(IPC.USAGE_STATS, async (_e, args: { period: string }) => {
    const db = getDb()
    const now = Date.now()
    const periodMs: Record<string, number> = {
      '7d': 7 * 86_400_000,
      '30d': 30 * 86_400_000,
      '90d': 90 * 86_400_000,
    }
    const cutoff = args.period === 'all' ? 0 : now - (periodMs[args.period] ?? periodMs['30d'])

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(total_cost_usd), 0) as totalCost,
        COUNT(*) as sessionCount,
        COALESCE(AVG(total_cost_usd), 0) as avgCostPerSession,
        COALESCE(SUM(input_tokens), 0) as totalInput,
        COALESCE(SUM(output_tokens), 0) as totalOutput
      FROM sessions WHERE created_at >= ?
    `).get(cutoff) as {
      totalCost: number
      sessionCount: number
      avgCostPerSession: number
      totalInput: number
      totalOutput: number
    }

    const dailyCosts = db.prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch') as day,
        SUM(total_cost_usd) as cost
      FROM sessions WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `).all(cutoff) as Array<{ day: string; cost: number }>

    const costByModel = db.prepare(`
      SELECT
        model,
        SUM(total_cost_usd) as cost,
        COUNT(*) as sessions
      FROM sessions WHERE created_at >= ?
      GROUP BY model ORDER BY cost DESC
    `).all(cutoff) as Array<{ model: string; cost: number; sessions: number }>

    const costByProject = db.prepare(`
      SELECT
        COALESCE(original_cwd, cwd) as project,
        SUM(total_cost_usd) as cost,
        COUNT(*) as sessions,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens
      FROM sessions WHERE created_at >= ?
      GROUP BY project ORDER BY cost DESC
    `).all(cutoff) as Array<{
      project: string; cost: number; sessions: number
      inputTokens: number; outputTokens: number
    }>

    const tokensByDay = db.prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch') as day,
        SUM(input_tokens) as input,
        SUM(output_tokens) as output
      FROM sessions WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `).all(cutoff) as Array<{ day: string; input: number; output: number }>

    const topSessions = db.prepare(`
      SELECT
        id, title, model, total_cost_usd as cost,
        input_tokens as inputTokens, output_tokens as outputTokens,
        created_at as createdAt
      FROM sessions WHERE created_at >= ? AND total_cost_usd > 0
      ORDER BY total_cost_usd DESC LIMIT 10
    `).all(cutoff) as Array<{
      id: string; title: string; model: string; cost: number
      inputTokens: number; outputTokens: number; createdAt: number
    }>

    return { summary, dailyCosts, costByModel, costByProject, tokensByDay, topSessions }
  })
}
