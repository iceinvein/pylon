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
  critical: {
    icon: AlertCircle,
    border: 'border-l-red-500',
    text: 'text-[var(--color-error)]',
    bg: 'bg-[var(--color-error)]/5',
    label: 'Critical',
    postedBorder: 'border-l-emerald-500',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-l-amber-500',
    text: 'text-[var(--color-warning)]',
    bg: 'bg-[var(--color-accent-hover)]/5',
    label: 'Warning',
    postedBorder: 'border-l-emerald-500',
  },
  suggestion: {
    icon: Lightbulb,
    border: 'border-l-blue-500',
    text: 'text-[var(--color-info)]',
    bg: 'bg-[var(--color-info)]/5',
    label: 'Suggestion',
    postedBorder: 'border-l-emerald-500',
  },
  nitpick: {
    icon: Info,
    border: 'border-l-[var(--color-base-text-muted)]',
    text: 'text-[var(--color-base-text-muted)]',
    bg: 'bg-[var(--color-base-text-muted)]/5',
    label: 'Nitpick',
    postedBorder: 'border-l-emerald-500',
  },
}

export function DiffFindingAnnotation({ finding, checked, onToggle, onPost }: Props) {
  const postingFindingIds = usePrReviewStore((s) => s.postingFindingIds)
  const isPosting = postingFindingIds.has(finding.id)
  const config = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.suggestion
  const Icon = config.icon

  const borderClass = finding.posted ? config.postedBorder : config.border
  const bgClass = finding.posted ? 'bg-emerald-500/5' : config.bg

  return (
    <div
      data-finding-id={finding.id}
      className={`group border-l-2 ${borderClass} ${bgClass} mx-2 my-1 rounded-r-md transition-all duration-300`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="flex-shrink-0 pt-0.5">
          {isPosting ? (
            <Loader2 size={12} className="animate-spin text-[var(--color-base-text-secondary)]" />
          ) : finding.posted ? (
            <CheckCircle2 size={12} className="text-emerald-500" />
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="h-3 w-3 rounded border-[var(--color-base-border)] bg-[var(--color-base-raised)] accent-[var(--color-accent)]"
            />
          )}
        </div>

        <div
          className={`min-w-0 flex-1 ${finding.posted ? 'opacity-60' : ''} transition-opacity duration-300`}
        >
          <div className="flex items-center gap-1.5">
            <Icon
              size={11}
              className={`flex-shrink-0 ${finding.posted ? 'text-emerald-500' : config.text}`}
            />
            <span
              className={`font-semibold text-[10px] uppercase tracking-wide ${finding.posted ? 'text-emerald-500' : config.text}`}
            >
              {finding.posted ? 'Posted' : config.label}
            </span>
            <span className="font-medium text-[11px] text-[var(--color-base-text)]">
              {finding.title}
            </span>
            {finding.domain && (
              <span className="rounded bg-[var(--color-base-raised)] px-1 py-0.5 font-medium text-[9px] text-[var(--color-base-text-muted)] uppercase tracking-wider">
                {DOMAIN_LABELS[finding.domain] ?? finding.domain}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-base-text-secondary)] leading-relaxed">
            {finding.description}
          </p>
        </div>

        {!finding.posted && !isPosting && (
          <button
            type="button"
            onClick={onPost}
            title="Post this finding"
            className="flex-shrink-0 rounded p-1 text-[var(--color-base-text-faint)] opacity-0 transition-all hover:bg-[var(--color-base-border)]/50 hover:text-[var(--color-base-text)] group-hover:opacity-100"
          >
            <Send size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
