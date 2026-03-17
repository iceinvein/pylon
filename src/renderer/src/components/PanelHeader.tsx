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
    <div className="flex items-center justify-between border-base-border-subtle border-b px-3 py-2">
      <div className="flex items-center gap-2 font-medium text-base-text-secondary text-xs">
        {icon}
        {title}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-base-text-faint transition-colors hover:bg-base-raised hover:text-base-text"
        title={closeTitle ?? `Collapse ${title.toLowerCase()}`}
        aria-label={closeTitle ?? `Collapse ${title.toLowerCase()}`}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
