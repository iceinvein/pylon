import { Check, CheckCheck, Loader2, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePrReviewStore } from '../../store/pr-review-store'

type Props = {
  repoFullName: string
  prNumber: number
}

const SEVERITY_PILLS = [
  {
    key: 'critical',
    label: 'Critical',
    activeClass: 'bg-red-500/20 text-red-400 border-red-500/30',
    inactiveClass: 'text-red-400/50 border-stone-700 hover:border-red-500/30 hover:text-red-400',
  },
  {
    key: 'warning',
    label: 'Warning',
    activeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    inactiveClass:
      'text-amber-400/50 border-stone-700 hover:border-amber-500/30 hover:text-amber-400',
  },
  {
    key: 'suggestion',
    label: 'Suggestion',
    activeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    inactiveClass: 'text-blue-400/50 border-stone-700 hover:border-blue-500/30 hover:text-blue-400',
  },
  {
    key: 'nitpick',
    label: 'Nitpick',
    activeClass: 'bg-stone-500/20 text-stone-400 border-stone-500/30',
    inactiveClass:
      'text-stone-500/50 border-stone-700 hover:border-stone-500/30 hover:text-stone-400',
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

  const unposted = activeFindings.filter((f) => !f.posted)
  const selectedCount = [...selectedFindingIds].filter((id) =>
    activeFindings.find((f) => f.id === id && !f.posted),
  ).length

  if (unposted.length === 0 && !successMsg) return null

  const isPosting = postingBatch !== null

  return (
    <div className="border-stone-800 border-t bg-stone-950/80">
      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-950/40 px-5 py-2 text-emerald-400 text-xs">
          <Check size={12} className="flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {unposted.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3">
          <button
            type="button"
            onClick={selectedFindingIds.size > 0 ? clearFindingSelection : selectAllFindings}
            disabled={isPosting}
            className="text-stone-500 text-xs transition-colors hover:text-stone-300 disabled:pointer-events-none disabled:opacity-30"
          >
            {selectedFindingIds.size > 0 ? 'Deselect all' : 'Select all'}
          </button>

          {/* Severity filter pills */}
          <div className="flex items-center gap-1.5">
            {SEVERITY_PILLS.map(({ key, label, activeClass, inactiveClass }) => {
              const count = unposted.filter((f) => f.severity === key).length
              if (count === 0) return null
              const matching = unposted.filter((f) => f.severity === key)
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
            className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-1.5 text-stone-300 text-xs transition-colors hover:border-stone-600 hover:bg-stone-800 disabled:pointer-events-none disabled:opacity-30"
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
            className="flex items-center gap-1.5 rounded-lg bg-stone-200 px-3 py-1.5 font-medium text-stone-900 text-xs transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-30"
          >
            {postingBatch === 'all' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCheck size={12} />
            )}
            {postingBatch === 'all' ? 'Posting...' : `Post All (${unposted.length})`}
          </button>
        </div>
      )}
    </div>
  )
}
