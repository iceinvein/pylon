import { CheckCircle, Clock, Hash, XCircle } from 'lucide-react'
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
  model,
  totalCostUsd,
  durationMs,
  numTurns,
  inputTokens,
  outputTokens,
  errorMessage,
}: ResultMessageProps) {
  if (isError) {
    return (
      <div className="mx-6 my-2 rounded-lg border border-[var(--color-error)]/50 bg-[var(--color-error)]/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <XCircle size={14} className="text-[var(--color-error)]" />
          <span className="font-medium text-[var(--color-error)] text-sm">Error</span>
        </div>
        {errorMessage && <p className="mt-2 text-[var(--color-error)] text-xs">{errorMessage}</p>}
      </div>
    )
  }

  return (
    <div className="mt-4 mb-2">
      <div className="flex items-center gap-3 border-[var(--color-base-border)]/50 border-t px-5 py-3">
        <CheckCircle size={14} className="text-[var(--color-success)]/80" />
        <span className="font-medium text-[var(--color-success)]/80 text-xs">Done</span>
        <div className="flex flex-wrap items-center gap-3 text-[var(--color-base-text-muted)] text-xs">
          {model && <span className="text-[var(--color-base-text-secondary)]">{model}</span>}
          {totalCostUsd !== undefined && (
            <span>
              <span className="text-[var(--color-base-text-faint)]">cost</span>{' '}
              <span className="text-[var(--color-base-text-secondary)]">
                {formatCost(totalCostUsd)}
              </span>
            </span>
          )}
          {durationMs !== undefined && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              <span className="text-[var(--color-base-text-secondary)]">
                {(durationMs / 1000).toFixed(1)}s
              </span>
            </span>
          )}
          {numTurns !== undefined && (
            <span className="flex items-center gap-1">
              <Hash size={10} />
              <span className="text-[var(--color-base-text-secondary)]">{numTurns} turns</span>
            </span>
          )}
          {(inputTokens !== undefined || outputTokens !== undefined) && (
            <span className="text-[var(--color-base-text-faint)]">
              {formatTokens(inputTokens ?? 0)} in / {formatTokens(outputTokens ?? 0)} out
            </span>
          )}
        </div>
      </div>
      <div className="mx-6 mt-4 mb-2 h-px bg-[var(--color-base-border-subtle)]" />
    </div>
  )
}
