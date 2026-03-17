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
      <div className="my-2 mr-6 ml-15 rounded-lg border border-error/50 bg-error/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <XCircle size={14} className="text-error" />
          <span className="font-medium text-error text-sm">Error</span>
        </div>
        {errorMessage && <p className="mt-2 text-error text-xs">{errorMessage}</p>}
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
    <div className="px-6 pt-1 pb-2 pl-15">
      <span className="text-[10px] text-base-text-faint">{stats.join(' · ')}</span>
    </div>
  )
}
