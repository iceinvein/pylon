import { CheckCircle, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
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

function getProviderForResult(model?: string): 'Claude' | 'Codex' {
  const normalized = model?.trim().toLowerCase() ?? ''
  return normalized.startsWith('gpt-') || normalized.startsWith('o') || normalized.includes('codex')
    ? 'Codex'
    : 'Claude'
}

const ENTRANCE = {
  initial: { opacity: 0, scale: 0.97, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.25, 1, 0.5, 1] as const },
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
      <motion.div
        className="px-6 pt-2 pb-2 pl-15"
        initial={ENTRANCE.initial}
        animate={ENTRANCE.animate}
        transition={ENTRANCE.transition}
      >
        <div
          className="mb-1.5 h-px animate-result-divider"
          style={{
            background:
              'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-error) 20%, transparent), transparent)',
          }}
        />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-error/15 px-2 py-0.5 text-error text-xs">
            <XCircle size={10} className="mr-1 inline-block align-[-1px]" />
            Error
          </span>
          {errorMessage && (
            <span className="min-w-0 flex-1 truncate text-base-text-muted text-xs">
              {errorMessage}
            </span>
          )}
        </div>
      </motion.div>
    )
  }

  // Quiet inline stats — just metadata, not a separator
  const stats: string[] = []
  if (totalCostUsd !== undefined && totalCostUsd > 0) stats.push(formatCost(totalCostUsd))
  if (durationMs !== undefined) stats.push(`${(durationMs / 1000).toFixed(1)}s`)
  if (numTurns !== undefined) stats.push(`${numTurns} turns`)
  if (inputTokens !== undefined || outputTokens !== undefined) {
    const provider = getProviderForResult(model)
    if (provider === 'Codex') {
      stats.push('Codex turn totals')
      stats.push(`${formatTokens(inputTokens ?? 0)} input`)
      stats.push(`${formatTokens(outputTokens ?? 0)} output`)
    } else {
      stats.push(`${formatTokens(inputTokens ?? 0)} in / ${formatTokens(outputTokens ?? 0)} out`)
    }
  }

  if (stats.length === 0) return <div className="h-3" />

  return (
    <motion.div
      className="px-6 pt-2 pb-2 pl-15"
      initial={ENTRANCE.initial}
      animate={ENTRANCE.animate}
      transition={ENTRANCE.transition}
    >
      <div
        className="mb-1.5 h-px animate-result-divider"
        style={{
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-success) 20%, transparent), transparent)',
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <CheckCircle size={12} className="shrink-0 text-success" />
        {stats.map((stat) => (
          <span
            key={stat}
            className="rounded-full bg-base-surface px-2 py-0.5 text-base-text-faint text-xs"
          >
            {stat}
          </span>
        ))}
      </div>
    </motion.div>
  )
}
