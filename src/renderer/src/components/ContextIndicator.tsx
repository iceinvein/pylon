import {
  formatContextUsage,
  getContextUsageColor,
  getContextUsagePercent,
  getEffectiveInputPercent,
} from '../lib/context-usage'
import { formatTokens } from '../lib/utils'
import { useSessionStore } from '../store/session-store'

type ContextIndicatorProps = {
  sessionId: string | null
}

export function ContextIndicator({ sessionId }: ContextIndicatorProps) {
  const session = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId) : undefined))

  if (!session) return null

  const { contextInputTokens, contextWindow, maxOutputTokens } = session.cost
  if (contextWindow <= 0) return null

  const percent = getContextUsagePercent(contextInputTokens, contextWindow)
  const effectivePercent = getEffectiveInputPercent(
    contextInputTokens,
    contextWindow,
    maxOutputTokens,
  )
  const color = getContextUsageColor(effectivePercent)
  const label = formatContextUsage(contextInputTokens, contextWindow)

  // Position of the effective input limit marker (where output tokens reserve begins)
  const hasEffectiveLimit = maxOutputTokens > 0 && maxOutputTokens < contextWindow
  const effectiveLimitPos = hasEffectiveLimit
    ? Math.round(((contextWindow - maxOutputTokens) / contextWindow) * 100)
    : 100

  const effectiveBudget = hasEffectiveLimit ? contextWindow - maxOutputTokens : contextWindow

  const tooltip = hasEffectiveLimit
    ? `${effectivePercent}% of usable input · ${formatTokens(contextInputTokens)} used of ${formatTokens(effectiveBudget)} effective (${formatTokens(maxOutputTokens)} reserved for output)`
    : `${percent}% context used`

  return (
    <div className="flex flex-col items-end gap-0.5" title={tooltip}>
      <span className={`text-[10px] tabular-nums ${color.text}`}>{label}</span>
      <meter
        className="sr-only"
        value={effectivePercent}
        min={0}
        max={100}
        aria-label="Context window usage"
      />
      <div className="relative h-0.75 w-full min-w-15 overflow-hidden rounded-full bg-base-raised">
        {/* Filled bar: current context input tokens */}
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-300 ${color.bar}`}
          style={{ width: `${percent}%` }}
        />
        {/* Effective input limit marker: where output token reservation starts */}
        {hasEffectiveLimit && (
          <div
            className="absolute top-0 h-full w-px bg-base-text-muted/50"
            style={{ left: `${effectiveLimitPos}%` }}
          />
        )}
      </div>
    </div>
  )
}
