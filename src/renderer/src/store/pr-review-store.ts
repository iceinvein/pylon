import { create } from 'zustand'
import type {
  GhCliStatus, GhRepo, GhPullRequest, GhPrDetail,
  PrReview, ReviewFinding, ReviewFocus
} from '../../../shared/types'

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
  selectedFindingIds: Set<string>
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
  handleReviewUpdate: (data: { reviewId: string; status: string; findings?: ReviewFinding[]; error?: string }) => void
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
  selectedFindingIds: new Set(),
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
    set({ selectedRepo: repo, selectedPr: null, prDetail: null, activeReview: null, activeFindings: [], reviews: [] })
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
    set({ selectedPr: pr, prDetail: null, activeReview: null, activeFindings: [], selectedFindingIds: new Set(), _selectPrSeq: seq })
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
    const reviews = await window.api.listGhReviews(repo, prNumber)
    set({ reviews })
    const latest = reviews.find((r) => r.status === 'done')
    if (latest) {
      get().loadReview(latest.id)
    }
  },

  startReview: async (repo, pr, focus) => {
    const review = await window.api.startGhReview({
      repo,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.url,
      focus,
    })
    set({ activeReview: review, activeFindings: [], selectedFindingIds: new Set() })
  },

  stopReview: async (reviewId) => {
    await window.api.stopGhReview(reviewId)
    set((s) => ({
      activeReview: s.activeReview?.id === reviewId
        ? { ...s.activeReview, status: 'error' }
        : s.activeReview,
    }))
  },

  loadReview: async (reviewId) => {
    const review = await window.api.getGhReview(reviewId)
    if (!review) return
    set({ activeReview: review, activeFindings: review.findings, selectedFindingIds: new Set() })
  },

  deleteReview: async (reviewId) => {
    await window.api.deleteGhReview(reviewId)
    set((s) => ({
      reviews: s.reviews.filter((r) => r.id !== reviewId),
      activeReview: s.activeReview?.id === reviewId ? null : s.activeReview,
      activeFindings: s.activeReview?.id === reviewId ? [] : s.activeFindings,
    }))
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
      return {
        activeReview: { ...s.activeReview, status: data.status as PrReview['status'] },
        activeFindings: data.findings ?? s.activeFindings,
      }
    })
  },
}))
