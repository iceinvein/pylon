import { formatCost, formatTokens } from '../lib/utils'
import type { SessionState } from '../store/session-store'

type StatusBarProps = {
  session: SessionState | undefined
}

function StatusDot({ status }: { status: string | undefined }) {
  const base = 'h-2 w-2 rounded-full flex-shrink-0'
  if (!status || status === 'empty') return <span className={`${base} bg-stone-600`} />
  if (status === 'running' || status === 'starting' || status === 'waiting') {
    return <span className={`${base} animate-pulse bg-green-500`} />
  }
  if (status === 'done') return <span className={`${base} bg-stone-500`} />
  if (status === 'error') return <span className={`${base} bg-red-500`} />
  return <span className={`${base} bg-stone-600`} />
}

export function StatusBar({ session }: StatusBarProps) {
  return (
    <div className="flex h-6 items-center gap-3 border-stone-800 border-t bg-stone-950 px-3">
      <StatusDot status={session?.status} />

      {session && (
        <>
          <span className="text-stone-500 text-xs">{session.status}</span>
          {session.model && (
            <>
              <span className="text-stone-700">·</span>
              <span className="text-stone-500 text-xs">{session.model}</span>
            </>
          )}

          {session.cost.totalUsd > 0 && (
            <>
              <span className="text-stone-700">·</span>
              <span className="text-stone-500 text-xs">{formatCost(session.cost.totalUsd)}</span>
            </>
          )}

          {(session.cost.inputTokens > 0 || session.cost.outputTokens > 0) && (
            <>
              <span className="text-stone-700">·</span>
              <span className="text-stone-600 text-xs">
                {formatTokens(session.cost.inputTokens)} / {formatTokens(session.cost.outputTokens)}
              </span>
            </>
          )}
        </>
      )}

      <div className="flex-1" />
    </div>
  )
}
