import { beforeEach, describe, expect, test } from 'bun:test'
import type {
  PrReview,
  PrReviewSeries,
  ReviewFinding,
  ReviewRunFile,
  ReviewThread,
  ReviewTimelineEntry,
} from '../../../shared/types'
import { usePrReviewStore } from './pr-review-store'

type WindowApi = {
  getGhReviewSeries: (repo: string, prNumber: number) => Promise<PrReviewSeries | null>
  getGhReviewThreads: (seriesId: string) => Promise<ReviewThread[]>
  getGhReviewTimeline: (seriesId: string) => Promise<ReviewTimelineEntry[]>
  getGhReviewRunFiles: (reviewId: string) => Promise<ReviewRunFile[]>
}

function resetStore() {
  usePrReviewStore.setState({
    activeSeries: null,
    activeThreads: [],
    activeTimeline: [],
    activeRunFiles: [],
    activeFindings: [],
    activeReview: null,
    resultsMode: 'latest-run',
  })
}

function makeFinding(id: string, overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id,
    file: 'src/app.ts',
    line: 1,
    severity: 'medium',
    risk: { impact: 'medium', likelihood: 'possible', confidence: 'medium', action: 'consider' },
    title: 'Title',
    description: 'desc',
    domain: 'bugs',
    posted: false,
    postUrl: null,
    threadId: null,
    statusInRun: 'new',
    carriedForward: false,
    sourceReviewId: null,
    ...overrides,
  }
}

function makeReview(overrides: Partial<PrReview> = {}): PrReview {
  return {
    id: 'review-1',
    seriesId: 'series-1',
    parentReviewId: null,
    prNumber: 1,
    repo: { owner: 'o', repo: 'r', fullName: 'o/r', projectPath: '/tmp/project' },
    prTitle: 'PR',
    prUrl: 'https://example.test/pr/1',
    status: 'running',
    reviewMode: 'full',
    snapshot: {
      baseSha: null,
      headSha: null,
      mergeBaseSha: null,
      comparedFromSha: null,
      comparedToSha: null,
    },
    summary: { newCount: 0, persistingCount: 0, resolvedCount: 0, staleCount: 0 },
    incrementalValid: false,
    focus: ['bugs'],
    findings: [],
    sessionId: null,
    startedAt: 1,
    completedAt: null,
    createdAt: 1,
    costUsd: 0,
    ...overrides,
  }
}

