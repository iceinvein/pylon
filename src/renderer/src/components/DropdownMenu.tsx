import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

type DropdownItem = {
  id: string
  label: string
  icon?: React.ReactNode
}

type DropdownMenuProps = {
  items: DropdownItem[]
  value: string
  onChange: (id: string) => void
  /** Override the trigger label (defaults to selected item's label) */
  triggerLabel?: string
  /** Icon shown before the trigger label */
  triggerIcon?: React.ReactNode
  /** Additional trigger classes for variant styling (e.g. YOLO amber tint) */
  triggerClassName?: string
  /** Minimum width of the dropdown panel */
  minWidth?: number
}

/** Animated dropdown menu used in the InputBar toolbar. */
export function DropdownMenu({
  items,
  value,
  onChange,
  triggerLabel,
  triggerIcon,
  triggerClassName,
  minWidth = 160,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = items.find((i) => i.id === value)
  const label = triggerLabel ?? selected?.label ?? value

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          'flex h-7 items-center gap-1 rounded-full border border-base-border/50 px-2.5 text-base-text-secondary text-xs transition-colors hover:border-base-border hover:text-base-text'
        }
      >
        {triggerIcon}
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-full left-0 z-50 mb-1 overflow-hidden rounded-lg border border-base-border bg-base-raised py-1 shadow-xl"
            style={{ minWidth }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
          >
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  onChange(item.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-base-border/50 ${
                  item.id === value ? 'text-base-text' : 'text-base-text-secondary'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.id === value ? 'bg-accent' : 'bg-transparent'}`}
                />
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
