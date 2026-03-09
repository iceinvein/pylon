import { usePrReviewStore } from '../../store/pr-review-store'
import { FindingCard } from './FindingCard'

type Props = {
  repoFullName: string
  prNumber: number
}

export function FindingsList({ repoFullName, prNumber }: Props) {
  const { activeFindings, selectedFindingIds, toggleFinding, postFinding } = usePrReviewStore()

  if (activeFindings.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-stone-500">
        No findings from this review.
      </div>
    )
  }

  const sorted = [...activeFindings].sort((a, b) => {
    if (a.posted !== b.posted) return a.posted ? 1 : -1
    const order: Record<string, number> = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 }
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-stone-400">
          Findings ({activeFindings.length})
        </h3>
        <div className="flex gap-2 text-xs text-stone-500">
          <span>{activeFindings.filter((f) => f.posted).length} posted</span>
        </div>
      </div>
      <div className="space-y-2">
        {sorted.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            checked={selectedFindingIds.has(f.id)}
            onToggle={() => toggleFinding(f.id)}
            onPost={() => postFinding(f, repoFullName, prNumber)}
          />
        ))}
      </div>
    </div>
  )
}
