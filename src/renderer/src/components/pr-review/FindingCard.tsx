import { CheckCircle2, Send, AlertCircle, AlertTriangle, Lightbulb, Info, Loader2 } from 'lucide-react'
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

const SEVERITY_STYLES: Record<string, { icon: typeof AlertCircle; border: string; text: string; label: string; bg: string; postedBorder: string }> = {
  critical: { icon: AlertCircle, border: 'border-red-900/40', text: 'text-red-400', label: 'Critical', bg: 'bg-red-500/5', postedBorder: 'border-emerald-900/30' },
  warning: { icon: AlertTriangle, border: 'border-amber-900/40', text: 'text-amber-400', label: 'Warning', bg: 'bg-amber-500/5', postedBorder: 'border-emerald-900/30' },
  suggestion: { icon: Lightbulb, border: 'border-blue-900/40', text: 'text-blue-400', label: 'Suggestion', bg: 'bg-blue-500/5', postedBorder: 'border-emerald-900/30' },
  nitpick: { icon: Info, border: 'border-stone-700/40', text: 'text-stone-500', label: 'Nitpick', bg: 'bg-stone-500/5', postedBorder: 'border-emerald-900/30' },
}

export function FindingCard({ finding, checked, isPosting, onToggle, onPost }: Props) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.suggestion
  const Icon = style.icon

  const borderClass = finding.posted ? style.postedBorder : style.border
  const bgClass = finding.posted ? 'bg-emerald-500/5' : style.bg

  return (
    <div className={`group rounded-lg border ${borderClass} ${bgClass} transition-all duration-300`}>
      <div className="flex gap-3 p-3">
        {/* Checkbox / Posting spinner / Posted indicator */}
        <div className="flex flex-shrink-0 flex-col items-center gap-1 pt-0.5">
          {isPosting ? (
            <Loader2 size={14} className="animate-spin text-stone-400" />
          ) : finding.posted ? (
            <CheckCircle2 size={14} className="text-emerald-500" />
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="h-3.5 w-3.5 rounded border-stone-600 bg-stone-800 accent-stone-400"
            />
          )}
        </div>

        {/* Content */}
        <div className={`min-w-0 flex-1 ${finding.posted ? 'opacity-60' : ''} transition-opacity duration-300`}>
          <div className="flex items-start gap-2">
            <Icon size={13} className={`mt-0.5 flex-shrink-0 ${finding.posted ? 'text-emerald-500' : style.text}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${finding.posted ? 'text-emerald-500' : style.text}`}>
                  {finding.posted ? 'Posted' : style.label}
                </span>
                <span className="text-xs font-medium text-stone-200">{finding.title}</span>
                {finding.domain && (
                  <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-stone-500">
                    {DOMAIN_LABELS[finding.domain] ?? finding.domain}
                  </span>
                )}
              </div>
              {finding.file && (
                <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-stone-500">
                  {finding.file}{finding.line ? `:${finding.line}` : ''}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 pl-5 text-xs leading-relaxed text-stone-400">
            {finding.description}
          </p>
        </div>

        {/* Post action */}
        {!finding.posted && !isPosting && (
          <button
            onClick={onPost}
            title="Post this finding"
            className="flex-shrink-0 self-start rounded p-1.5 text-stone-600 opacity-0 transition-all hover:bg-stone-700/50 hover:text-stone-300 group-hover:opacity-100"
          >
            <Send size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
