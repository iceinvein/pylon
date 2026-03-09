import { Clock, Trash2 } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'

export function ReviewHistory() {
  const { reviews, activeReview, loadReview, deleteReview } = usePrReviewStore()

  if (reviews.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-medium text-stone-400">Previous Reviews</h3>
      <div className="mt-2 space-y-1">
        {reviews.map((r) => {
          const isActive = activeReview?.id === r.id
          const date = new Date(r.createdAt)
          const statusLabel = r.status === 'done' ? `${r.findings.length} findings` : r.status
          return (
            <div
              key={r.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                isActive ? 'bg-stone-800 text-stone-200' : 'text-stone-400 hover:bg-stone-800/50'
              }`}
            >
              <button
                onClick={() => loadReview(r.id)}
                className="flex flex-1 items-center gap-2"
              >
                <Clock size={12} className="flex-shrink-0" />
                <span>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-stone-600">&middot;</span>
                <span>{r.focus.join(', ')}</span>
                <span className="text-stone-600">&middot;</span>
                <span className={r.status === 'done' ? 'text-green-500' : r.status === 'error' ? 'text-red-500' : 'text-stone-500'}>{statusLabel}</span>
              </button>
              <button
                onClick={() => deleteReview(r.id)}
                className="flex-shrink-0 p-1 text-stone-600 hover:text-red-400"
                title="Delete review"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
