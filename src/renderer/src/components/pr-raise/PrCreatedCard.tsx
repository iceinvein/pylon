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
      <div className="overflow-hidden rounded-lg border border-[var(--color-info)]/20 bg-[var(--color-base-surface)]/60">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-info)]/30 text-[var(--color-info)]">
            <GitPullRequestArrow size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--color-base-text)] text-sm">
                PR #{prNumber}
              </span>
              <span className="truncate text-[var(--color-base-text-secondary)] text-sm">
                {title}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-base-text-muted)]">
              <span className="rounded bg-[var(--color-base-raised)] px-1.5 py-0.5">
                {baseBranch}
              </span>
              <span>←</span>
              <span className="rounded bg-[var(--color-base-raised)] px-1.5 py-0.5">
                {headBranch}
              </span>
              {stats && (
                <>
                  <span className="ml-2 text-[var(--color-success)]">+{stats.insertions}</span>
                  <span className="text-[var(--color-error)]">-{stats.deletions}</span>
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
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-base-border)] bg-[var(--color-base-raised)] px-3 py-1.5 text-[12px] text-[var(--color-info)] transition-colors hover:bg-[var(--color-base-border)] hover:text-[var(--color-info)]"
          >
            <ExternalLink size={12} />
            View
          </a>
        </div>
      </div>
    </div>
  )
}
