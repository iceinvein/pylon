// src/renderer/src/components/layout/ModeSwitcher.tsx
import { motion } from 'motion/react'
import { type AppMode, useUiStore } from '../../store/ui-store'

const MODES: { id: AppMode; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'pr-review', label: 'PRs' },
  { id: 'testing', label: 'Testing' },
  { id: 'code', label: 'Code' },
]

export function ModeSwitcher() {
  const activeMode = useUiStore((s) => s.activeMode)
  const setActiveMode = useUiStore((s) => s.setActiveMode)

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-base-raised/40 p-0.5"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {MODES.map((mode) => {
        const isActive = mode.id === activeMode
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => setActiveMode(mode.id)}
            className={`relative rounded-md px-3 py-1 font-medium text-xs transition-colors ${
              isActive ? 'text-base-text' : 'text-base-text-muted hover:text-base-text-secondary'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="mode-active"
                className="absolute inset-0 rounded-md bg-base-raised"
                transition={{ duration: 0.15, ease: 'easeOut' }}
              />
            )}
            <span className="relative z-10">{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
