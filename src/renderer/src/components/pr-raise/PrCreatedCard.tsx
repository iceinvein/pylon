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
      <div className="overflow-hidden rounded-lg border border-blue-500/20 bg-stone-900/60">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-900/30 text-blue-400">
            <GitPullRequestArrow size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-stone-200">PR #{prNumber}</span>
              <span className="truncate text-sm text-stone-400">{title}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
              <span className="rounded bg-stone-800 px-1.5 py-0.5">{baseBranch}</span>
              <span>←</span>
              <span className="rounded bg-stone-800 px-1.5 py-0.5">{headBranch}</span>
              {stats && (
                <>
                  <span className="ml-2 text-green-500">+{stats.insertions}</span>
                  <span className="text-red-400">-{stats.deletions}</span>
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
            className="flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-[12px] text-blue-400 transition-colors hover:bg-stone-700 hover:text-blue-300"
          >
            <ExternalLink size={12} />
            View
          </a>
        </div>
      </div>
    </div>
  )
}
