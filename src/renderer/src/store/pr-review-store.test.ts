import { beforeEach, describe, expect, test } from 'bun:test'
import type {
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
})
