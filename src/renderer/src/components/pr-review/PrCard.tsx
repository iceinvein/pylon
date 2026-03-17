import { GitPullRequest as GitPrIcon, GitPullRequestDraft } from 'lucide-react'
import type { GhPullRequest } from '../../../../shared/types'

type PrCardProps = {
  pr: GhPullRequest
  selected: boolean
  onClick: () => void
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function PrCard({ pr, selected, onClick }: PrCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-base-border bg-base-raised'
          : 'border-transparent hover:bg-base-raised/50'
      }`}
    >
      <div className="flex items-start gap-2">
        {pr.isDraft ? (
          <GitPullRequestDraft size={14} className="mt-0.5 shrink-0 text-base-text-muted" />
        ) : (
          <GitPrIcon size={14} className="mt-0.5 shrink-0 text-success" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base-text text-sm">{pr.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-base-text-muted text-xs">
            <span>#{pr.number}</span>
            <span>{pr.author}</span>
            <span>{timeAgo(pr.updatedAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-success">+{pr.additions}</span>
            <span className="text-error">-{pr.deletions}</span>
            {pr.isDraft && (
              <span className="rounded bg-base-border px-1.5 py-0.5 text-[10px] text-base-text-secondary">
                Draft
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
