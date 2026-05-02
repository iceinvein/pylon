import { CheckCircle2 } from 'lucide-react'
import { useMemo } from 'react'
import { isVisibleLatestRunFinding } from '../../lib/pr-review-findings'
import { splitFindingsForReview } from '../../lib/pr-review-presentation'
import { usePrReviewStore } from '../../store/pr-review-store'
import { FindingCard } from './FindingCard'

type Props = {
  repoFullName: string
  prNumber: number
}

export function FindingsList({ repoFullName, prNumber }: Props) {
  const { activeFindings, selectedFindingIds, postingFindingIds, toggleFinding, postFinding } =
    usePrReviewStore()
  const visibleFindings = useMemo(
    () => activeFindings.filter((finding) => isVisibleLatestRunFinding(finding)),
    [activeFindings],
  )
  const split = useMemo(() => splitFindingsForReview(visibleFindings), [visibleFindings])

  if (visibleFindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-base-text-faint">
        <CheckCircle2 size={24} strokeWidth={1.5} />
        <p className="text-xs">No findings from this review.</p>
      </div>
    )
  }

  const blockerCount = visibleFindings.filter((f) => f.severity === 'blocker').length
  const highCount = visibleFindings.filter((f) => f.severity === 'high').length
  const mediumCount = visibleFindings.filter((f) => f.severity === 'medium').length
  const postedCount = visibleFindings.filter((f) => f.posted).length
  const hiddenCount = split.suggestions.length

  return (
    <div>
      {/* Header with stats */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-medium text-base-text-secondary text-xs">
          {activeFindings.length} finding{activeFindings.length !== 1 ? 's' : ''}
        </span>
        {hiddenCount > 0 && (
          <span className="rounded border border-base-border px-1.5 py-0.5 font-medium text-[10px] text-base-text-faint tabular-nums">
            {hiddenCount} hidden
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {blockerCount > 0 && (
            <span className="rounded bg-error/10 px-1.5 py-0.5 font-medium text-[10px] text-error tabular-nums">
              {blockerCount} blocker{blockerCount !== 1 ? 's' : ''}
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded bg-risk-high/10 px-1.5 py-0.5 font-medium text-[10px] text-risk-high tabular-nums">
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="rounded bg-risk-medium/10 px-1.5 py-0.5 font-medium text-[10px] text-risk-medium tabular-nums">
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
        {split.actionable.map(({ finding: f, tier, signals }) => (
          <FindingCard
            key={f.id}
            finding={f}
            presentationTier={tier}
            presentationSignals={signals}
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
