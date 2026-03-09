import { Shield, Bug, Gauge, Paintbrush, Eye } from 'lucide-react'
import type { ReviewFocus } from '../../../../shared/types'

const FOCUS_OPTIONS: Array<{ id: ReviewFocus; label: string; icon: typeof Shield }> = [
  { id: 'general', label: 'General', icon: Eye },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'bugs', label: 'Bugs', icon: Bug },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'style', label: 'Style', icon: Paintbrush },
]

type Props = {
  selected: ReviewFocus[]
  onChange: (focus: ReviewFocus[]) => void
}

export function ReviewFocusSelector({ selected, onChange }: Props) {
  function toggle(id: ReviewFocus) {
    if (selected.includes(id)) {
      onChange(selected.filter((f) => f !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-stone-400">Review Focus</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {FOCUS_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isSelected = selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                isSelected
                  ? 'border-stone-500 bg-stone-800 text-stone-200'
                  : 'border-stone-700/50 text-stone-500 hover:border-stone-600 hover:text-stone-400'
              }`}
            >
              <Icon size={12} />
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
