import { Blocks, Bug, Gauge, Monitor, Paintbrush, Play, Shield, X } from 'lucide-react'
import { useState } from 'react'
import type { ReviewFocus } from '../../../../shared/types'

type Props = {
  onStart: (focus: ReviewFocus[]) => void
  onClose: () => void
  isRerun?: boolean
}

const FOCUS_OPTIONS: Array<{
  id: ReviewFocus
  label: string
  description: string
  icon: typeof Shield
}> = [
  {
    id: 'security',
    label: 'Security',
    description: 'Vulnerabilities, injection, auth issues',
    icon: Shield,
  },
  {
    id: 'bugs',
    label: 'Bugs',
    description: 'Logic errors, edge cases, race conditions',
    icon: Bug,
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Bottlenecks, memory leaks, N+1 queries',
    icon: Gauge,
  },
  {
    id: 'style',
    label: 'Style',
    description: 'Naming, formatting, code organization',
    icon: Paintbrush,
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Design patterns, coupling, API contracts, SOLID',
    icon: Blocks,
  },
  {
    id: 'ux',
    label: 'UX',
    description: 'Error messages, loading states, accessibility, edge cases',
    icon: Monitor,
  },
]

export function ReviewModal({ onStart, onClose, isRerun }: Props) {
  const [selected, setSelected] = useState<ReviewFocus[]>([
    'security',
    'bugs',
    'performance',
    'style',
  ])

  function toggle(id: ReviewFocus) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }

  return (
    <div
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click handler prevents backdrop close propagation */}
      <div
        className="relative w-full max-w-sm rounded-xl border border-base-border bg-base-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-base-border-subtle border-b px-5 py-3.5">
          <h3 className="font-semibold text-base-text text-sm">
            {isRerun ? 'Re-run Review' : 'Start Review'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
          >
            <X size={14} />
          </button>
        </div>

        {/* Focus areas */}
        <div className="px-5 py-4">
          <p className="mb-3 font-medium text-[11px] text-base-text-muted uppercase tracking-wider">
            Focus areas
          </p>
          <div className="space-y-1.5">
            {FOCUS_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isSelected = selected.includes(opt.id)
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? 'bg-base-raised ring-1 ring-base-border'
                      : 'hover:bg-base-raised/50'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded ${
                      isSelected
                        ? 'bg-base-text text-base-bg'
                        : 'border border-base-border text-base-text-faint'
                    }`}
                  >
                    {isSelected && <Icon size={11} strokeWidth={2.5} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        size={12}
                        className={isSelected ? 'text-base-text' : 'text-base-text-muted'}
                      />
                      <span
                        className={`font-medium text-[12px] ${isSelected ? 'text-base-text' : 'text-base-text-secondary'}`}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-base-text-muted">{opt.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-base-border-subtle border-t px-5 py-3.5">
          <span className="text-[11px] text-base-text-muted">
            {selected.length} area{selected.length !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => {
              onStart(selected)
              onClose()
            }}
            disabled={selected.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-base-text px-4 py-2 font-semibold text-[12px] text-base-bg transition-colors hover:bg-white disabled:opacity-30"
          >
            <Play size={12} />
            {isRerun ? 'Re-run' : 'Start Review'}
          </button>
        </div>
      </div>
    </div>
  )
}
