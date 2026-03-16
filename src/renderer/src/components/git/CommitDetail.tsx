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
    <div className="border-stone-800/60 border-t bg-stone-900/40 px-4 py-2.5">
      <div className="flex items-center gap-2 text-[10px] text-stone-500">
        <span className="flex items-center gap-1">
          <User size={9} className="text-stone-600" />
          {commit.author}
        </span>
        <span>•</span>
        <span>{new Date(commit.date).toLocaleDateString()}</span>
        <span>•</span>
        <button
          type="button"
          onClick={handleCopyHash}
          className="flex items-center gap-0.5 font-[family-name:var(--font-mono)] text-stone-600 transition-colors hover:text-stone-400"
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
                  ? 'bg-purple-950/50 text-purple-400'
                  : ref.isCurrent
                    ? 'bg-amber-950/50 text-amber-400'
                    : 'bg-stone-800 text-stone-400'
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
