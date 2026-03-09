import { Send, CheckCheck } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'

type Props = {
  repoFullName: string
  prNumber: number
}

export function PostActions({ repoFullName, prNumber }: Props) {
  const {
    activeFindings, selectedFindingIds,
    selectAllFindings, clearFindingSelection,
    postSelectedAsReview, postAllAsReview,
  } = usePrReviewStore()

  const unposted = activeFindings.filter((f) => !f.posted)
  const selectedCount = [...selectedFindingIds].filter((id) =>
    activeFindings.find((f) => f.id === id && !f.posted)
  ).length

  if (unposted.length === 0) return null

  return (
    <div className="flex items-center gap-3 border-t border-stone-800 bg-stone-950/80 px-5 py-3">
      <button
        onClick={selectedFindingIds.size > 0 ? clearFindingSelection : selectAllFindings}
        className="text-xs text-stone-500 transition-colors hover:text-stone-300"
      >
        {selectedFindingIds.size > 0 ? 'Deselect all' : 'Select all'}
      </button>

      <div className="flex-1" />

      <button
        onClick={() => postSelectedAsReview(repoFullName, prNumber)}
        disabled={selectedCount === 0}
        className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300 transition-colors hover:border-stone-600 hover:bg-stone-800 disabled:pointer-events-none disabled:opacity-30"
      >
        <Send size={11} />
        Post Selected ({selectedCount})
      </button>

      <button
        onClick={() => postAllAsReview(repoFullName, prNumber)}
        className="flex items-center gap-1.5 rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-medium text-stone-900 transition-colors hover:bg-white"
      >
        <CheckCheck size={12} />
        Post All ({unposted.length})
      </button>
    </div>
  )
}
