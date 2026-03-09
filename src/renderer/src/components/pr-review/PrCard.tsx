import { GitPullRequestDraft, GitPullRequest as GitPrIcon } from 'lucide-react'
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
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-stone-600 bg-stone-800'
          : 'border-transparent hover:bg-stone-800/50'
      }`}
    >
      <div className="flex items-start gap-2">
        {pr.isDraft ? (
          <GitPullRequestDraft size={14} className="mt-0.5 flex-shrink-0 text-stone-500" />
        ) : (
          <GitPrIcon size={14} className="mt-0.5 flex-shrink-0 text-green-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-stone-200">
            {pr.title}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
            <span>#{pr.number}</span>
            <span>{pr.author}</span>
            <span>{timeAgo(pr.updatedAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-green-600">+{pr.additions}</span>
            <span className="text-red-600">-{pr.deletions}</span>
            {pr.isDraft && (
              <span className="rounded bg-stone-700 px-1.5 py-0.5 text-[10px] text-stone-400">Draft</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
