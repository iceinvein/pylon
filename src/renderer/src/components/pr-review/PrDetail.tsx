import { useState } from 'react'
import { GitPullRequest, FileText, User, GitBranch, Loader2, Play, ExternalLink } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { ReviewFocusSelector } from './ReviewFocusSelector'
import { ReviewProgress } from './ReviewProgress'
import { FindingsList } from './FindingsList'
import { PostActions } from './PostActions'
import { ReviewHistory } from './ReviewHistory'
import type { ReviewFocus } from '../../../../shared/types'

export function PrDetail() {
  const { selectedPr, prDetail, prDetailLoading, activeReview, startReview, stopReview } = usePrReviewStore()
  const [focusAreas, setFocusAreas] = useState<ReviewFocus[]>(['general'])

  if (!selectedPr) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Select a PR to review
      </div>
    )
  }

  if (prDetailLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={16} className="animate-spin text-stone-500" />
      </div>
    )
  }

  const pr = prDetail ?? selectedPr
  const isRunning = activeReview?.status === 'running'
  const isDone = activeReview?.status === 'done'

  return (
    <div className="flex h-full flex-col">
      {/* PR Header */}
      <div className="border-b border-stone-800 p-4">
        <div className="flex items-start gap-3">
          <GitPullRequest size={18} className="mt-0.5 flex-shrink-0 text-green-500" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium text-stone-100">{pr.title}</h2>
            <div className="mt-1 flex items-center gap-3 text-xs text-stone-500">
              <span className="flex items-center gap-1">
                <User size={11} /> {pr.author}
              </span>
              <span className="flex items-center gap-1">
                <GitBranch size={11} /> {pr.headBranch} &rarr; {pr.baseBranch}
              </span>
              <span className="text-green-600">+{pr.additions}</span>
              <span className="text-red-600">-{pr.deletions}</span>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-stone-300"
                onClick={(e) => {
                  e.preventDefault()
                  window.open(pr.url, '_blank')
                }}
              >
                <ExternalLink size={11} /> GitHub
              </a>
            </div>
          </div>
        </div>

        {prDetail?.body && (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-stone-900/50 p-3 text-xs leading-relaxed text-stone-400">
            {prDetail.body}
          </div>
        )}

        {prDetail?.files && prDetail.files.length > 0 && (
          <div className="mt-3">
            <details className="group">
              <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-300">
                <FileText size={11} className="mr-1 inline" />
                {prDetail.files.length} files changed
              </summary>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-stone-900/50 p-2">
                {prDetail.files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 py-0.5 text-xs text-stone-400">
                    <span className="flex-1 truncate font-mono">{f.path}</span>
                    <span className="text-green-600">+{f.additions}</span>
                    <span className="text-red-600">-{f.deletions}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Review area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          <ReviewHistory />

          {!isRunning && (
            <div className="space-y-4">
              <ReviewFocusSelector selected={focusAreas} onChange={setFocusAreas} />
              <button
                onClick={() => {
                  if (!selectedPr || !selectedPr.repo) return
                  startReview(selectedPr.repo, selectedPr, focusAreas)
                }}
                disabled={focusAreas.length === 0}
                className="flex items-center gap-2 rounded-lg bg-stone-200 px-4 py-2 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-100 disabled:opacity-30"
              >
                <Play size={14} />
                {isDone ? 'Re-run Review' : 'Start Review'}
              </button>
            </div>
          )}

          {isRunning && activeReview && (
            <ReviewProgress
              reviewId={activeReview.id}
              onStop={() => stopReview(activeReview.id)}
            />
          )}

          {isDone && selectedPr && (
            <FindingsList
              repoFullName={selectedPr.repo.fullName}
              prNumber={selectedPr.number}
            />
          )}
        </div>
      </div>

      {isDone && selectedPr && (
        <PostActions
          repoFullName={selectedPr.repo.fullName}
          prNumber={selectedPr.number}
        />
      )}
    </div>
  )
}
