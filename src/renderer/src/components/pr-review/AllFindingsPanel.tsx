import { CheckCircle2 } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { FindingCard } from './FindingCard'

type Props = {
  repoFullName: string
  prNumber: number
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  suggestion: 2,
  nitpick: 3,
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  warning: 'Warning',
  suggestion: 'Suggestion',
  nitpick: 'Nitpick',
}

const SEVERITY_CHIP_ACTIVE: Record<string, string> = {
  critical: 'bg-[var(--color-error)] text-base-text',
  warning: 'bg-[var(--color-warning)] text-base-text',
  suggestion: 'bg-[var(--color-info)] text-base-text',
  nitpick: 'bg-[var(--color-base-text-faint)] text-base-text',
}

const ALL_SEVERITIES = ['critical', 'warning', 'suggestion', 'nitpick'] as const

export function AllFindingsPanel({ repoFullName, prNumber }: Props) {
  const {
    activeFindings,
    selectedFindingIds,
    postingFindingIds,
    severityFilter,
    toggleFinding,
    postFinding,
    toggleSeverityFilter,
    navigateToFinding,
  } = usePrReviewStore()

  const filtered = activeFindings
    .filter((f) => severityFilter.has(f.severity))
    .sort((a, b) => {
      if (a.posted !== b.posted) return a.posted ? 1 : -1
      const sevDiff = (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)
      if (sevDiff !== 0) return sevDiff
      return a.file.localeCompare(b.file)
    })

  const counts = new Map<string, number>()
  for (const f of activeFindings) {
    counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter chips */}
      <div className="flex items-center gap-2 border-base-border-subtle border-b px-4 py-2">
        <span className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
          Filter
        </span>
        {ALL_SEVERITIES.map((sev) => {
          const count = counts.get(sev) ?? 0
          if (count === 0) return null
          const active = severityFilter.has(sev)
          return (
            <button
              key={sev}
              type="button"
              onClick={() => toggleSeverityFilter(sev)}
              className={`rounded-full px-2.5 py-0.5 font-medium text-[10px] tabular-nums transition-colors ${
                active
                  ? SEVERITY_CHIP_ACTIVE[sev]
                  : 'border border-base-border text-base-text-muted hover:text-base-text'
              }`}
            >
              {SEVERITY_LABELS[sev]} ({count})
            </button>
          )
        })}
      </div>

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-base-text-faint">
            <CheckCircle2 size={24} strokeWidth={1.5} />
            <p className="text-xs">
              {activeFindings.length === 0 ? 'No findings from this review.' : 'No findings match the current filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                checked={selectedFindingIds.has(f.id)}
                isPosting={postingFindingIds.has(f.id)}
                onToggle={() => toggleFinding(f.id)}
                onPost={() => postFinding(f, repoFullName, prNumber)}
                onNavigate={() => navigateToFinding(f.id)}
                showFilePath
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
