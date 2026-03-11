import type { PrRaiseInfo } from '../../../../shared/types'

type Props = {
  info: PrRaiseInfo | null
  title: string
  onTitleChange: (title: string) => void
  baseBranch: string
  onBaseBranchChange: (branch: string) => void
  squash: boolean
  onSquashChange: (squash: boolean) => void
}

export function PrRaiseMetadata({
  info,
  title,
  onTitleChange,
  baseBranch,
  onBaseBranchChange,
  squash,
  onSquashChange,
}: Props) {
  return (
    <div className="space-y-3 border-stone-800 border-b px-6 py-4">
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="PR title..."
        className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-blue-500/50 focus:outline-none"
      />

      {/* Branch + Commits row */}
      <div className="flex items-center gap-3">
        {/* Base branch */}
        <div className="flex items-center gap-2 rounded-md border border-stone-700 bg-stone-900 px-3 py-1.5">
          <span className="text-[10px] text-stone-500 uppercase tracking-wider">Base</span>
          <input
            type="text"
            value={baseBranch}
            onChange={(e) => onBaseBranchChange(e.target.value)}
            className="w-24 bg-transparent text-stone-200 text-xs focus:outline-none"
          />
        </div>

        <span className="text-stone-600">←</span>

        {/* Head branch (read-only) */}
        <div className="flex items-center gap-2 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-1.5">
          <span className="text-[10px] text-stone-500 uppercase tracking-wider">Head</span>
          <span className="text-stone-400 text-xs">{info?.headBranch ?? '...'}</span>
        </div>

        {/* Squash toggle */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onSquashChange(true)}
            className={`rounded px-2 py-1 transition-colors ${
              squash ? 'bg-blue-600/20 text-blue-400' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            Squash
          </button>
          <button
            type="button"
            onClick={() => onSquashChange(false)}
            className={`rounded px-2 py-1 transition-colors ${
              !squash ? 'bg-blue-600/20 text-blue-400' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            As-is
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {info && (
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-green-400">
            +{info.stats.insertions}
          </span>
          <span className="rounded bg-red-900/30 px-1.5 py-0.5 text-red-400">
            -{info.stats.deletions}
          </span>
          <span className="text-stone-500">
            {info.stats.filesChanged} file{info.stats.filesChanged !== 1 ? 's' : ''} ·{' '}
            {info.commits.length} commit{info.commits.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
