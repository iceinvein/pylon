import { create } from 'zustand'
import { log } from '../../../shared/logger'
import type {
  GhCliStatus,
  GhPrDetail,
  GhPrStateFilter,
  GhPullRequest,
  GhRepo,
  PrContextMode,
  PrContextUpdate,
  PrReview,
  PrReviewSeries,
  ReviewFinding,
  ReviewFindingRisk,
  ReviewFindingSeverity,
  ReviewFocus,
  ReviewRunFile,
  ReviewThread,
  ReviewTimelineEntry,
} from '../../../shared/types'
import { isPostableFinding } from '../lib/pr-review-findings'
import { shouldShowFindingByDefault } from '../lib/pr-review-presentation'

const logger = log.child('pr-review-store')

const SEVERITY_ALIASES: Record<string, ReviewFindingSeverity> = {
  blocker: 'blocker',
  blocking: 'blocker',
  critical: 'blocker',
  'must-fix': 'blocker',
  high: 'high',
  error: 'high',
  warning: 'high',
  warn: 'high',
  medium: 'medium',
  suggestion: 'medium',
  consider: 'medium',
  low: 'low',
  info: 'low',
  nitpick: 'low',
  note: 'low',
  optional: 'low',
}

function normalizeSeverity(raw: unknown): ReviewFindingSeverity {
  const str = String(raw || '')
    .toLowerCase()
    .trim()
  return SEVERITY_ALIASES[str] ?? 'medium'
}

function riskFromSeverity(severity: ReviewFindingSeverity): ReviewFindingRisk {
  switch (severity) {
    case 'blocker':
      return { impact: 'critical', likelihood: 'likely', confidence: 'high', action: 'must-fix' }
    case 'high':
      return { impact: 'high', likelihood: 'possible', confidence: 'medium', action: 'should-fix' }
    case 'low':
      return { impact: 'low', likelihood: 'unknown', confidence: 'medium', action: 'optional' }
    default:
      return { impact: 'medium', likelihood: 'possible', confidence: 'medium', action: 'consider' }
  }
}

function normalizeRisk(raw: Record<string, unknown>): ReviewFindingRisk {
  const source =
    raw.risk && typeof raw.risk === 'object' ? (raw.risk as Record<string, unknown>) : raw
  const fallback = riskFromSeverity(normalizeSeverity(raw.severity))
  const impact = String(source.impact ?? fallback.impact)
  const likelihood = String(source.likelihood ?? fallback.likelihood)
  const confidence = String(source.confidence ?? fallback.confidence)
  const action = String(source.action ?? fallback.action)
  return {
    impact:
      impact === 'critical' || impact === 'high' || impact === 'medium' || impact === 'low'
        ? impact
        : fallback.impact,
    likelihood:
      likelihood === 'likely' ||
      likelihood === 'possible' ||
      likelihood === 'edge-case' ||
      likelihood === 'unknown'
        ? likelihood
        : fallback.likelihood,
    confidence:
      confidence === 'high' || confidence === 'medium' || confidence === 'low'
        ? confidence
        : fallback.confidence,
    action:
      action === 'must-fix' ||
      action === 'should-fix' ||
      action === 'consider' ||
      action === 'optional'
        ? action
        : fallback.action,
  }
}

function normalizeSuggestion(raw: Record<string, unknown>): ReviewFinding['suggestion'] {
  const source =
    raw.suggestion && typeof raw.suggestion === 'object'
      ? (raw.suggestion as Record<string, unknown>)
      : raw

  const body = String(
    source.body ??
      source.code ??
      source.snippet ??
      source.suggestedCode ??
      source.suggestionBody ??
      '',
  ).trim()

  const anchorLine = raw.line != null ? Number(raw.line) : null
  const startLine = Number(
    source.startLine ?? source.start_line ?? source.line ?? anchorLine ?? Number.NaN,
  )
  const endLine = Number(
    source.endLine ?? source.end_line ?? source.line ?? anchorLine ?? startLine,
  )

  if (!body || !Number.isFinite(startLine) || !Number.isFinite(endLine)) return undefined

  return {
    body,
    startLine: Math.max(1, Math.trunc(startLine)),
    endLine: Math.max(Math.max(1, Math.trunc(startLine)), Math.trunc(endLine)),
  }
}

