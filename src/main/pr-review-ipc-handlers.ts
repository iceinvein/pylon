import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { ReviewFinding, ReviewFocus } from '../shared/types'
import { prPollingService } from './pr-polling-service'
import { sessionManager } from './session-manager'

export function registerPrReviewIpcHandlers(): void {
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

  ipcMain.handle(
    IPC.GH_START_REVIEW,
    async (
      _e,
      args: {
        repo: { owner: string; repo: string; fullName: string; projectPath: string }
        prNumber: number
        prTitle: string
        prUrl: string
        focus: string[]
      },
    ) => {
      const { prReviewManager } = await import('./pr-review-manager')
      return prReviewManager.startReview(
        args.repo,
        args.prNumber,
        args.prTitle,
        args.prUrl,
        args.focus as ReviewFocus[],
      )
    },
  )

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

  ipcMain.handle(
    IPC.GH_SAVE_FINDINGS,
    async (_e, args: { reviewId: string; findings: ReviewFinding[] }) => {
      const { prReviewManager } = await import('./pr-review-manager')
      prReviewManager.saveFindings(args.reviewId, args.findings)
      return true
    },
  )

  ipcMain.handle(IPC.GH_GET_AGENT_PROMPTS, async () => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getAgentPrompts()
  })

  ipcMain.handle(IPC.GH_RESET_AGENT_PROMPT, async (_e, args: { focus: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    prReviewManager.resetAgentPrompt(args.focus)
    return true
  })

  // ── PR Polling ──

  ipcMain.handle(IPC.PR_POLL_MARK_SEEN, async (_e, args: { repo: string; prNumber: number }) => {
    prPollingService.markSeen(args.repo, args.prNumber)
  })

  ipcMain.handle(IPC.PR_POLL_GET_CACHED, async (_e, args: { repo?: string }) => {
    return prPollingService.getCachedPrs(args.repo)
  })

  ipcMain.handle(IPC.PR_POLL_FORCE, async () => {
    await prPollingService.forcePoll()
  })

  ipcMain.handle(
    IPC.GH_POST_COMMENT,
    async (_e, args: { repo: string; number: number; body: string }) => {
      const { postComment } = await import('./gh-cli')
      await postComment(args.repo, args.number, args.body)
      return true
    },
  )

  ipcMain.handle(
    IPC.GH_POST_REVIEW,
    async (
      _e,
      args: { repo: string; number: number; findings: ReviewFinding[]; commitId: string },
    ) => {
      const { postReview, getHeadCommitSha } = await import('./gh-cli')
      const commitId =
        args.commitId || (await getHeadCommitSha(args.repo, args.number).catch(() => ''))
      await postReview(args.repo, args.number, args.findings, commitId)
      const { prReviewManager } = await import('./pr-review-manager')
      for (const f of args.findings) {
        prReviewManager.markFindingPosted(f.id)
      }
      return true
    },
  )

  // ── PR Raise ──

  ipcMain.handle(IPC.GH_RAISE_PR_INFO, async (_e, args: { sessionId: string }) => {
    return sessionManager.getRaisePrInfo(args.sessionId)
  })

  ipcMain.handle(IPC.GH_RAISE_PR_GENERATE_DESCRIPTION, async (_e, args: { sessionId: string }) => {
    return sessionManager.generatePrDescription(args.sessionId)
  })

  ipcMain.handle(
    IPC.GH_RAISE_PR_CREATE,
    async (
      _e,
      args: {
        sessionId: string
        title: string
        body: string
        baseBranch: string
        squash: boolean
      },
    ) => {
      return sessionManager.raisePr(args)
    },
  )
}
