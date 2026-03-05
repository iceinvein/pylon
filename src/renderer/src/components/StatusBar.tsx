import type { SessionState } from '../store/session-store'
import { formatCost, formatTokens } from '../lib/utils'

type StatusBarProps = {
  session: SessionState | undefined
}

function StatusDot({ status }: { status: string | undefined }) {
  const base = 'h-2 w-2 rounded-full flex-shrink-0'
  if (!status || status === 'empty') return <span className={`${base} bg-zinc-600`} />
  if (status === 'running' || status === 'starting' || status === 'waiting') {
    return <span className={`${base} animate-pulse bg-green-500`} />
  }
  if (status === 'done') return <span className={`${base} bg-zinc-500`} />
  if (status === 'error') return <span className={`${base} bg-red-500`} />
  return <span className={`${base} bg-zinc-600`} />
}

export function StatusBar({ session }: StatusBarProps) {
  return (
    <div className="flex h-6 items-center gap-3 border-t border-zinc-800 bg-zinc-950 px-3">
      <StatusDot status={session?.status} />

      {session && (
        <>
          <span className="text-xs text-zinc-500">{session.status}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs text-zinc-500">{session.model}</span>

          {session.cost.totalUsd > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">
                {formatCost(session.cost.totalUsd)}
              </span>
            </>
          )}

          {(session.cost.inputTokens > 0 || session.cost.outputTokens > 0) && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-600">
                {formatTokens(session.cost.inputTokens)} /{' '}
                {formatTokens(session.cost.outputTokens)}
              </span>
            </>
          )}
        </>
      )}

      <div className="flex-1" />
    </div>
  )
}