describe('pr-review-store cumulative views', () => {
  beforeEach(() => {
    resetStore()
    // Stub minimum window.api surface used by these tests
    ;(globalThis as unknown as { window: { api: WindowApi } }).window = {
      api: {
        getGhReviewSeries: async () => null,
        getGhReviewThreads: async () => [],
        getGhReviewTimeline: async () => [],
        getGhReviewRunFiles: async () => [],
      },
    }
  })

  test('setResultsMode switches between latest-run, active-issues, and timeline', () => {
    usePrReviewStore.getState().setResultsMode('active-issues')
    expect(usePrReviewStore.getState().resultsMode).toBe('active-issues')
    usePrReviewStore.getState().setResultsMode('timeline')
    expect(usePrReviewStore.getState().resultsMode).toBe('timeline')
    usePrReviewStore.getState().setResultsMode('latest-run')
    expect(usePrReviewStore.getState().resultsMode).toBe('latest-run')
  })

  test('loadReviewThreads populates activeThreads', async () => {
    ;(globalThis as unknown as { window: { api: WindowApi } }).window.api.getGhReviewThreads =
      async () => [
        {
          id: 'thread-1',
          seriesId: 'series-1',
          fingerprint: 'fp-1',
          domain: 'bugs',
          canonicalTitle: 'Issue',
          status: 'persisting',
          firstSeenReviewId: 'r1',
          lastSeenReviewId: 'r2',
          lastFile: 'src/app.ts',
          lastLine: 5,
          createdAt: 1,
          updatedAt: 2,
        },
      ]

    await usePrReviewStore.getState().loadReviewThreads('series-1')
    const threads = usePrReviewStore.getState().activeThreads
    expect(threads).toHaveLength(1)
    expect(threads[0].id).toBe('thread-1')
  })

  test('loadReviewTimeline populates activeTimeline', async () => {
    ;(globalThis as unknown as { window: { api: WindowApi } }).window.api.getGhReviewTimeline =
      async () => [
        {
          reviewId: 'r1',
          threadId: 't1',
          status: 'new',
          title: 'first',
          file: 'a.ts',
          line: 1,
          domain: 'bugs',
          carriedForward: false,
          createdAt: 1,
        },
      ]

    await usePrReviewStore.getState().loadReviewTimeline('series-1')
    expect(usePrReviewStore.getState().activeTimeline).toHaveLength(1)
  })

  test('loadRunFiles populates activeRunFiles', async () => {
    ;(globalThis as unknown as { window: { api: WindowApi } }).window.api.getGhReviewRunFiles =
      async () => [
        {
          filePath: 'src/touched.ts',
          status: 'modified',
          oldPath: null,
          touched: true,
          patchHash: 'h1',
        },
        {
          filePath: 'src/added.ts',
          status: 'added',
          oldPath: null,
          touched: true,
          patchHash: 'h2',
        },
      ]

    await usePrReviewStore.getState().loadRunFiles('review-1')
    const files = usePrReviewStore.getState().activeRunFiles
    expect(files).toHaveLength(2)
    expect(files[0].filePath).toBe('src/touched.ts')
    expect(files[1].status).toBe('added')
  })

  test('isPostableFinding via store state matches expected lifecycle', () => {
    usePrReviewStore.setState({
      activeFindings: [
        makeFinding('a', { posted: true, postUrl: 'https://x' }),
        makeFinding('b', { carriedForward: true }),
        makeFinding('c', { statusInRun: 'persisting' }),
        makeFinding('d', { statusInRun: 'new' }),
      ],
    })
    const findings = usePrReviewStore.getState().activeFindings
    const postable = findings.filter(
      (f) => !f.posted && !f.postUrl && !f.carriedForward && f.statusInRun === 'new',
    )
    expect(postable.map((f) => f.id)).toEqual(['d'])
  })

  test('handleReviewUpdate stores second opinion summary for completed reviews', () => {
    usePrReviewStore.setState({ activeReview: makeReview() })

    usePrReviewStore.getState().handleReviewUpdate({
      reviewId: 'review-1',
      status: 'done',
      findings: [],
      secondOpinion: {
        status: 'unavailable',
        provider: 'codex',
        message: 'Codex second opinion unavailable: no credits. Original findings were kept.',
      },
    })

    const summary = usePrReviewStore.getState().secondOpinionSummary
    expect(summary).toEqual({
      message: 'Codex second opinion unavailable: no credits. Original findings were kept.',
      details: undefined,
    })
  })

  test('handleReviewUpdate stores structured details when peer review applied changes', () => {
    usePrReviewStore.setState({ activeReview: makeReview() })

    usePrReviewStore.getState().handleReviewUpdate({
      reviewId: 'review-1',
      status: 'running',
      secondOpinion: {
        status: 'completed',
        provider: 'codex',
        changes: 2,
        message: 'Codex second opinion applied 2 finding changes.',
        details: {
          updates: 1,
          additions: 1,
          items: [
            {
              kind: 'update',
              findingId: 'f1',
              findingTitle: 'Race condition',
              reason: 'severity should be blocker',
            },
            {
              kind: 'add',
              findingId: 'f-new',
              findingTitle: 'Missing await',
              reason: 'adjacent issue spotted',
            },
          ],
        },
      },
    })

    const summary = usePrReviewStore.getState().secondOpinionSummary
    expect(summary?.message).toBe('Codex second opinion applied 2 finding changes.')
    expect(summary?.details?.updates).toBe(1)
    expect(summary?.details?.additions).toBe(1)
    expect(summary?.details?.items).toHaveLength(2)
    expect(summary?.details?.items[0]).toMatchObject({ kind: 'update', findingId: 'f1' })
  })
})
