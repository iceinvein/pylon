import { CheckCircle, XCircle, Clock, Hash } from 'lucide-react'
import { formatCost, formatTokens } from '../../lib/utils'

type ResultMessageProps = {
  isError: boolean
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
  return (
    <div
      className={`mx-4 my-2 rounded-lg border px-4 py-3 ${
        isError
          ? 'border-red-800/50 bg-red-950/20'
          : 'border-zinc-700/50 bg-zinc-900/50'
      }`}
    >
      <div className="flex items-center gap-2">
        {isError ? (
          <XCircle size={14} className="text-red-400" />
        ) : (
          <CheckCircle size={14} className="text-green-400" />
        )}
        <span className={`text-sm font-medium ${isError ? 'text-red-400' : 'text-green-400'}`}>
          {isError ? 'Error' : 'Done'}
        </span>
      </div>

      {errorMessage && (
        <p className="mt-2 text-xs text-red-300">{errorMessage}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-4">
        {totalCostUsd !== undefined && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <span className="text-zinc-600">cost</span>
            <span className="text-zinc-400">{formatCost(totalCostUsd)}</span>
          </span>
        )}
        {durationMs !== undefined && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock size={10} />
            <span className="text-zinc-400">{(durationMs / 1000).toFixed(1)}s</span>
          </span>
        )}
        {numTurns !== undefined && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Hash size={10} />
            <span className="text-zinc-400">{numTurns} turns</span>
          </span>
        )}
        {(inputTokens !== undefined || outputTokens !== undefined) && (
          <span className="text-xs text-zinc-600">
            {formatTokens(inputTokens ?? 0)} in / {formatTokens(outputTokens ?? 0)} out
          </span>
        )}
      </div>
    </div>
  )
}
