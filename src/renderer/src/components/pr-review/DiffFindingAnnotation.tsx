import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  Loader2,
  Send,
} from 'lucide-react'
import { parseReviewFindingDescription } from '../../../../shared/review-finding-description'
import type { ReviewFinding } from '../../../../shared/types'
import {
  isPostableFinding,
  REVIEW_FINDING_STATUS_LABELS,
  REVIEW_FINDING_STATUS_STYLES,
} from '../../lib/pr-review-findings'
import { usePrReviewStore } from '../../store/pr-review-store'

type Props = {
  finding: ReviewFinding
  checked: boolean
  onToggle: () => void
  onPost: () => void
}

const DOMAIN_LABELS: Record<string, string> = {
  security: 'Security',
  bugs: 'Bugs',
  performance: 'Perf',
  'code-smells': 'Smells',
  style: 'Style',
  architecture: 'Arch',
  ux: 'UX',
}

const SEVERITY_CONFIG: Record<
  string,
  {
    icon: typeof AlertCircle
    border: string
    text: string
    bg: string
    label: string
    postedBorder: string
  }
> = {
  blocker: {
    icon: AlertCircle,
    border: 'border-l-[var(--color-error)]',
    text: 'text-[var(--color-error)]',
    bg: 'bg-[var(--color-error)]/5',
    label: 'Blocker',
    postedBorder: 'border-l-[var(--color-success)]',
  },
  high: {
    icon: AlertTriangle,
    border: 'border-l-[var(--color-risk-high)]',
    text: 'text-[var(--color-risk-high)]',
    bg: 'bg-[var(--color-risk-high)]/6',
    label: 'High',
    postedBorder: 'border-l-[var(--color-success)]',
  },
  medium: {
    icon: Lightbulb,
    border: 'border-l-[var(--color-risk-medium)]',
    text: 'text-[var(--color-risk-medium)]',
    bg: 'bg-[var(--color-risk-medium)]/5',
    label: 'Medium',
    postedBorder: 'border-l-[var(--color-success)]',
  },
  low: {
    icon: Info,
    border: 'border-l-[var(--color-base-text-muted)]',
    text: 'text-[var(--color-base-text-muted)]',
    bg: 'bg-[var(--color-base-text-muted)]/5',
    label: 'Low',
    postedBorder: 'border-l-[var(--color-success)]',
  },
}

export function DiffFindingAnnotation({ finding, checked, onToggle, onPost }: Props) {
  const postingFindingIds = usePrReviewStore((s) => s.postingFindingIds)
  const isPosting = postingFindingIds.has(finding.id)
  const config = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.medium
  const Icon = config.icon
  const descriptionSections = parseReviewFindingDescription(finding.description)
  const canPost = isPostableFinding(finding)

  const borderClass = finding.posted ? config.postedBorder : config.border
  const bgClass = finding.posted ? 'bg-[var(--color-success)]/5' : config.bg

  return (
    <div
      data-finding-id={finding.id}
      className={`group border-l-2 ${borderClass} ${bgClass} mx-2 my-1 rounded-r-md transition-all duration-300`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="shrink-0 pt-0.5">
          {isPosting ? (
            <Loader2 size={12} className="animate-spin text-base-text-secondary" />
          ) : finding.posted ? (
            <CheckCircle2 size={12} className="text-success" />
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              disabled={!canPost}
              className="h-3 w-3 rounded border-base-border bg-base-raised accent-accent"
            />
          )}
        </div>

        <div
          className={`min-w-0 flex-1 ${finding.posted ? 'opacity-60' : ''} transition-opacity duration-300`}
        >
          <div className="flex items-center gap-1.5">
            <Icon
              size={11}
              className={`shrink-0 ${finding.posted ? 'text-success' : config.text}`}
            />
            <span
              className={`font-semibold text-[10px] uppercase tracking-wide ${finding.posted ? 'text-success' : config.text}`}
            >
              {finding.posted ? 'Posted' : config.label}
            </span>
            <span className="font-medium text-base-text text-xs">{finding.title}</span>
            {finding.domain && (
              <span className="rounded bg-base-raised px-1 py-0.5 font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                {DOMAIN_LABELS[finding.domain] ?? finding.domain}
              </span>
            )}
            <span
              className={`rounded-full px-1 py-0.5 font-medium text-[10px] uppercase tracking-wide ${
                REVIEW_FINDING_STATUS_STYLES[finding.statusInRun]
              }`}
            >
              {REVIEW_FINDING_STATUS_LABELS[finding.statusInRun]}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {descriptionSections.map((section) => (
              <div key={`${finding.id}-${section.kind}-${section.label}`} className="space-y-0.5">
                <p className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                  {section.label}
                </p>
                <p className="text-base-text-secondary text-xs leading-relaxed">{section.body}</p>
              </div>
            ))}
            {finding.suggestion && (
              <div className="space-y-0.5">
                <p className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                  Suggested Change
                </p>
                <pre className="overflow-x-auto rounded-md border border-base-border bg-base-raised/80 px-3 py-2 font-mono text-[11px] text-base-text-secondary leading-relaxed">
                  <code>{finding.suggestion.body}</code>
                </pre>
              </div>
            )}
          </div>
          <p className="mt-1 text-[10px] text-base-text-faint">
            Impact: {finding.risk.impact} · Likelihood: {finding.risk.likelihood} · Confidence:{' '}
            {finding.risk.confidence} · Action: {finding.risk.action}
          </p>
        </div>

        {canPost && !isPosting && (
          <button
            type="button"
            onClick={onPost}
            title="Post this finding"
            className="shrink-0 rounded p-1 text-base-text-faint opacity-0 transition-all hover:bg-base-border/50 hover:text-base-text group-hover:opacity-100"
          >
            <Send size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
