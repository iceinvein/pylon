import {
  formatContextUsage,
  getContextUsageColor,
  getContextUsagePercent,
} from '../lib/context-usage'
import { useSessionStore } from '../store/session-store'

type ContextIndicatorProps = {
  sessionId: string | null
}

export function ContextIndicator({ sessionId }: ContextIndicatorProps) {
  const session = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId) : undefined))

  if (!session) return null

  const { contextInputTokens, contextWindow } = session.cost
  if (contextWindow <= 0) return null

  const percent = getContextUsagePercent(contextInputTokens, contextWindow)
  const color = getContextUsageColor(percent)
  const label = formatContextUsage(contextInputTokens, contextWindow)

  return (
    <div className="flex flex-col items-end gap-0.5" title={`${percent}% context used`}>
      <span className={`text-[10px] tabular-nums ${color.text}`}>{label}</span>
      <meter
        className="sr-only"
        value={percent}
        min={0}
        max={100}
        aria-label="Context window usage"
      />
      <div className="h-[3px] w-full min-w-[60px] overflow-hidden rounded-full bg-[var(--color-base-raised)]">
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-300 ${color.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
