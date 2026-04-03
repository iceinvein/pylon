import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { diffFindings } from '../../lib/comparison'
import { useTestStore } from '../../store/test-store'
import { FindingCard } from './FindingCard'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ComparisonView() {
  const comparisonBaselineId = useTestStore((s) => s.comparisonBaselineId)
  const comparisonTargetId = useTestStore((s) => s.comparisonTargetId)
  const explorations = useTestStore((s) => s.explorations)
  const findingsByExploration = useTestStore((s) => s.findingsByExploration)
  const exitComparison = useTestStore((s) => s.exitComparison)

  const baselineExploration = explorations.find((e) => e.id === comparisonBaselineId)
  const targetExploration = explorations.find((e) => e.id === comparisonTargetId)

  const baselineFindings = useMemo(() => {
    if (!baselineExploration) return []
    if (baselineExploration.batchId) {
      const batchExps = explorations.filter((e) => e.batchId === baselineExploration.batchId)
      return batchExps.flatMap((e) => findingsByExploration[e.id] ?? [])
    }
    return findingsByExploration[baselineExploration.id] ?? []
  }, [baselineExploration, explorations, findingsByExploration])

  const targetFindings = useMemo(() => {
    if (!targetExploration) return []
    if (targetExploration.batchId) {
      const batchExps = explorations.filter((e) => e.batchId === targetExploration.batchId)
      return batchExps.flatMap((e) => findingsByExploration[e.id] ?? [])
    }
    return findingsByExploration[targetExploration.id] ?? []
  }, [targetExploration, explorations, findingsByExploration])

  const diff = useMemo(
    () => diffFindings(baselineFindings, targetFindings),
    [baselineFindings, targetFindings],
  )

  if (!baselineExploration || !targetExploration) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-base-text-muted">Missing comparison data</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-base-border-subtle border-b px-4 py-3">
        <button
          type="button"
          onClick={exitComparison}
          className="flex items-center gap-1 text-base-text-secondary text-sm transition-colors hover:text-base-text"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <span className="text-base-text-muted text-sm">|</span>
        <span className="text-base-text text-sm">Comparing runs</span>
      </div>

      <div className="flex items-center gap-3 border-base-border-subtle border-b px-4 py-2">
        <span className="rounded bg-success/20 px-2 py-0.5 text-[11px] text-success">
          +{diff.new.length} new
        </span>
        <span className="rounded bg-error/20 px-2 py-0.5 text-[11px] text-error">
          -{diff.resolved.length} resolved
        </span>
        <span className="rounded bg-base-border px-2 py-0.5 text-[11px] text-base-text-muted">
          {diff.unchanged.length} unchanged
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col overflow-hidden border-base-border-subtle border-r">
          <div className="border-base-border-subtle border-b px-4 py-2">
            <p className="font-medium text-base-text text-sm">Baseline</p>
            <p className="text-[11px] text-base-text-faint">
              {formatDate(baselineExploration.createdAt)} · {baselineFindings.length} findings
            </p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {diff.resolved.map((f) => (
              <div key={f.id} className="rounded-lg border-l-2 border-l-error opacity-60">
                <FindingCard finding={f} />
              </div>
            ))}
            {diff.unchanged.map(({ baseline }) => (
              <FindingCard key={baseline.id} finding={baseline} />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-base-border-subtle border-b px-4 py-2">
            <p className="font-medium text-base-text text-sm">Current</p>
            <p className="text-[11px] text-base-text-faint">
              {formatDate(targetExploration.createdAt)} · {targetFindings.length} findings
            </p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {diff.new.map((f) => (
              <div key={f.id} className="rounded-lg border-l-2 border-l-success">
                <FindingCard finding={f} />
              </div>
            ))}
            {diff.unchanged.map(({ target }) => (
              <FindingCard key={target.id} finding={target} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
