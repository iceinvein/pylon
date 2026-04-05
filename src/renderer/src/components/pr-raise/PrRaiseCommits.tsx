import { GitCommit } from 'lucide-react'
import type { PrRaiseCommitInfo } from '../../../../shared/types'

type Props = {
  commits: PrRaiseCommitInfo[]
}

export function PrRaiseCommits({ commits }: Props) {
  return (
    <div className="divide-y divide-base-border-subtle/60 p-4">
      {commits.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-base-text-faint text-sm">
          No commits
        </div>
      ) : (
        commits.map((commit) => (
          <div key={commit.hash} className="flex items-start gap-3 py-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-base-raised text-base-text-muted">
              <GitCommit size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base-text text-sm">{commit.message}</p>
              <div className="mt-1 flex items-center gap-2 text-base-text-muted text-xs">
                <code className="rounded bg-base-raised px-1.5 py-0.5 font-mono text-warning/70">
                  {commit.hash.slice(0, 7)}
                </code>
                <span>
                  {new Date(commit.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
