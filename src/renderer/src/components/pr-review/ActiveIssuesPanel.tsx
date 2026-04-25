import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  REVIEW_FINDING_STATUS_LABELS,
  REVIEW_FINDING_STATUS_STYLES,
} from '../../lib/pr-review-findings'
import { usePrReviewStore } from '../../store/pr-review-store'

export function ActiveIssuesPanel() {
  const { activeThreads } = usePrReviewStore()
  const visibleThreads = activeThreads.filter(
    (thread) => thread.status !== 'resolved' && thread.status !== 'stale',
  )

  if (visibleThreads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-base-text-faint">
        <CheckCircle2 size={24} strokeWidth={1.5} />
        <p className="text-xs">No active issues tracked for this PR yet.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-base-border-subtle border-b px-4 py-2">
        <span className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
          Active issues
        </span>
        <span className="text-[10px] text-base-text-faint tabular-nums">
          {visibleThreads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {visibleThreads.map((thread) => (
          <div
            key={thread.id}
            className="rounded-lg border border-base-border-subtle bg-base-surface/40 p-3"
          >
            <div className="mb-2 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-base-text text-sm">{thread.canonicalTitle}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      REVIEW_FINDING_STATUS_STYLES[thread.status] ??
                      'bg-base-border text-base-text-muted'
                    }`}
                  >
                    {REVIEW_FINDING_STATUS_LABELS[thread.status] ?? thread.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-text-muted">
                  {thread.domain && (
                    <span className="rounded border border-base-border px-1.5 py-0.5 uppercase">
                      {thread.domain}
                    </span>
                  )}
                  {thread.lastFile && (
                    <span className="font-mono">
                      {thread.lastFile}
                      {thread.lastLine ? `:${thread.lastLine}` : ''}
                    </span>
                  )}
                  <span className="font-mono">Last seen {thread.lastSeenReviewId.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
