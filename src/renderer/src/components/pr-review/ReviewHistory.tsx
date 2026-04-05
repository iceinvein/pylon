import { CheckCircle2, Clock, Loader2, Trash2, XCircle } from 'lucide-react'
import { formatCost } from '../../lib/utils'
import { usePrReviewStore } from '../../store/pr-review-store'

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; iconClass: string; color: string; label: (count: number) => string }
> = {
  done: {
    icon: CheckCircle2,
    iconClass: '',
    color: 'text-emerald-400',
    label: (n) => `${n} finding${n !== 1 ? 's' : ''}`,
  },
  running: {
    icon: Loader2,
    iconClass: 'animate-spin',
    color: 'text-[var(--color-base-text-secondary)]',
    label: () => 'In progress',
  },
  error: {
    icon: XCircle,
    iconClass: '',
    color: 'text-[var(--color-error)]',
    label: () => 'Failed',
  },
  pending: {
    icon: Clock,
    iconClass: '',
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
        <span className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
          Past reviews
        </span>
        <span className="text-[10px] text-base-text-faint tabular-nums">{pastReviews.length}</span>
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
                isActive ? 'bg-base-raised/60' : 'hover:bg-base-raised/30'
              }`}
            >
              <button
                type="button"
                onClick={() => loadReview(r.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2"
              >
                <StatusIcon size={12} className={`shrink-0 ${config.color} ${config.iconClass}`} />
                <span className="text-base-text-secondary text-xs">{timeAgo(r.createdAt)}</span>
                <span className="truncate text-base-text-faint text-xs">{r.focus.join(', ')}</span>
                {r.costUsd > 0 && (
                  <span className="shrink-0 font-mono text-[10px] text-base-text-faint">
                    {formatCost(r.costUsd)}
                  </span>
                )}
                <span className={`ml-auto shrink-0 font-medium text-xs ${config.color}`}>
                  {config.label(findingsCount)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => deleteReview(r.id)}
                className="shrink-0 p-1.5 text-base-text-faint opacity-0 transition-all hover:text-error group-hover:opacity-100"
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
