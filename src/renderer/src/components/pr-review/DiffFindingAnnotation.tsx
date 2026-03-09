import { CheckCircle2, Send, AlertCircle, AlertTriangle, Lightbulb, Info } from 'lucide-react'
import type { ReviewFinding } from '../../../../shared/types'

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

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertCircle; border: string; text: string; bg: string; label: string }> = {
  critical: { icon: AlertCircle, border: 'border-l-red-500', text: 'text-red-400', bg: 'bg-red-500/5', label: 'Critical' },
  warning: { icon: AlertTriangle, border: 'border-l-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/5', label: 'Warning' },
  suggestion: { icon: Lightbulb, border: 'border-l-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/5', label: 'Suggestion' },
  nitpick: { icon: Info, border: 'border-l-stone-500', text: 'text-stone-500', bg: 'bg-stone-500/5', label: 'Nitpick' },
}

export function DiffFindingAnnotation({ finding, checked, onToggle, onPost }: Props) {
  const config = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.suggestion
  const Icon = config.icon

  return (
    <div data-finding-id={finding.id} className={`group border-l-2 ${config.border} ${config.bg} mx-2 my-1 rounded-r-md`}>
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="flex-shrink-0 pt-0.5">
          {finding.posted ? (
            <CheckCircle2 size={12} className="text-emerald-500" />
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="h-3 w-3 rounded border-stone-600 bg-stone-800 accent-stone-400"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon size={11} className={`flex-shrink-0 ${config.text}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${config.text}`}>
              {config.label}
            </span>
            <span className="text-[11px] font-medium text-stone-200">{finding.title}</span>
            {finding.domain && (
              <span className="rounded bg-stone-800 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-stone-500">
                {DOMAIN_LABELS[finding.domain] ?? finding.domain}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-400">
            {finding.description}
          </p>
        </div>

        {!finding.posted && (
          <button
            onClick={onPost}
            title="Post this finding"
            className="flex-shrink-0 rounded p-1 text-stone-600 opacity-0 transition-all hover:bg-stone-700/50 hover:text-stone-300 group-hover:opacity-100"
          >
            <Send size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
