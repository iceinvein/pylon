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
    <div className="space-y-3 border-base-border-subtle border-b px-6 py-4">
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="PR title..."
        className="w-full rounded-md border border-base-border bg-base-surface px-3 py-2 text-base-text text-sm placeholder:text-base-text-faint focus:border-info/50 focus:outline-none"
      />

      {/* Branch + Commits row */}
      <div className="flex items-center gap-3">
        {/* Base branch */}
        <div className="flex items-center gap-2 rounded-md border border-base-border bg-base-surface px-3 py-1.5">
          <span className="text-[10px] text-base-text-muted uppercase tracking-wider">Base</span>
          <input
            type="text"
            value={baseBranch}
            onChange={(e) => onBaseBranchChange(e.target.value)}
            className="w-24 bg-transparent text-base-text text-xs focus:outline-none"
          />
        </div>

        <span className="text-base-text-faint">←</span>

        {/* Head branch (read-only) */}
        <div className="flex items-center gap-2 rounded-md border border-base-border-subtle bg-base-surface/50 px-3 py-1.5">
          <span className="text-[10px] text-base-text-muted uppercase tracking-wider">Head</span>
          <span className="text-base-text-secondary text-xs">{info?.headBranch ?? '...'}</span>
        </div>

        {/* Squash toggle */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onSquashChange(true)}
            className={`rounded px-2 py-1 transition-colors ${
              squash ? 'bg-info/20 text-info' : 'text-base-text-muted hover:text-base-text'
            }`}
          >
            Squash
          </button>
          <button
            type="button"
            onClick={() => onSquashChange(false)}
            className={`rounded px-2 py-1 transition-colors ${
              !squash ? 'bg-info/20 text-info' : 'text-base-text-muted hover:text-base-text'
            }`}
          >
            As-is
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {info && (
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded bg-success/30 px-1.5 py-0.5 text-success">
            +{info.stats.insertions}
          </span>
          <span className="rounded bg-error/30 px-1.5 py-0.5 text-error">
            -{info.stats.deletions}
          </span>
          <span className="text-base-text-muted">
            {info.stats.filesChanged} file{info.stats.filesChanged !== 1 ? 's' : ''} ·{' '}
            {info.commits.length} commit{info.commits.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
