import { create } from 'zustand'
import type {
  GhCliStatus, GhRepo, GhPullRequest, GhPrDetail,
  PrReview, ReviewFinding, ReviewFocus
} from '../../../shared/types'

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
      severity: (f.severity as ReviewFinding['severity']) || 'suggestion',
      title: String(f.title || ''),
      description: String(f.description || ''),
      domain: (f.domain as ReviewFocus) ?? null,
      posted: false,
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
  prs: GhPullRequest[]
  prsLoading: boolean
  selectedPr: GhPullRequest | null
  prDetail: GhPrDetail | null
  prDetailLoading: boolean
  reviews: PrReview[]
  activeReview: PrReview | null
  activeFindings: ReviewFinding[]
  reviewStreamingText: string
  selectedFindingIds: Set<string>
  agentProgress: Array<{ agentId: string; status: string; findingsCount: number; error?: string }>
  _loadPrsSeq: number
  _selectPrSeq: number

  checkGhStatus: () => Promise<void>
  setGhPath: (path: string) => Promise<void>
  loadRepos: () => Promise<void>
  setSelectedRepo: (repo: string | null) => void
  loadPrs: (repo?: string) => Promise<void>
  selectPr: (pr: GhPullRequest | null) => Promise<void>
  loadPrReviews: (repo: string, prNumber: number) => Promise<void>
  startReview: (repo: GhRepo, pr: GhPullRequest, focus: ReviewFocus[]) => Promise<void>
  stopReview: (reviewId: string) => Promise<void>
  loadReview: (reviewId: string) => Promise<void>
  deleteReview: (reviewId: string) => Promise<void>
  toggleFinding: (findingId: string) => void
  selectAllFindings: () => void
  clearFindingSelection: () => void
  postFinding: (finding: ReviewFinding, repo: string, prNumber: number) => Promise<void>
  postSelectedAsReview: (repo: string, prNumber: number) => Promise<void>
  postAllAsReview: (repo: string, prNumber: number) => Promise<void>
  handleReviewUpdate: (data: { reviewId: string; status: string; findings?: ReviewFinding[]; streamingText?: string; error?: string }) => void
}

