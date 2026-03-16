import { Sparkles, X } from 'lucide-react'
import type { GraphCommit } from '../../../../shared/git-types'

type CommitDetailProps = {
  commit: GraphCommit
  onClose: () => void
  onExplain: (hash: string) => void
}

export function CommitDetail({ commit, onClose, onExplain }: CommitDetailProps) {
  return (
    <div className="border-stone-800 border-t bg-stone-900/50 p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-stone-200 text-xs">{commit.message}</p>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-stone-500">
            <span>{commit.author}</span>
            <span>•</span>
            <span>{new Date(commit.date).toLocaleDateString()}</span>
            <span>•</span>
            <code className="font-[family-name:var(--font-mono)] text-stone-600">
              {commit.shortHash}
            </code>
          </div>
          {commit.refs.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {commit.refs.map((ref) => (
                <span
                  key={ref.name}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    ref.type === 'tag'
                      ? 'bg-purple-950/50 text-purple-400'
                      : ref.isCurrent
                        ? 'bg-amber-950/50 text-amber-400'
                        : 'bg-stone-800 text-stone-400'
                  }`}
                >
                  {ref.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onExplain(commit.hash)}
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400"
            title="Explain this commit with AI"
          >
            <Sparkles size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
