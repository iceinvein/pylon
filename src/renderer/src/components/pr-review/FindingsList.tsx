import { CheckCircle2 } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { FindingCard } from './FindingCard'

type Props = {
  repoFullName: string
  prNumber: number
}

const SEVERITY_ORDER: Record<string, number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function FindingsList({ repoFullName, prNumber }: Props) {
  const { activeFindings, selectedFindingIds, postingFindingIds, toggleFinding, postFinding } =
    usePrReviewStore()

  if (activeFindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-base-text-faint">
        <CheckCircle2 size={24} strokeWidth={1.5} />
        <p className="text-xs">No findings from this review.</p>
      </div>
    )
  }

  const sorted = [...activeFindings].sort((a, b) => {
    if (a.posted !== b.posted) return a.posted ? 1 : -1
    return (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)
  })

  const blockerCount = activeFindings.filter((f) => f.severity === 'blocker').length
  const highCount = activeFindings.filter((f) => f.severity === 'high').length
  const mediumCount = activeFindings.filter((f) => f.severity === 'medium').length
  const postedCount = activeFindings.filter((f) => f.posted).length

  return (
    <div>
      {/* Header with stats */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-medium text-base-text-secondary text-xs">
          {activeFindings.length} finding{activeFindings.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1.5">
          {blockerCount > 0 && (
            <span className="rounded bg-error/10 px-1.5 py-0.5 font-medium text-[10px] text-error tabular-nums">
              {blockerCount} blocker{blockerCount !== 1 ? 's' : ''}
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded bg-[var(--color-risk-high)]/10 px-1.5 py-0.5 font-medium text-[10px] text-[var(--color-risk-high)] tabular-nums">
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="rounded bg-[var(--color-risk-medium)]/10 px-1.5 py-0.5 font-medium text-[10px] text-[var(--color-risk-medium)] tabular-nums">
              {mediumCount} medium
            </span>
          )}
        </div>
        {postedCount > 0 && (
          <span className="ml-auto text-[10px] text-success">{postedCount} posted</span>
        )}
      </div>

      {/* Finding cards */}
      <div className="space-y-2">
        {sorted.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            checked={selectedFindingIds.has(f.id)}
            isPosting={postingFindingIds.has(f.id)}
            onToggle={() => toggleFinding(f.id)}
            onPost={() => postFinding(f, repoFullName, prNumber)}
          />
        ))}
      </div>
    </div>
  )
}