export const usePrReviewStore = create<PrReviewStore>((set, get) => ({
  ghStatus: null,
  ghStatusLoading: false,
  repos: [],
  reposLoading: false,
  selectedRepo: null,
  prs: [],
  prsLoading: false,
  selectedPr: null,
  prDetail: null,
  prDetailLoading: false,
  reviews: [],
  activeReview: null,
  activeFindings: [],
  reviewStreamingText: '',
  selectedFindingIds: new Set(),
  agentProgress: [],
  _loadPrsSeq: 0,
  _selectPrSeq: 0,

  checkGhStatus: async () => {
    set({ ghStatusLoading: true })
    try {
      const status = await window.api.checkGhStatus()
      set({ ghStatus: status, ghStatusLoading: false })
    } catch (err) {
      console.error('checkGhStatus failed:', err)
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
      set({ repos, reposLoading: false })
    } catch (err) {
      console.error('loadRepos failed:', err)
      set({ reposLoading: false })
    }
  },

  setSelectedRepo: (repo) => {
    set({ selectedRepo: repo, selectedPr: null, prDetail: null, activeReview: null, activeFindings: [], reviewStreamingText: '', reviews: [], agentProgress: [] })
    get().loadPrs(repo ?? undefined)
  },

  loadPrs: async (repo) => {
    const seq = get()._loadPrsSeq + 1
    set({ prsLoading: true, _loadPrsSeq: seq })
    try {
      if (repo) {
        const prs = await window.api.listGhPrs(repo)
        const repos = get().repos
        const repoInfo = repos.find((r) => r.fullName === repo)
        const prsWithRepo = prs.map((pr) => ({ ...pr, repo: repoInfo ?? pr.repo }))
        if (get()._loadPrsSeq !== seq) return
        set({ prs: prsWithRepo, prsLoading: false })
      } else {
        const repos = get().repos
        const allPrs: GhPullRequest[] = []
        for (const r of repos) {
          try {
            const prs = await window.api.listGhPrs(r.fullName)
            allPrs.push(...prs.map((pr) => ({ ...pr, repo: r })))
          } catch {
            // skip repos that fail
          }
        }
        if (get()._loadPrsSeq !== seq) return
        allPrs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        set({ prs: allPrs, prsLoading: false })
      }
    } catch (err) {
      console.error('loadPrs failed:', err)
      if (get()._loadPrsSeq === seq) {
        set({ prsLoading: false })
      }
    }
  },

  selectPr: async (pr) => {
    const seq = get()._selectPrSeq + 1
    set({ selectedPr: pr, prDetail: null, activeReview: null, activeFindings: [], reviewStreamingText: '', selectedFindingIds: new Set(), agentProgress: [], _selectPrSeq: seq })
    if (!pr) return
    set({ prDetailLoading: true })
    try {
      const detail = await window.api.getGhPrDetail(pr.repo.fullName, pr.number)
      if (get()._selectPrSeq !== seq) return
      detail.repo = pr.repo
      set({ prDetail: detail, prDetailLoading: false })
    } catch (err) {
      console.error('selectPr failed:', err)
      if (get()._selectPrSeq === seq) {
        set({ prDetailLoading: false })
      }
    }
    if (get()._selectPrSeq === seq) {
      get().loadPrReviews(pr.repo.fullName, pr.number)
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
      console.error('loadPrReviews failed:', err)
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
      })
      set((s) => ({
        activeReview: review,
        activeFindings: [],
        reviewStreamingText: '',
        selectedFindingIds: new Set(),
        agentProgress: [],
        // Add to reviews list so it shows in history
        reviews: [review, ...s.reviews],
      }))
    } catch (err) {
      console.error('startReview failed:', err)
    }
  },

  stopReview: async (reviewId) => {
    try {
      await window.api.stopGhReview(reviewId)
      set((s) => ({
        activeReview: s.activeReview?.id === reviewId
          ? { ...s.activeReview, status: 'error' }
          : s.activeReview,
        reviewStreamingText: '',
        agentProgress: [],
        reviews: s.reviews.map((r) =>
          r.id === reviewId ? { ...r, status: 'error' as const } : r
        ),
      }))
    } catch (err) {
      console.error('stopReview failed:', err)
    }
  },

  loadReview: async (reviewId) => {
    try {
      const review = await window.api.getGhReview(reviewId)
      if (!review) return
      const rawOutput = (review as any).rawOutput ?? ''
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
        selectedFindingIds: new Set(),
        agentProgress: [],
      })
    } catch (err) {
      console.error('loadReview failed:', err)
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
      }))
    } catch (err) {
      console.error('deleteReview failed:', err)
    }
  },

  toggleFinding: (findingId) => {
    set((s) => {
      const next = new Set(s.selectedFindingIds)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return { selectedFindingIds: next }
    })
  },

  selectAllFindings: () => {
    const { activeFindings } = get()
    set({ selectedFindingIds: new Set(activeFindings.filter((f) => !f.posted).map((f) => f.id)) })
  },

  clearFindingSelection: () => set({ selectedFindingIds: new Set() }),

  postFinding: async (finding, repo, prNumber) => {
    try {
      const icon = finding.severity === 'critical' ? '🔴' : finding.severity === 'warning' ? '🟡' : finding.severity === 'suggestion' ? '🔵' : '⚪'
      const body = `### ${icon} ${finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}: ${finding.title}\n\n${finding.file ? `**File:** \`${finding.file}${finding.line ? `:${finding.line}` : ''}\`\n\n` : ''}${finding.description}\n\n---\n*Reviewed by Pylon*`
      await window.api.postGhComment(repo, prNumber, body)
      set((s) => ({
        activeFindings: s.activeFindings.map((f) =>
          f.id === finding.id ? { ...f, posted: true } : f
        ),
      }))
    } catch (err) {
      console.error('postFinding failed:', err)
    }
  },

  postSelectedAsReview: async (repo, prNumber) => {
    try {
      const { activeFindings, selectedFindingIds } = get()
      const selected = activeFindings.filter((f) => selectedFindingIds.has(f.id) && !f.posted)
      if (selected.length === 0) return
      await window.api.postGhReview(repo, prNumber, selected, '')
      set((s) => ({
        activeFindings: s.activeFindings.map((f) =>
          selectedFindingIds.has(f.id) ? { ...f, posted: true } : f
        ),
        selectedFindingIds: new Set(),
      }))
    } catch (err) {
      console.error('postSelectedAsReview failed:', err)
    }
  },

  postAllAsReview: async (repo, prNumber) => {
    try {
      const { activeFindings } = get()
      const unposted = activeFindings.filter((f) => !f.posted)
      if (unposted.length === 0) return
      await window.api.postGhReview(repo, prNumber, unposted, '')
      set((s) => ({
        activeFindings: s.activeFindings.map((f) => ({ ...f, posted: true })),
        selectedFindingIds: new Set(),
      }))
    } catch (err) {
      console.error('postAllAsReview failed:', err)
    }
  },

  handleReviewUpdate: (data) => {
    set((s) => {
      if (s.activeReview?.id !== data.reviewId) return s

      const updatedReview = { ...s.activeReview, status: data.status as PrReview['status'] }
      const updates: Partial<PrReviewStore> = {
        activeReview: updatedReview,
      }

      // Update streaming text during 'running'
      if (data.streamingText !== undefined) {
        updates.reviewStreamingText = data.streamingText
      }

      // Update agent progress if present
      if ((data as any).agentProgress) {
        updates.agentProgress = (data as any).agentProgress
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
        updates.agentProgress = (data as any).agentProgress ?? []
      }

      // Update the review in the reviews list
      if (data.status === 'done' || data.status === 'error') {
        updates.reviews = s.reviews.map((r) =>
          r.id === data.reviewId ? { ...r, status: data.status as PrReview['status'] } : r
        )
      }

      return updates
    })
  },
}))
