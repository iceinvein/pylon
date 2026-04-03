import { AlertTriangle, Bug, ChevronRight, Info } from 'lucide-react'
import { useState } from 'react'
import type { FindingSeverity, TestFinding } from '../../../../shared/types'
import { GeneratedTestItem } from './GeneratedTestItem'

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-[var(--color-error)]/20 text-[var(--color-error)]',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-[var(--color-info)]/20 text-[var(--color-info)]',
  info: 'bg-[var(--color-base-text-muted)]/20 text-[var(--color-base-text-secondary)]',
}

const SEVERITY_ICONS: Record<FindingSeverity, typeof Bug> = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: Bug,
  low: Info,
  info: Info,
}

type FindingCardProps = {
  finding: TestFinding
  agentColor?: string
  goalText?: string
  linkedTestPath?: string | null
  cwd?: string
}

export function FindingCard({ finding, agentColor, goalText, linkedTestPath, cwd }: FindingCardProps) {
  const [showTest, setShowTest] = useState(false)
  const Icon = SEVERITY_ICONS[finding.severity]

  return (
    <div className="rounded-lg border border-base-border bg-base-raised/50 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-base-text-secondary" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-medium text-xs ${SEVERITY_COLORS[finding.severity]}`}
            >
              {finding.severity}
            </span>
            {goalText && (
              <span className="flex items-center gap-1 truncate rounded bg-base-border/60 px-1.5 py-0.5 text-[10px] text-base-text-secondary">
                {agentColor && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: agentColor }}
                  />
                )}
                {goalText}
              </span>
            )}
          </div>
          <p className="mb-1 font-medium text-base-text text-sm">{finding.title}</p>
          <p className="mb-1 text-base-text-secondary text-xs">{finding.description}</p>
          {finding.url && (
            <p className="mb-1 truncate text-info text-xs">{finding.url}</p>
          )}

          {finding.reproductionSteps.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[11px] text-base-text-muted uppercase tracking-wider">
                Reproduction steps
              </p>
              <ol className="list-inside list-decimal space-y-0.5 text-base-text-secondary text-xs">
                {finding.reproductionSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {linkedTestPath && cwd && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowTest(!showTest)}
                className="flex items-center gap-1 text-success text-xs transition-colors hover:text-success/80"
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${showTest ? 'rotate-90' : ''}`}
                />
                View test
              </button>
              {showTest && (
                <div className="mt-1">
                  <GeneratedTestItem path={linkedTestPath} cwd={cwd} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
