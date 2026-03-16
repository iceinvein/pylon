import { ChevronRight } from 'lucide-react'

type PanelHeaderProps = {
  icon: React.ReactNode
  title: string
  onClose: () => void
  closeTitle?: string
}

/** Header bar for right-side panels (Flow, Changes, Session Info). */
export function PanelHeader({ icon, title, onClose, closeTitle }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between border-[var(--color-base-border-subtle)] border-b px-3 py-2">
      <div className="flex items-center gap-2 font-medium text-[var(--color-base-text-secondary)] text-xs">
        {icon}
        {title}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-[var(--color-base-text-faint)] transition-colors hover:bg-[var(--color-base-raised)] hover:text-[var(--color-base-text)]"
        title={closeTitle ?? `Collapse ${title.toLowerCase()}`}
        aria-label={closeTitle ?? `Collapse ${title.toLowerCase()}`}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