/** Parse findings from raw streaming text (client-side fallback when main process fails) */
function parseFindingsFromText(text: string): ReviewFinding[] {
  // Find the review-findings fence
  const fenceMatch = text.match(/`{3,}review-findings/)
  let jsonStr: string | null = null

  if (fenceMatch && fenceMatch.index !== undefined) {
    const jsonStart = text.indexOf('\n', fenceMatch.index) + 1
    let jsonText = text.slice(jsonStart)
    const closingMatch = jsonText.match(/`{3,}/)
    if (closingMatch && closingMatch.index !== undefined) {
      jsonText = jsonText.slice(0, closingMatch.index)
    }
    jsonStr = jsonText.trim()
  }

  // Fallback: find outermost JSON array
  if (!jsonStr) {
    const arrayStart = text.indexOf('[')
    const arrayEnd = text.lastIndexOf(']')
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      jsonStr = text.slice(arrayStart, arrayEnd + 1)
    }
  }

  if (!jsonStr) return []

  try {
    const raw = JSON.parse(jsonStr) as Array<Record<string, unknown>>
    if (!Array.isArray(raw)) return []
    return raw.map((f) => ({
      id: crypto.randomUUID(),
      file: String(f.file || ''),
      line: f.line != null ? Number(f.line) : null,
      severity: normalizeSeverity(f.severity),
      risk: normalizeRisk(f),
      title: String(f.title || ''),
      description: String(f.description || ''),
      domain: (f.domain as ReviewFocus) ?? null,
      posted: false,
      postUrl: null,
      threadId: null,
      statusInRun: 'new',
      carriedForward: false,
      sourceReviewId: null,
      suggestion: normalizeSuggestion(f),
    }))
  } catch {
    return []
  }
}

type PrReviewStore = {
  ghStatus: GhCliStatus | null
  ghStatusLoading: boolean
  repos: GhRepo[]
  reposLoading: boolean
  selectedRepo: string | null
  prStateFilter: GhPrStateFilter
  prs: GhPullRequest[]
  prsLoading: boolean
  selectedPr: GhPullRequest | null
  prDetail: GhPrDetail | null
  prDetailLoading: boolean
  prDetailError: string | null
  activeSeries: PrReviewSeries | null
  activeThreads: ReviewThread[]
  activeTimeline: ReviewTimelineEntry[]
  activeRunFiles: ReviewRunFile[]
  reviews: PrReview[]
  activeReview: PrReview | null
  activeFindings: ReviewFinding[]
  reviewStreamingText: string
  reviewError: string | null
  selectedFindingIds: Set<string>
  postingFindingIds: Set<string>
  postingBatch: 'selected' | 'all' | null
  lastPostResult: { count: number; timestamp: number } | null
  agentProgress: Array<{
    agentId: string
    status: string
    findingsCount: number
    error?: string
    currentChunk?: number
    totalChunks?: number
  }>
  _loadPrsSeq: number
  _selectPrSeq: number
  unseenCount: number
  resultsMode: 'latest-run' | 'active-issues' | 'timeline'
  findingsViewMode: 'files' | 'all-issues'
  severityFilter: Set<ReviewFindingSeverity>
  navigateToFindingId: string | null

  // Context build tracking (per active review)
  contextPhase?: 'building' | 'done' | 'fallback' | 'error'
  contextMode?: PrContextMode
  contextNotes?: string[]
  contextError?: string

  checkGhStatus: () => Promise<void>
  setGhPath: (path: string) => Promise<void>
  loadRepos: () => Promise<void>
  setSelectedRepo: (repo: string | null) => void
  setPrStateFilter: (state: GhPrStateFilter) => void
  loadPrs: (repo?: string, state?: GhPrStateFilter) => Promise<void>
  selectPr: (pr: GhPullRequest | null) => Promise<void>
  loadPrReviews: (repo: string, prNumber: number) => Promise<void>
  loadReviewSeries: (repo: string, prNumber: number) => Promise<void>
  loadReviewThreads: (seriesId: string) => Promise<void>
  loadReviewTimeline: (seriesId: string) => Promise<void>
  loadRunFiles: (reviewId: string) => Promise<void>
  startReview: (repo: GhRepo, pr: GhPullRequest, focus: ReviewFocus[]) => Promise<void>
  stopReview: (reviewId: string) => Promise<void>
  loadReview: (reviewId: string) => Promise<void>
  deleteReview: (reviewId: string) => Promise<void>
  toggleFinding: (findingId: string) => void
  toggleSeveritySelection: (severity: ReviewFindingSeverity) => void
  selectAllFindings: () => void
  clearFindingSelection: () => void
  postFinding: (finding: ReviewFinding, repo: string, prNumber: number) => Promise<void>
  postSelectedAsReview: (repo: string, prNumber: number) => Promise<void>
  postAllAsReview: (repo: string, prNumber: number) => Promise<void>
  handleReviewUpdate: (data: {
    reviewId: string
    status: string
    findings?: ReviewFinding[]
    streamingText?: string
    error?: string
    costUsd?: number
    reviewMode?: PrReview['reviewMode']
    snapshot?: PrReview['snapshot']
    incrementalValid?: boolean
    summary?: PrReview['summary']
    agentProgress?: PrReviewStore['agentProgress']
  }) => void
  setUnseenCount: (count: number) => void
  markPrSeen: (repo: string, prNumber: number) => Promise<void>
  loadCachedPrs: (repo?: string, seq?: number) => Promise<void>
  forcePoll: () => Promise<void>
  setResultsMode: (mode: 'latest-run' | 'active-issues' | 'timeline') => void
  setFindingsViewMode: (mode: 'files' | 'all-issues') => void
  toggleSeverityFilter: (severity: ReviewFindingSeverity) => void
  navigateToFinding: (findingId: string) => void
  clearNavigateToFinding: () => void
  setContextUpdate: (update: PrContextUpdate) => void
}

