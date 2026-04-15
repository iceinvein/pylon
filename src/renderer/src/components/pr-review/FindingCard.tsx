import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  Loader2,
  Send,
} from 'lucide-react'
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
  critical: {
    icon: AlertCircle,
    border: 'border-[var(--color-error)]/40',
    text: 'text-[var(--color-error)]',
    label: 'Critical',
    bg: 'bg-[var(--color-error)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-[var(--color-warning)]/35',
    text: 'text-[var(--color-warning)]',
    label: 'Warning',
    bg: 'bg-[var(--color-warning)]/6',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  suggestion: {
    icon: Lightbulb,
    border: 'border-[var(--color-info)]/40',
    text: 'text-[var(--color-info)]',
    label: 'Suggestion',
    bg: 'bg-[var(--color-info)]/5',
    postedBorder: 'border-[var(--color-success)]/30',
  },
  nitpick: {
    icon: Info,
    border: 'border-[var(--color-base-border)]/40',
    text: 'text-[var(--color-base-text-muted)]',
    label: 'Nitpick',
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
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.suggestion
  const Icon = style.icon

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
            </div>
          </div>
          <p className="mt-2 pl-5 text-base-text-secondary text-xs leading-relaxed">
            {finding.description}
          </p>
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
