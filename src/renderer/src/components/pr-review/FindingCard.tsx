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

type Props = {
  finding: ReviewFinding
  checked: boolean
  isPosting: boolean
  onToggle: () => void
  onPost: () => void
  onNavigate?: () => void
  showFilePath?: boolean
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

const SEVERITY_STYLES: Record<
  string,
  {
    icon: typeof AlertCircle
    border: string
    text: string
    label: string
    bg: string
    postedBorder: string
  }
> = {
  blocker: {
    icon: AlertCircle,
    border: 'border-[var(--color-error)]/40',
    text: 'text-[var(--color-error)]',
    label: 'Blocker',
    bg: 'bg-[var(--color-error)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  high: {
    icon: AlertTriangle,
    border: 'border-[var(--color-risk-high)]/35',
    text: 'text-[var(--color-risk-high)]',
    label: 'High',
    bg: 'bg-[var(--color-risk-high)]/6',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  medium: {
    icon: Lightbulb,
    border: 'border-[var(--color-risk-medium)]/40',
    text: 'text-[var(--color-risk-medium)]',
    label: 'Medium',
    bg: 'bg-[var(--color-risk-medium)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  low: {
    icon: Info,
    border: 'border-[var(--color-base-border)]/40',
    text: 'text-[var(--color-base-text-muted)]',
    label: 'Low',
    bg: 'bg-[var(--color-base-text-muted)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
}

export function FindingCard({
  finding,
  checked,
  isPosting,
  onToggle,
  onPost,
  onNavigate,
  showFilePath,
}: Props) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.medium
  const Icon = style.icon
  const descriptionSections = parseReviewFindingDescription(finding.description)

  const borderClass = finding.posted ? style.postedBorder : style.border
  const bgClass = finding.posted ? 'bg-[var(--color-success)]/5' : style.bg

  return (
    <div
      className={`group rounded-lg border ${borderClass} ${bgClass} transition-all duration-300`}
    >
      <div className="flex gap-3 p-3">
        {/* Checkbox / Posting spinner / Posted indicator */}
        <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
          {isPosting ? (
            <Loader2 size={14} className="animate-spin text-base-text-secondary" />
          ) : finding.posted ? (
            <CheckCircle2 size={14} className="text-success" />
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="h-3.5 w-3.5 rounded border-base-border bg-base-raised accent-accent"
            />
          )}
        </div>

        {/* Content */}
        <div
          className={`min-w-0 flex-1 ${finding.posted ? 'opacity-60' : ''} transition-opacity duration-300`}
        >
          <div className="flex items-start gap-2">
            <Icon
              size={13}
              className={`mt-0.5 shrink-0 ${finding.posted ? 'text-success' : style.text}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-semibold text-[10px] uppercase tracking-wide ${finding.posted ? 'text-success' : style.text}`}
                >
                  {finding.posted ? 'Posted' : style.label}
                </span>
                <span className="font-medium text-base-text text-xs">{finding.title}</span>
                {finding.domain && (
                  <span className="rounded bg-base-raised px-1.5 py-0.5 font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                    {DOMAIN_LABELS[finding.domain] ?? finding.domain}
                  </span>
                )}
              </div>
              {finding.file && (
                <div className="mt-0.5 font-mono text-base-text-muted text-xs">
                  {showFilePath && onNavigate ? (
                    <button
                      type="button"
                      onClick={onNavigate}
                      className="transition-colors hover:text-base-text"
                    >
                      {finding.file}
                      {finding.line ? `:${finding.line}` : ''}{' '}
                      <span className="text-base-text-faint">→</span>
                    </button>
                  ) : (
                    <>
                      {finding.file}
                      {finding.line ? `:${finding.line}` : ''}
                    </>
                  )}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-1.5 pl-0 text-[10px] text-base-text-faint">
                <span>Impact: {finding.risk.impact}</span>
                <span>Likelihood: {finding.risk.likelihood}</span>
                <span>Confidence: {finding.risk.confidence}</span>
                <span>Action: {finding.risk.action}</span>
              </div>
            </div>
          </div>
          <div className="mt-2 space-y-1.5 pl-5">
            {descriptionSections.map((section) => (
              <div key={`${finding.id}-${section.kind}-${section.label}`} className="space-y-0.5">
                <p className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                  {section.label}
                </p>
                <p className="text-base-text-secondary text-xs leading-relaxed">{section.body}</p>
              </div>
            ))}
          </div>
          {finding.mergedFrom && finding.mergedFrom.length > 0 && (
            <p className="mt-1 pl-5 text-[10px] text-base-text-faint italic">
              Also flagged by: {finding.mergedFrom.map((m) => m.domain).join(', ')}
            </p>
          )}
        </div>

        {/* Post action */}
        {!finding.posted && !isPosting && (
          <button
            type="button"
            onClick={onPost}
            title="Post this finding"
            className="shrink-0 self-start rounded p-1.5 text-base-text-faint opacity-0 transition-all hover:bg-base-border/50 hover:text-base-text group-hover:opacity-100"
          >
            <Send size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
