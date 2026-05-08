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

  const baselineExplorationIds = useMemo(() => {
    if (!baselineExploration) return []
    if (!baselineExploration.batchId) return [baselineExploration.id]
    return explorations.filter((e) => e.batchId === baselineExploration.batchId).map((e) => e.id)
  }, [baselineExploration, explorations])

  const targetExplorationIds = useMemo(() => {
    if (!targetExploration) return []
    if (!targetExploration.batchId) return [targetExploration.id]
    return explorations.filter((e) => e.batchId === targetExploration.batchId).map((e) => e.id)
  }, [targetExploration, explorations])

  const baselineFindings = useMemo(() => {
    if (!baselineExploration) return []
    return baselineExplorationIds.flatMap((id) => findingsByExploration[id] ?? [])
  }, [baselineExploration, baselineExplorationIds, findingsByExploration])

  const targetFindings = useMemo(() => {
    if (!targetExploration) return []
    return targetExplorationIds.flatMap((id) => findingsByExploration[id] ?? [])
  }, [targetExploration, targetExplorationIds, findingsByExploration])

  const comparisonLoading = [...baselineExplorationIds, ...targetExplorationIds].some(
    (id) => !findingsByExploration[id],
  )

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
        <span className="rounded bg-success/20 px-2 py-0.5 text-success text-xs">
          +{diff.new.length} new
        </span>
        <span className="rounded bg-error/20 px-2 py-0.5 text-error text-xs">
          -{diff.resolved.length} resolved
        </span>
        <span className="rounded bg-base-border px-2 py-0.5 text-base-text-muted text-xs">
          {diff.unchanged.length} unchanged
        </span>
        {comparisonLoading && (
          <span className="text-base-text-faint text-xs">Loading full batch data...</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col overflow-hidden border-base-border-subtle border-r">
          <div className="border-base-border-subtle border-b px-4 py-2">
            <p className="font-medium text-base-text text-sm">Baseline</p>
            <p className="text-base-text-faint text-xs">
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
            <p className="text-base-text-faint text-xs">
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
