import { Square } from 'lucide-react'
import type { ExplorationStatus } from '../../../../shared/types'
import type { ActivityEntry } from '../../lib/activity-format'

const STATUS_DOT: Record<ExplorationStatus, string> = {
  pending: 'bg-[var(--color-base-text-muted)]',
  running: 'bg-[var(--color-info)] animate-pulse',
  done: 'bg-[var(--color-success)]',
  stopped: 'bg-yellow-500',
  error: 'bg-[var(--color-error)]',
}

type AgentTileProps = {
  explorationId: string
  goal: string
  status: ExplorationStatus
  findingsCount: number
  latestAction: ActivityEntry | null
  color: string
  isFiltered: boolean
  onToggleFilter: (id: string) => void
  onStop: (id: string) => void
}

export function AgentTile({
  explorationId,
  goal,
  status,
  findingsCount,
  latestAction,
  color,
  isFiltered,
  onToggleFilter,
  onStop,
}: AgentTileProps) {
  const isRunning = status === 'running'
  const truncatedGoal = goal.length > 30 ? `${goal.slice(0, 30)}…` : goal

  return (
    <button
      type="button"
      onClick={() => onToggleFilter(explorationId)}
      className={`group relative min-w-[170px] max-w-[220px] shrink-0 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isFiltered
          ? 'border-base-border bg-base-border/40'
          : 'border-base-border-subtle bg-base-raised/50 hover:bg-base-raised'
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
          <span className="truncate font-medium text-base-text text-xs">{truncatedGoal}</span>
        </div>
        {findingsCount > 0 && (
          <span className="shrink-0 rounded bg-yellow-500/20 px-1.5 py-0.5 font-mono text-[10px] text-yellow-400">
            {findingsCount}
          </span>
        )}
      </div>
      {latestAction && isRunning && (
        <p className="mt-1 truncate text-[11px] text-base-text-muted">
          {latestAction.summary}
        </p>
      )}
      {!isRunning && (
        <p className="mt-1 text-[11px] text-base-text-faint capitalize">{status}</p>
      )}
      {isRunning && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStop(explorationId)
          }}
          className="absolute top-1.5 right-1.5 rounded p-0.5 text-base-text-muted opacity-0 transition-all hover:text-error group-hover:opacity-100"
          aria-label="Stop agent"
        >
          <Square size={10} />
        </button>
      )}
    </button>
  )
}
