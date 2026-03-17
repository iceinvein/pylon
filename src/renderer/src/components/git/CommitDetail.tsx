import { Copy, GitBranch, Tag, User } from 'lucide-react'
import { useCallback } from 'react'
import type { GraphCommit } from '../../../../shared/git-types'

type CommitDetailProps = {
  commit: GraphCommit
}

export function CommitDetail({ commit }: CommitDetailProps) {
  const handleCopyHash = useCallback(() => {
    navigator.clipboard.writeText(commit.hash)
  }, [commit.hash])

  return (
    <div className="border-base-border-subtle/60 border-t bg-base-surface/40 px-4 py-2.5">
      <div className="flex items-center gap-2 text-[10px] text-base-text-muted">
        <span className="flex items-center gap-1">
          <User size={9} className="text-base-text-faint" />
          {commit.author}
        </span>
        <span>•</span>
        <span>{new Date(commit.date).toLocaleDateString()}</span>
        <span>•</span>
        <button
          type="button"
          onClick={handleCopyHash}
          className="flex items-center gap-0.5 font-mono text-base-text-faint transition-colors hover:text-base-text-secondary"
          title="Copy full hash"
        >
          {commit.shortHash}
          <Copy size={8} />
        </button>
      </div>
      {commit.refs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {commit.refs.map((ref) => (
            <span
              key={ref.name}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                ref.type === 'tag'
                  ? 'bg-special/50 text-special'
                  : ref.isCurrent
                    ? 'bg-accent-muted/50 text-warning'
                    : 'bg-base-raised text-base-text-secondary'
              }`}
            >
              {ref.type === 'tag' ? <Tag size={8} /> : <GitBranch size={8} />}
              {ref.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
