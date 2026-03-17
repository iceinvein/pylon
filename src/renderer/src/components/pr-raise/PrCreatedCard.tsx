import { ExternalLink, GitPullRequestArrow } from 'lucide-react'

type Props = {
  prNumber: number
  title: string
  url: string
  baseBranch: string
  headBranch: string
  stats?: { filesChanged: number; insertions: number; deletions: number }
}

export function PrCreatedCard({ prNumber, title, url, baseBranch, headBranch, stats }: Props) {
  return (
    <div className="my-1 px-6 py-2">
      <div className="overflow-hidden rounded-lg border border-info/20 bg-base-surface/60">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/30 text-info">
            <GitPullRequestArrow size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-base-text text-sm">PR #{prNumber}</span>
              <span className="truncate text-base-text-secondary text-sm">{title}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-base-text-muted">
              <span className="rounded bg-base-raised px-1.5 py-0.5">{baseBranch}</span>
              <span>←</span>
              <span className="rounded bg-base-raised px-1.5 py-0.5">{headBranch}</span>
              {stats && (
                <>
                  <span className="ml-2 text-success">+{stats.insertions}</span>
                  <span className="text-error">-{stats.deletions}</span>
                  <span>
                    {stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-base-border bg-base-raised px-3 py-1.5 text-[12px] text-info transition-colors hover:bg-base-border hover:text-info"
          >
            <ExternalLink size={12} />
            View
          </a>
        </div>
      </div>
    </div>
  )
}
