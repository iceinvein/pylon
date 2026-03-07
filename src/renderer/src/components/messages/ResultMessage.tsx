import { CheckCircle, XCircle, Clock, Hash } from 'lucide-react'
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
      <div className="mx-6 my-2 rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <XCircle size={14} className="text-red-400" />
          <span className="text-sm font-medium text-red-400">Error</span>
        </div>
        {errorMessage && (
          <p className="mt-2 text-xs text-red-300">{errorMessage}</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-4 mb-2">
      <div className="flex items-center gap-3 border-t border-stone-700/50 px-5 py-3">
        <CheckCircle size={14} className="text-green-500/80" />
        <span className="text-xs font-medium text-green-500/80">Done</span>
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
          {model && (
            <span className="text-stone-400">{model}</span>
          )}
          {totalCostUsd !== undefined && (
            <span>
              <span className="text-stone-600">cost</span>{' '}
              <span className="text-stone-400">{formatCost(totalCostUsd)}</span>
            </span>
          )}
          {durationMs !== undefined && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              <span className="text-stone-400">{(durationMs / 1000).toFixed(1)}s</span>
            </span>
          )}
          {numTurns !== undefined && (
            <span className="flex items-center gap-1">
              <Hash size={10} />
              <span className="text-stone-400">{numTurns} turns</span>
            </span>
          )}
          {(inputTokens !== undefined || outputTokens !== undefined) && (
            <span className="text-stone-600">
              {formatTokens(inputTokens ?? 0)} in / {formatTokens(outputTokens ?? 0)} out
            </span>
          )}
        </div>
      </div>
      <div className="mx-5 border-b border-stone-800/60 pb-6" />
    </div>
  )
}
