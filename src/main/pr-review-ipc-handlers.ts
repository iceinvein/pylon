import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  GhPrStateFilter,
  ReviewFinding,
  ReviewFocus,
  StartPrReviewOptions,
} from '../shared/types'
import { prPollingService } from './pr-polling-service'
import { sessionManager } from './session-manager'

function normalizePrStateFilter(state?: string): GhPrStateFilter {
  if (state === 'closed' || state === 'merged' || state === 'all') return state
  return 'open'
}

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
    return listPrs(args.repo, normalizePrStateFilter(args.state))
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
        options?: StartPrReviewOptions
      },
    ) => {
      const { prReviewManager } = await import('./pr-review-manager')
      return prReviewManager.startReview(
        args.repo,
        args.prNumber,
        args.prTitle,
        args.prUrl,
        args.focus as ReviewFocus[],
        args.options,
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

  ipcMain.handle(IPC.GH_GET_REVIEW_SERIES, async (_e, args: { repo: string; prNumber: number }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getReviewSeries(args.repo, args.prNumber)
  })

  ipcMain.handle(IPC.GH_GET_REVIEW_THREADS, async (_e, args: { seriesId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getReviewThreads(args.seriesId)
  })

  ipcMain.handle(IPC.GH_GET_REVIEW_TIMELINE, async (_e, args: { seriesId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getReviewTimeline(args.seriesId)
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
    async (
      _e,
      args: {
        repo: string
        number: number
        body?: string
        finding?: ReviewFinding
        reviewId?: string
      },
    ) => {
      const { postComment, postFindingComment } = await import('./gh-cli')
      if (args.finding) {
        const result = await postFindingComment(args.repo, args.number, args.finding)
        const { prReviewManager } = await import('./pr-review-manager')
        prReviewManager.markFindingPosted(args.finding.id)
        const reviewId = args.reviewId ?? prReviewManager.findReviewIdForFinding(args.finding.id)
        if (reviewId) {
          prReviewManager.recordFindingPost({
            findingId: args.finding.id,
            reviewId,
            repoFullName: args.repo,
            prNumber: args.number,
            kind: result.kind,
            body: result.body,
            ghCommentId: result.ghCommentId,
            ghCommentUrl: result.ghCommentUrl,
          })
        }
      } else if (args.body) {
        await postComment(args.repo, args.number, args.body)
      } else {
        throw new Error('Missing comment body or finding')
      }
      return true
    },
  )

  ipcMain.handle(
    IPC.GH_POST_REVIEW,
    async (
      _e,
      args: {
        repo: string
        number: number
        findings: ReviewFinding[]
        commitId: string
        reviewId?: string
      },
    ) => {
      const { postReview, getHeadCommitSha } = await import('./gh-cli')
      const commitId =
        args.commitId || (await getHeadCommitSha(args.repo, args.number).catch(() => ''))
      const result = await postReview(args.repo, args.number, args.findings, commitId)
      const { prReviewManager } = await import('./pr-review-manager')
      const inlineIndexById = new Map(result.inlineFindings.map((f, i) => [f.id, i]))
      for (const f of args.findings) {
        prReviewManager.markFindingPosted(f.id)
        const reviewId = args.reviewId ?? prReviewManager.findReviewIdForFinding(f.id)
        if (!reviewId) continue
        const inlineIdx = inlineIndexById.get(f.id)
        const body =
          inlineIdx !== undefined
            ? (result.inlineCommentBodies[inlineIdx] ?? result.reviewBody)
            : result.reviewBody
        prReviewManager.recordFindingPost({
          findingId: f.id,
          reviewId,
          repoFullName: args.repo,
          prNumber: args.number,
          kind: 'review',
          body,
          ghCommentId: null,
          ghCommentUrl: result.ghReviewUrl,
          ghReviewId: result.ghReviewId,
        })
      }
      return true
    },
  )

  ipcMain.handle(
    IPC.GH_GET_FINDING_POSTS,
    async (_e, args: { threadId?: string; findingId?: string; seriesId?: string }) => {
      const { prReviewManager } = await import('./pr-review-manager')
      return prReviewManager.getFindingPosts(args)
    },
  )

  ipcMain.handle(IPC.GH_GET_REVIEW_RUN_FILES, async (_e, args: { reviewId: string }) => {
    const { prReviewManager } = await import('./pr-review-manager')
    return prReviewManager.getReviewRunFiles(args.reviewId)
  })

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