export const usePrReviewStore = create<PrReviewStore>((set, get) => ({
  ghStatus: null,
  ghStatusLoading: false,
  repos: [],
  reposLoading: false,
  selectedRepo: null,
  prStateFilter: 'open',
  prs: [],
  prsLoading: false,
  selectedPr: null,
  prDetail: null,
  prDetailLoading: false,
  prDetailError: null,
  activeSeries: null,
  activeThreads: [],
  activeTimeline: [],
  activeRunFiles: [],
  reviews: [],
  activeReview: null,
  activeFindings: [],
  reviewStreamingText: '',
  reviewError: null,
  selectedFindingIds: new Set(),
  postingFindingIds: new Set(),
  postingBatch: null,
  lastPostResult: null,
  agentProgress: [],
  _loadPrsSeq: 0,
  _selectPrSeq: 0,
  unseenCount: 0,
  resultsMode: 'latest-run',
  findingsViewMode: 'files',
  severityFilter: new Set(['blocker', 'high', 'medium', 'low']),
  navigateToFindingId: null,

  checkGhStatus: async () => {
    set({ ghStatusLoading: true })
    try {
      const status = await window.api.checkGhStatus()
      set({ ghStatus: status, ghStatusLoading: false })
    } catch (err) {
      logger.error('checkGhStatus failed:', err)
      set({ ghStatusLoading: false })
    }
  },

  setGhPath: async (path) => {
    const status = await window.api.setGhPath(path)
    set({ ghStatus: status })
  },

  loadRepos: async () => {
    set({ reposLoading: true })
    try {
      const repos = await window.api.listGhRepos()
      const selectedRepo = get().selectedRepo
      const shouldResetSelection =
        selectedRepo !== null && !repos.some((repo) => repo.fullName === selectedRepo)

      set({
        repos,
        reposLoading: false,
        ...(shouldResetSelection
          ? {
              selectedRepo: null,
              selectedPr: null,
              prDetail: null,
              prDetailError: null,
              activeSeries: null,
              activeThreads: [],
              activeTimeline: [],
              activeReview: null,
              activeFindings: [],
              reviewStreamingText: '',
              reviewError: null,
              reviews: [],
              agentProgress: [],
            }
          : {}),
      })
    } catch (err) {
      logger.error('loadRepos failed:', err)
      set({ reposLoading: false })
    }
  },

  setSelectedRepo: (repo) => {
    set({
      selectedRepo: repo,
      selectedPr: null,
      prDetail: null,
      prDetailError: null,
      activeSeries: null,
      activeThreads: [],
      activeTimeline: [],
      activeRunFiles: [],
      activeReview: null,
      activeFindings: [],
      reviewStreamingText: '',
      reviewError: null,
      reviews: [],
      agentProgress: [],
      contextPhase: undefined,
      contextMode: undefined,
      contextNotes: undefined,
      contextError: undefined,
    })
    get().loadPrs(repo ?? undefined)
  },

  setPrStateFilter: (state) => {
    if (get().prStateFilter === state) return
    set({
      prStateFilter: state,
      prs: [],
      selectedPr: null,
      prDetail: null,
      prDetailError: null,
      activeSeries: null,
      activeThreads: [],
      activeTimeline: [],
      activeRunFiles: [],
      activeReview: null,
      activeFindings: [],
      reviewStreamingText: '',
      reviewError: null,
      reviews: [],
      agentProgress: [],
      contextPhase: undefined,
      contextMode: undefined,
      contextNotes: undefined,
      contextError: undefined,
    })
    get().loadPrs(get().selectedRepo ?? undefined, state)
  },

  loadPrs: async (repo, requestedState) => {
    const state = requestedState ?? get().prStateFilter
    const seq = get()._loadPrsSeq + 1
    set({
      prsLoading: true,
      _loadPrsSeq: seq,
      ...(state === 'open' ? {} : { prs: [] }),
    })
    if (state === 'open') {
      // Hydrate from cache instantly while we fetch fresh data.
      get().loadCachedPrs(repo, seq)
      // Trigger a background poll to refresh the cache simultaneously.
      get().forcePoll()
    }
    try {
      if (repo) {
        const prs = await window.api.listGhPrs(repo, state)
        const repos = get().repos
        const repoInfo = repos.find((r) => r.fullName === repo)
        const prsWithRepo = prs.map((pr) => ({ ...pr, repo: repoInfo ?? pr.repo }))
        if (get()._loadPrsSeq !== seq) return
        set({ prs: prsWithRepo, prsLoading: false })
      } else {
        const repos = get().repos
        const results = await Promise.allSettled(
          repos.map(async (r) => {
            const prs = await window.api.listGhPrs(r.fullName, state)
            return prs.map((pr) => ({ ...pr, repo: r }))
          }),
        )
        const allPrs: GhPullRequest[] = results.flatMap((result) =>
          result.status === 'fulfilled' ? result.value : [],
        )
        if (get()._loadPrsSeq !== seq) return
        allPrs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        set({ prs: allPrs, prsLoading: false })
      }
    } catch (err) {
      logger.error('loadPrs failed:', err)
      if (get()._loadPrsSeq === seq) {
        set({ prsLoading: false })
      }
    }
  },

  selectPr: async (pr) => {
    const seq = get()._selectPrSeq + 1
    set({
      selectedPr: pr,
      prDetail: null,
      prDetailError: null,
      activeReview: null,
      activeFindings: [],
      activeSeries: null,
      activeThreads: [],
      activeTimeline: [],
      activeRunFiles: [],
      reviewStreamingText: '',
      reviewError: null,
      selectedFindingIds: new Set(),
      agentProgress: [],
      _selectPrSeq: seq,
      contextPhase: undefined,
      contextMode: undefined,
      contextNotes: undefined,
      contextError: undefined,
    })
    if (!pr) return
    // Mark PR as seen for badge tracking
    get().markPrSeen(pr.repo.fullName, pr.number)
    set({ prDetailLoading: true })
    try {
      const detail = await window.api.getGhPrDetail(pr.repo.fullName, pr.number)
      if (get()._selectPrSeq !== seq) return
      detail.repo = pr.repo
      set({ prDetail: detail, prDetailLoading: false, prDetailError: null })
    } catch (err) {
      logger.error('selectPr failed:', err)
      if (get()._selectPrSeq === seq) {
        const msg = err instanceof Error ? err.message : String(err)
        set({ prDetailLoading: false, prDetailError: msg })
      }
    }
    if (get()._selectPrSeq === seq) {
      get().loadPrReviews(pr.repo.fullName, pr.number)
      get().loadReviewSeries(pr.repo.fullName, pr.number)
    }
  },

  loadPrReviews: async (repo, prNumber) => {
    try {
      const reviews = await window.api.listGhReviews(repo, prNumber)
      set({ reviews })
      const latest = reviews.find((r) => r.status === 'done')
      if (latest) {
        get().loadReview(latest.id)
      }
    } catch (err) {
      logger.error('loadPrReviews failed:', err)
    }
  },

  loadReviewSeries: async (repo, prNumber) => {
    try {
      const series = await window.api.getGhReviewSeries(repo, prNumber)
      set({ activeSeries: series })
      if (series?.id) {
        get().loadReviewThreads(series.id)
        get().loadReviewTimeline(series.id)
      } else {
        set({ activeThreads: [], activeTimeline: [] })
      }
    } catch (err) {
      logger.error('loadReviewSeries failed:', err)
    }
  },

  loadReviewThreads: async (seriesId) => {
    try {
      const threads = await window.api.getGhReviewThreads(seriesId)
      set({ activeThreads: threads })
    } catch (err) {
      logger.error('loadReviewThreads failed:', err)
    }
  },

  loadReviewTimeline: async (seriesId) => {
    try {
      const timeline = await window.api.getGhReviewTimeline(seriesId)
      set({ activeTimeline: timeline })
    } catch (err) {
      logger.error('loadReviewTimeline failed:', err)
    }
  },

  loadRunFiles: async (reviewId) => {
    try {
      const files = await window.api.getGhReviewRunFiles(reviewId)
      set({ activeRunFiles: files })
    } catch (err) {
      logger.error('loadRunFiles failed:', err)
    }
  },

  startReview: async (repo, pr, focus) => {
    try {
      const review = await window.api.startGhReview({
        repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        focus,
        options: { mode: 'auto', includeRevalidation: true },
      })
      set((s) => ({
        activeReview: review,
        activeFindings: [],
        reviewStreamingText: '',
        reviewError: null,
        selectedFindingIds: new Set(),
        agentProgress: [],
        contextPhase: undefined,
        contextMode: undefined,
        contextNotes: undefined,
        contextError: undefined,
        resultsMode: 'latest-run',
        // Add to reviews list so it shows in history
        reviews: [review, ...s.reviews],
      }))
    } catch (err) {
      logger.error('startReview failed:', err)
    }
  },

  stopReview: async (reviewId) => {
    try {
      await window.api.stopGhReview(reviewId)
      set((s) => ({
        activeReview:
          s.activeReview?.id === reviewId ? { ...s.activeReview, status: 'error' } : s.activeReview,
        reviewStreamingText: '',
        reviewError: 'Review stopped by user',
        agentProgress: [],
        contextPhase: undefined,
        contextMode: undefined,
        contextNotes: undefined,
        contextError: undefined,
        reviews: s.reviews.map((r) => (r.id === reviewId ? { ...r, status: 'error' as const } : r)),
      }))
    } catch (err) {
      logger.error('stopReview failed:', err)
    }
  },

  loadReview: async (reviewId) => {
    try {
      const review = await window.api.getGhReview(reviewId)
      if (!review) return
      const rawOutput =
        (review as PrReview & { findings: ReviewFinding[]; rawOutput?: string }).rawOutput ?? ''
      let findings = review.findings
      // Fallback: if DB has no findings but raw output exists, parse client-side
      if (findings.length === 0 && rawOutput) {
        findings = parseFindingsFromText(rawOutput)
        // Persist client-side parsed findings back to DB for future loads
        if (findings.length > 0) {
          window.api.saveGhFindings(reviewId, findings).catch(() => {})
        }
      }
      set({
        activeReview: review,
        activeFindings: findings,
        reviewStreamingText: rawOutput,
        reviewError: null,
        resultsMode: 'latest-run',
        selectedFindingIds: new Set(),
        agentProgress: [],
        contextPhase: undefined,
        contextMode: undefined,
        contextNotes: undefined,
        contextError: undefined,
      })
      get().loadRunFiles(reviewId)
    } catch (err) {
      logger.error('loadReview failed:', err)
    }
  },

  deleteReview: async (reviewId) => {
    try {
      await window.api.deleteGhReview(reviewId)
      set((s) => ({
        reviews: s.reviews.filter((r) => r.id !== reviewId),
        activeReview: s.activeReview?.id === reviewId ? null : s.activeReview,
        activeFindings: s.activeReview?.id === reviewId ? [] : s.activeFindings,
        reviewStreamingText: s.activeReview?.id === reviewId ? '' : s.reviewStreamingText,
        reviewError: s.activeReview?.id === reviewId ? null : s.reviewError,
      }))
    } catch (err) {
      logger.error('deleteReview failed:', err)
    }
  },

  toggleFinding: (findingId) => {
    set((s) => {
      const finding = s.activeFindings.find((entry) => entry.id === findingId)
      if (!finding || !isPostableFinding(finding)) return s
      const next = new Set(s.selectedFindingIds)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return { selectedFindingIds: next }
    })
  },

  toggleSeveritySelection: (severity) => {
    set((s) => {
      const matching = s.activeFindings.filter(
        (f) => f.severity === severity && isPostableFinding(f) && shouldShowFindingByDefault(f),
      )
      if (matching.length === 0) return s
      const allSelected = matching.every((f) => s.selectedFindingIds.has(f.id))
      const next = new Set(s.selectedFindingIds)
      for (const f of matching) {
        if (allSelected) next.delete(f.id)
        else next.add(f.id)
      }
      return { selectedFindingIds: next }
    })
  },

  selectAllFindings: () => {
    const { activeFindings } = get()
    set({
      selectedFindingIds: new Set(
        activeFindings
          .filter((f) => isPostableFinding(f) && shouldShowFindingByDefault(f))
          .map((f) => f.id),
      ),
    })
  },

  clearFindingSelection: () => set({ selectedFindingIds: new Set() }),

  postFinding: async (finding, repo, prNumber) => {
    if (!isPostableFinding(finding)) return
    set((s) => ({ postingFindingIds: new Set(s.postingFindingIds).add(finding.id) }))
    try {
      await window.api.postGhComment(repo, prNumber, finding)
      set((s) => {
        const next = new Set(s.postingFindingIds)
        next.delete(finding.id)
        return {
          activeFindings: s.activeFindings.map((f) =>
            f.id === finding.id ? { ...f, posted: true } : f,
          ),
          postingFindingIds: next,
          lastPostResult: { count: 1, timestamp: Date.now() },
        }
      })
    } catch (err) {
      logger.error('postFinding failed:', err)
      set((s) => {
        const next = new Set(s.postingFindingIds)
        next.delete(finding.id)
        return { postingFindingIds: next }
      })
    }
  },

  postSelectedAsReview: async (repo, prNumber) => {
    const { activeFindings, selectedFindingIds } = get()
    const selected = activeFindings.filter(
      (f) => selectedFindingIds.has(f.id) && isPostableFinding(f),
    )
    if (selected.length === 0) return
    set({ postingBatch: 'selected' })
    try {
      await window.api.postGhReview(repo, prNumber, selected, '')
      set((s) => ({
        activeFindings: s.activeFindings.map((f) =>
          selectedFindingIds.has(f.id) && isPostableFinding(f) ? { ...f, posted: true } : f,
        ),
        selectedFindingIds: new Set(),
        postingBatch: null,
        lastPostResult: { count: selected.length, timestamp: Date.now() },
      }))
    } catch (err) {
      logger.error('postSelectedAsReview failed:', err)
      set({ postingBatch: null })
    }
  },

  postAllAsReview: async (repo, prNumber) => {
    const { activeFindings } = get()
    const eligible = activeFindings.filter(
      (f) => isPostableFinding(f) && shouldShowFindingByDefault(f),
    )
    if (eligible.length === 0) return
    set({ postingBatch: 'all' })
    try {
      await window.api.postGhReview(repo, prNumber, eligible, '')
      set((s) => ({
        activeFindings: s.activeFindings.map((f) =>
          isPostableFinding(f) ? { ...f, posted: true } : f,
        ),
        selectedFindingIds: new Set(),
        postingBatch: null,
        lastPostResult: { count: eligible.length, timestamp: Date.now() },
      }))
    } catch (err) {
      logger.error('postAllAsReview failed:', err)
      set({ postingBatch: null })
    }
  },

  setUnseenCount: (count) => set({ unseenCount: count }),

  markPrSeen: async (repo, prNumber) => {
    try {
      await window.api.markPrSeen(repo, prNumber)
    } catch (err) {
      logger.error('markPrSeen failed:', err)
    }
  },

  loadCachedPrs: async (repo, seq) => {
    try {
      const cached = await window.api.getCachedPrs(repo)
      if (seq !== undefined && get()._loadPrsSeq !== seq) return
      if (get().prStateFilter !== 'open') return
      if (cached.length > 0) {
        set({ prs: cached, prsLoading: false })
      }
    } catch (err) {
      logger.error('loadCachedPrs failed:', err)
    }
  },

  forcePoll: async () => {
    try {
      await window.api.forcePollPrs()
    } catch (err) {
      logger.error('forcePoll failed:', err)
    }
  },

  setResultsMode: (mode) => set({ resultsMode: mode }),

  setFindingsViewMode: (mode) => set({ findingsViewMode: mode }),

  toggleSeverityFilter: (severity) =>
    set((state) => {
      const next = new Set(state.severityFilter)
      if (next.has(severity)) next.delete(severity)
      else next.add(severity)
      return { severityFilter: next }
    }),

  navigateToFinding: (findingId) => {
    const finding = get().activeFindings.find((f) => f.id === findingId)
    if (!finding) return
    set({
      findingsViewMode: 'files',
      navigateToFindingId: findingId,
    })
  },

  clearNavigateToFinding: () => set({ navigateToFindingId: null }),

  setContextUpdate: (update) => {
    set((s) => {
      // Only apply if the update matches the active review
      if (s.activeReview?.id !== update.reviewId) return s
      return {
        contextPhase: update.phase,
        ...(update.mode !== undefined && { contextMode: update.mode }),
        ...(update.notes !== undefined && { contextNotes: update.notes }),
        ...(update.error !== undefined && { contextError: update.error }),
      }
    })
  },

  handleReviewUpdate: (data) => {
    set((s) => {
      if (s.activeReview?.id !== data.reviewId) return s

      const updatedReview = {
        ...s.activeReview,
        status: data.status as PrReview['status'],
        ...(data.costUsd !== undefined && { costUsd: data.costUsd }),
        ...(data.reviewMode !== undefined && { reviewMode: data.reviewMode }),
        ...(data.snapshot !== undefined && { snapshot: data.snapshot }),
        ...(data.incrementalValid !== undefined && { incrementalValid: data.incrementalValid }),
        ...(data.summary !== undefined && { summary: data.summary }),
      }
      const updates: Partial<PrReviewStore> = {
        activeReview: updatedReview,
      }

      // Update streaming text during 'running'
      if (data.streamingText !== undefined) {
        updates.reviewStreamingText = data.streamingText
      }

      if (data.error !== undefined) {
        updates.reviewError = data.error
      }

      // Update agent progress if present
      if (data.agentProgress) {
        updates.agentProgress = data.agentProgress
      }

      // On error clear streaming text and agent progress; on done keep it (the raw output)
      if (data.status === 'error') {
        updates.reviewStreamingText = ''
        updates.agentProgress = []
      }

      // Update findings when provided (on 'done')
      if (data.status === 'done') {
        let findings = data.findings ?? []
        // Fallback: if main process returned no findings, parse client-side from streaming text
        if (findings.length === 0) {
          const streamText = data.streamingText ?? s.reviewStreamingText
          if (streamText) {
            findings = parseFindingsFromText(streamText)
            // Persist client-side parsed findings back to DB
            if (findings.length > 0) {
              window.api.saveGhFindings(data.reviewId, findings).catch(() => {})
            }
          }
        }
        updates.activeFindings = findings
        updates.agentProgress = data.agentProgress ?? []
        updates.reviewError = null
        updates.findingsViewMode = 'files'
        updates.severityFilter = new Set(['blocker', 'high', 'medium', 'low'])
        updates.navigateToFindingId = null
      }

      // Update the review in the reviews list
      if (data.status === 'done' || data.status === 'error') {
        updates.reviews = s.reviews.map((r) =>
          r.id === data.reviewId
            ? {
                ...r,
                status: data.status as PrReview['status'],
                ...(data.costUsd !== undefined && { costUsd: data.costUsd }),
                ...(data.reviewMode !== undefined && { reviewMode: data.reviewMode }),
                ...(data.snapshot !== undefined && { snapshot: data.snapshot }),
                ...(data.incrementalValid !== undefined && {
                  incrementalValid: data.incrementalValid,
                }),
                ...(data.summary !== undefined && { summary: data.summary }),
              }
            : r,
        )
      }

      return updates
    })

    if (data.status === 'done') {
      const selectedPr = get().selectedPr
      if (selectedPr) {
        get().loadReviewSeries(selectedPr.repo.fullName, selectedPr.number)
      }
    }
  },
}))
