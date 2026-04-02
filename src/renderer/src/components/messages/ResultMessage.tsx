import { XCircle } from 'lucide-react'
import { formatCost, formatTokens } from '../../lib/utils'

type ResultMessageProps = {
  isError: boolean
  model?: string
  totalCostUsd?: number
  durationMs?: number
  numTurns?: number
  inputTokens?: number
  outputTokens?: number
  errorMessage?: string
}

export function ResultMessage({
  isError,
  totalCostUsd,
  durationMs,
  numTurns,
  inputTokens,
  outputTokens,
  errorMessage,
}: ResultMessageProps) {
  if (isError) {
    return (
      <div className="px-6 pt-2 pb-2 pl-15">
        <div className="mb-1.5 h-px bg-error/20" />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-error/15 px-2 py-0.5 text-[11px] text-error">
            <XCircle size={10} className="mr-1 inline-block align-[-1px]" />
            Error
          </span>
          {errorMessage && (
            <span className="min-w-0 flex-1 truncate text-[11px] text-base-text-muted">
              {errorMessage}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Quiet inline stats — just metadata, not a separator
  const stats: string[] = []
  if (totalCostUsd !== undefined) stats.push(formatCost(totalCostUsd))
  if (durationMs !== undefined) stats.push(`${(durationMs / 1000).toFixed(1)}s`)
  if (numTurns !== undefined) stats.push(`${numTurns} turns`)
  if (inputTokens !== undefined || outputTokens !== undefined) {
    stats.push(`${formatTokens(inputTokens ?? 0)} in / ${formatTokens(outputTokens ?? 0)} out`)
  }

  if (stats.length === 0) return <div className="h-3" />

  return (
    <div className="px-6 pt-2 pb-2 pl-15">
      <div className="mb-1.5 h-px bg-base-border-subtle/50" />
      <div className="flex flex-wrap items-center gap-1.5">
        {stats.map((stat) => (
          <span
            key={stat}
            className="rounded-full bg-base-surface px-2 py-0.5 text-[11px] text-base-text-faint"
          >
            {stat}
          </span>
        ))}
      </div>
    </div>
  )
}
