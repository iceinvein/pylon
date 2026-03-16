import { CheckCircle2, Clock, Loader2, Trash2, XCircle } from 'lucide-react'
import { formatCost } from '../../lib/utils'
import { usePrReviewStore } from '../../store/pr-review-store'

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; color: string; label: (count: number) => string }
> = {
  done: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    label: (n) => `${n} finding${n !== 1 ? 's' : ''}`,
  },
  running: {
    icon: Loader2,
    color: 'text-[var(--color-base-text-secondary)] animate-spin',
    label: () => 'In progress',
  },
  error: {
    icon: XCircle,
    color: 'text-[var(--color-error)]',
    label: () => 'Failed',
  },
  pending: {
    icon: Clock,
    color: 'text-[var(--color-base-text-muted)]',
    label: () => 'Pending',
  },
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function ReviewHistory() {
  const { reviews, activeReview, activeFindings, loadReview, deleteReview } = usePrReviewStore()

  const pastReviews = reviews.filter(
    (r) => r.id !== activeReview?.id || r.status === 'done' || r.status === 'error',
  )
  if (pastReviews.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="font-medium text-[10px] text-[var(--color-base-text-faint)] uppercase tracking-wider">
          Past reviews
        </span>
        <span className="text-[10px] text-[var(--color-base-text-faint)] tabular-nums">
          {pastReviews.length}
        </span>
      </div>
      <div className="space-y-px">
        {pastReviews.map((r) => {
          const isActive = activeReview?.id === r.id
          const findingsCount =
            isActive && r.status === 'done' ? activeFindings.length : r.findings.length
          const config = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending
          const StatusIcon = config.icon

          return (
            <div
              key={r.id}
              className={`group flex items-center rounded-md transition-colors ${
                isActive
                  ? 'bg-[var(--color-base-raised)]/60'
                  : 'hover:bg-[var(--color-base-raised)]/30'
              }`}
            >
              <button
                type="button"
                onClick={() => loadReview(r.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2"
              >
                <StatusIcon size={12} className={`flex-shrink-0 ${config.color}`} />
                <span className="text-[11px] text-[var(--color-base-text-secondary)]">
                  {timeAgo(r.createdAt)}
                </span>
                <span className="truncate text-[11px] text-[var(--color-base-text-faint)]">
                  {r.focus.join(', ')}
                </span>
                {r.costUsd > 0 && (
                  <span className="flex-shrink-0 font-mono text-[10px] text-[var(--color-base-text-faint)]">
                    {formatCost(r.costUsd)}
                  </span>
                )}
                <span className={`ml-auto flex-shrink-0 font-medium text-[11px] ${config.color}`}>
                  {config.label(findingsCount)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => deleteReview(r.id)}
                className="flex-shrink-0 p-1.5 text-[var(--color-base-text-faint)] opacity-0 transition-all hover:text-[var(--color-error)] group-hover:opacity-100"
                title="Delete"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
