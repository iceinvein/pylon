import { ArrowLeft, GitCompare, Plus, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TestExploration } from '../../../../shared/types'

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

type ConfigBarProps = {
  projectName: string
  goalCount: number
  agentCount: number
  explorations: TestExploration[]
  hasHistory: boolean
  onStopAll: () => void
  onNewRun: () => void
  onRunAgain: () => void
  onCompare: () => void
}

export function ConfigBar({
  projectName,
  goalCount,
  agentCount,
  explorations,
  hasHistory,
  onStopAll,
  onNewRun,
  onRunAgain,
  onCompare,
}: ConfigBarProps) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const anyRunning = explorations.some((e) => e.status === 'running' || e.status === 'pending')
  const allDone = explorations.length > 0 && explorations.every((e) => e.status !== 'running' && e.status !== 'pending')
  const totalFindings = explorations.reduce((sum, e) => sum + e.findingsCount, 0)
  const totalCost = explorations.reduce((sum, e) => sum + e.totalCostUsd, 0)

  useEffect(() => {
    if (!anyRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    const startTimes = explorations.filter((e) => e.startedAt).map((e) => e.startedAt!)
    if (startTimes.length === 0) return
    const earliest = Math.min(...startTimes)
    const tick = () => setElapsed(Date.now() - earliest)
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [anyRunning, explorations])

  return (
    <div className="flex items-center gap-3 border-base-border-subtle border-b px-4 py-2.5">
      <span className="rounded bg-base-raised px-2 py-0.5 text-[11px] text-base-text">
        {projectName}
      </span>
      <span className="text-[11px] text-base-text-muted">
        {goalCount} goal{goalCount !== 1 ? 's' : ''}
      </span>
      <span className="text-[11px] text-base-text-muted">
        {agentCount} agent{agentCount !== 1 ? 's' : ''}
      </span>

      {(anyRunning || allDone) && (
        <>
          <span className="text-[11px] text-base-text-muted">
            {allDone ? '✓' : '⏱'} {formatElapsed(elapsed)}
          </span>
          {totalCost > 0 && (
            <span className="text-[11px] text-base-text-faint">
              {formatCost(totalCost)}
            </span>
          )}
          {allDone && (
            <span className="text-[11px] text-base-text-muted">
              · {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
            </span>
          )}
        </>
      )}

      <div className="flex-1" />

      {hasHistory && allDone && (
        <button
          type="button"
          onClick={onCompare}
          className="flex items-center gap-1 text-[11px] text-info transition-colors hover:text-info/80"
        >
          <GitCompare size={12} />
          Compare
        </button>
      )}
      {anyRunning && (
        <button
          type="button"
          onClick={onStopAll}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-2.5 py-1 text-[11px] text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/20"
        >
          <Square size={10} />
          Stop All
        </button>
      )}
      {allDone && (
        <button
          type="button"
          onClick={onRunAgain}
          className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-2.5 py-1 text-[11px] text-base-text transition-colors hover:bg-base-border"
        >
          <ArrowLeft size={10} />
          Run Again
        </button>
      )}
      <button
        type="button"
        onClick={onNewRun}
        className="flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-2.5 py-1 text-[11px] text-base-text-secondary transition-colors hover:text-base-text"
      >
        <Plus size={10} />
        New Run
      </button>
    </div>
  )
}
