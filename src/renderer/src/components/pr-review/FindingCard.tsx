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
    postedBorder: 'border-emerald-900/30',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-[var(--color-accent)]/40',
    text: 'text-[var(--color-warning)]',
    label: 'Warning',
    bg: 'bg-[var(--color-accent-hover)]/5',
    postedBorder: 'border-emerald-900/30',
  },
  suggestion: {
    icon: Lightbulb,
    border: 'border-[var(--color-info)]/40',
    text: 'text-[var(--color-info)]',
    label: 'Suggestion',
    bg: 'bg-[var(--color-info)]/5',
    postedBorder: 'border-emerald-900/30',
  },
  nitpick: {
    icon: Info,
    border: 'border-[var(--color-base-border)]/40',
    text: 'text-[var(--color-base-text-muted)]',
    label: 'Nitpick',
    bg: 'bg-[var(--color-base-text-muted)]/5',
    postedBorder: 'border-emerald-900/30',
  },
}

export function FindingCard({ finding, checked, isPosting, onToggle, onPost }: Props) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.suggestion
  const Icon = style.icon

  const borderClass = finding.posted ? style.postedBorder : style.border
  const bgClass = finding.posted ? 'bg-emerald-500/5' : style.bg

  return (
    <div
      className={`group rounded-lg border ${borderClass} ${bgClass} transition-all duration-300`}
    >
      <div className="flex gap-3 p-3">
        {/* Checkbox / Posting spinner / Posted indicator */}
        <div className="flex flex-shrink-0 flex-col items-center gap-1 pt-0.5">
          {isPosting ? (
            <Loader2 size={14} className="animate-spin text-[var(--color-base-text-secondary)]" />
          ) : finding.posted ? (
            <CheckCircle2 size={14} className="text-emerald-500" />
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="h-3.5 w-3.5 rounded border-[var(--color-base-border)] bg-[var(--color-base-raised)] accent-[var(--color-accent)]"
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
              className={`mt-0.5 flex-shrink-0 ${finding.posted ? 'text-emerald-500' : style.text}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-semibold text-[10px] uppercase tracking-wide ${finding.posted ? 'text-emerald-500' : style.text}`}
                >
                  {finding.posted ? 'Posted' : style.label}
                </span>
                <span className="font-medium text-[var(--color-base-text)] text-xs">
                  {finding.title}
                </span>
                {finding.domain && (
                  <span className="rounded bg-[var(--color-base-raised)] px-1.5 py-0.5 font-medium text-[9px] text-[var(--color-base-text-muted)] uppercase tracking-wider">
                    {DOMAIN_LABELS[finding.domain] ?? finding.domain}
                  </span>
                )}
              </div>
              {finding.file && (
                <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-base-text-muted)]">
                  {finding.file}
                  {finding.line ? `:${finding.line}` : ''}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 pl-5 text-[var(--color-base-text-secondary)] text-xs leading-relaxed">
            {finding.description}
          </p>
        </div>

        {/* Post action */}
        {!finding.posted && !isPosting && (
          <button
            type="button"
            onClick={onPost}
            title="Post this finding"
            className="flex-shrink-0 self-start rounded p-1.5 text-[var(--color-base-text-faint)] opacity-0 transition-all hover:bg-[var(--color-base-border)]/50 hover:text-[var(--color-base-text)] group-hover:opacity-100"
          >
            <Send size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
