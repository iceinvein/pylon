import { CheckCircle2, Send } from 'lucide-react'
import type { ReviewFinding } from '../../../../shared/types'

type Props = {
  finding: ReviewFinding
  checked: boolean
  onToggle: () => void
  onPost: () => void
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-950/30 border-red-900/50', text: 'text-red-400', label: 'Critical' },
  warning: { bg: 'bg-amber-950/30 border-amber-900/50', text: 'text-amber-400', label: 'Warning' },
  suggestion: { bg: 'bg-blue-950/30 border-blue-900/50', text: 'text-blue-400', label: 'Suggestion' },
  nitpick: { bg: 'bg-stone-800/50 border-stone-700/50', text: 'text-stone-400', label: 'Nitpick' },
}

export function FindingCard({ finding, checked, onToggle, onPost }: Props) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.suggestion

  return (
    <div className={`rounded-lg border p-3 ${style.bg}`}>
      <div className="flex items-start gap-3">
        {!finding.posted && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded border-stone-600 bg-stone-800 accent-stone-400"
          />
        )}
        {finding.posted && (
          <CheckCircle2 size={14} className="mt-1 flex-shrink-0 text-green-500" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
            <span className="text-sm font-medium text-stone-200">{finding.title}</span>
          </div>
          {finding.file && (
            <div className="mt-0.5 text-xs text-stone-500">
              {finding.file}{finding.line ? `:${finding.line}` : ''}
            </div>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
            {finding.description}
          </p>
        </div>

        {!finding.posted && (
          <button
            onClick={onPost}
            title="Post this finding"
            className="flex-shrink-0 rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-700 hover:text-stone-300"
          >
            <Send size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
