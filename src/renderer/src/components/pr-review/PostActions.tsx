import { Check, CheckCheck, Loader2, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isPostableFinding } from '../../lib/pr-review-findings'
import { shouldShowFindingByDefault } from '../../lib/pr-review-presentation'
import { usePrReviewStore } from '../../store/pr-review-store'

type Props = {
  repoFullName: string
  prNumber: number
}

const SEVERITY_PILLS = [
  {
    key: 'blocker',
    label: 'Blocker',
    activeClass:
      'bg-[var(--color-error)]/20 text-[var(--color-error)] border-[var(--color-error)]/30',
    inactiveClass:
      'text-[var(--color-error)]/50 border-[var(--color-base-border)] hover:border-[var(--color-error)]/30 hover:text-[var(--color-error)]',
  },
  {
    key: 'high',
    label: 'High',
    activeClass:
      'bg-[var(--color-risk-high)]/15 text-[var(--color-risk-high)] border-[var(--color-risk-high)]/30',
    inactiveClass:
      'text-[var(--color-risk-high)]/50 border-[var(--color-base-border)] hover:border-[var(--color-risk-high)]/30 hover:text-[var(--color-risk-high)]',
  },
  {
    key: 'medium',
    label: 'Medium',
    activeClass:
      'bg-[var(--color-risk-medium)]/20 text-[var(--color-risk-medium)] border-[var(--color-risk-medium)]/30',
    inactiveClass:
      'text-[var(--color-risk-medium)]/50 border-[var(--color-base-border)] hover:border-[var(--color-risk-medium)]/30 hover:text-[var(--color-risk-medium)]',
  },
  {
    key: 'low',
    label: 'Low',
    activeClass:
      'bg-[var(--color-base-text-muted)]/20 text-[var(--color-base-text-secondary)] border-[var(--color-base-text-muted)]/30',
    inactiveClass:
      'text-[var(--color-base-text-muted)]/50 border-[var(--color-base-border)] hover:border-[var(--color-base-text-muted)]/30 hover:text-[var(--color-base-text-secondary)]',
  },
] as const

export function PostActions({ repoFullName, prNumber }: Props) {
  const {
    activeFindings,
    selectedFindingIds,
    postingBatch,
    lastPostResult,
    selectAllFindings,
    clearFindingSelection,
    toggleSeveritySelection,
    postSelectedAsReview,
    postAllAsReview,
  } = usePrReviewStore()

  // Auto-dismissing success banner
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!lastPostResult) return
    setSuccessMsg(
      `Posted ${lastPostResult.count} finding${lastPostResult.count !== 1 ? 's' : ''} to PR`,
    )
    const timer = setTimeout(() => setSuccessMsg(null), 3000)
    return () => clearTimeout(timer)
  }, [lastPostResult?.timestamp, lastPostResult])

  const { postable, hiddenPostableCount } = useMemo(() => {
    let hidden = 0
    const visible: typeof activeFindings = []
    for (const finding of activeFindings) {
      if (!isPostableFinding(finding)) continue
      if (shouldShowFindingByDefault(finding)) visible.push(finding)
      else hidden++
    }
    return { postable: visible, hiddenPostableCount: hidden }
  }, [activeFindings])
  const selectedCount = [...selectedFindingIds].filter((id) =>
    activeFindings.find((f) => f.id === id && isPostableFinding(f)),
  ).length

  if (postable.length === 0 && !successMsg) return null

  const isPosting = postingBatch !== null

  return (
    <div className="border-base-border-subtle border-t bg-base-bg/80">
      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-success/40 px-5 py-2 text-emerald-400 text-xs">
          <Check size={12} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {postable.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3">
          <button
            type="button"
            onClick={selectedFindingIds.size > 0 ? clearFindingSelection : selectAllFindings}
            disabled={isPosting}
            className="text-base-text-muted text-xs transition-colors hover:text-base-text disabled:pointer-events-none disabled:opacity-30"
          >
            {selectedFindingIds.size > 0 ? 'Deselect all' : 'Select recommended'}
          </button>

          {/* Severity filter pills */}
          <div className="flex items-center gap-1.5">
            {SEVERITY_PILLS.map(({ key, label, activeClass, inactiveClass }) => {
              const count = postable.filter((f) => f.severity === key).length
              if (count === 0) return null
              const matching = postable.filter((f) => f.severity === key)
              const isActive = matching.every((f) => selectedFindingIds.has(f.id))
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => toggleSeveritySelection(key)}
                  disabled={isPosting}
                  className={`rounded-md border px-2 py-0.5 font-medium text-[10px] tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-30 ${isActive ? activeClass : inactiveClass}`}
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => postSelectedAsReview(repoFullName, prNumber)}
            disabled={selectedCount === 0 || isPosting}
            className="flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-base-text text-xs transition-colors hover:border-base-border hover:bg-base-raised disabled:pointer-events-none disabled:opacity-30"
          >
            {postingBatch === 'selected' ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Send size={11} />
            )}
            {postingBatch === 'selected' ? 'Posting...' : `Post Selected (${selectedCount})`}
          </button>

          <button
            type="button"
            onClick={() => postAllAsReview(repoFullName, prNumber)}
            disabled={isPosting}
            className="flex items-center gap-1.5 rounded-lg bg-base-text px-3 py-1.5 font-medium text-base-bg text-xs transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-30"
          >
            {postingBatch === 'all' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCheck size={12} />
            )}
            {postingBatch === 'all' ? 'Posting...' : `Post Recommended (${postable.length})`}
          </button>
          {hiddenPostableCount > 0 && (
            <span className="text-[10px] text-base-text-faint">
              {hiddenPostableCount} suggestion{hiddenPostableCount !== 1 ? 's' : ''} excluded
            </span>
          )}
        </div>
      )}
    </div>
  )
}
