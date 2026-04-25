import { CheckCircle2, History } from 'lucide-react'
import {
  REVIEW_FINDING_STATUS_LABELS,
  REVIEW_FINDING_STATUS_STYLES,
} from '../../lib/pr-review-findings'
import { usePrReviewStore } from '../../store/pr-review-store'

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

function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 7) : null
}

export function TimelinePanel() {
  const { activeTimeline, reviews } = usePrReviewStore()

  if (activeTimeline.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-base-text-faint">
        <CheckCircle2 size={24} strokeWidth={1.5} />
        <p className="text-xs">No review history tracked for this PR yet.</p>
      </div>
    )
  }

  const groups: Array<{ reviewId: string; createdAt: number; items: typeof activeTimeline }> = []
  for (const entry of activeTimeline) {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup?.reviewId === entry.reviewId) {
      lastGroup.items.push(entry)
    } else {
      groups.push({ reviewId: entry.reviewId, createdAt: entry.createdAt, items: [entry] })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-base-border-subtle border-b px-4 py-2">
        <span className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
          Timeline
        </span>
        <span className="text-[10px] text-base-text-faint tabular-nums">
          {activeTimeline.length}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {groups.map((group) => {
          const review = reviews.find((entry) => entry.id === group.reviewId)
          const fromSha = shortSha(review?.snapshot.comparedFromSha)
          const toSha = shortSha(review?.snapshot.comparedToSha)

          return (
            <section
              key={group.reviewId}
              className="rounded-lg border border-base-border-subtle bg-base-surface/40"
            >
              <div className="flex flex-wrap items-center gap-2 border-base-border-subtle border-b px-3 py-2">
                <History size={13} className="text-base-text-muted" />
                <span className="font-medium text-base-text text-xs">
                  {timeAgo(group.createdAt)}
                </span>
                {review && (
                  <span className="rounded border border-base-border px-1.5 py-0.5 text-[10px] text-base-text-faint uppercase tracking-wide">
                    {review.reviewMode}
                  </span>
                )}
                {fromSha && toSha && (
                  <span className="font-mono text-[10px] text-base-text-faint">
                    {fromSha}-{toSha}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-base-text-faint tabular-nums">
                  {group.items.length} event{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2 p-3">
                {group.items.map((entry) => (
                  <div
                    key={`${entry.reviewId}-${entry.threadId}-${entry.status}-${entry.createdAt}`}
                    className="rounded-md border border-base-border/70 bg-base-bg/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          REVIEW_FINDING_STATUS_STYLES[entry.status]
                        }`}
                      >
                        {REVIEW_FINDING_STATUS_LABELS[entry.status]}
                      </span>
                      <p className="font-medium text-base-text text-sm">{entry.title}</p>
                      {entry.domain && (
                        <span className="rounded border border-base-border px-1.5 py-0.5 text-[10px] text-base-text-muted uppercase tracking-wide">
                          {entry.domain}
                        </span>
                      )}
                      {entry.carriedForward && (
                        <span className="rounded border border-base-border px-1.5 py-0.5 text-[10px] text-base-text-faint uppercase tracking-wide">
                          carried forward
                        </span>
                      )}
                    </div>
                    {(entry.file || entry.line) && (
                      <div className="mt-1 font-mono text-[11px] text-base-text-muted">
                        {entry.file ?? 'General'}
                        {entry.line ? `:${entry.line}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
