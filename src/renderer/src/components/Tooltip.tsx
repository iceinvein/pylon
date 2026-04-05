import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

type TooltipProps = {
  content: string
  shortcut?: string
  side?: TooltipSide
  delay?: number
  children: ReactNode
}

const SIDE_CLASSES: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

export function Tooltip({
  content,
  shortcut,
  side = 'bottom',
  delay = 200,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTooltip = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }, [delay])

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            role="tooltip"
            className={`pointer-events-none absolute z-50 whitespace-nowrap ${SIDE_CLASSES[side]}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          >
            <div className="flex items-center rounded-md border border-base-border bg-base-raised px-2 py-1 text-base-text text-xs shadow-lg">
              <span>{content}</span>
              {shortcut && (
                <kbd className="ml-1.5 rounded bg-base-surface px-1 py-0.5 font-mono text-[10px] text-base-text-faint">
                  {shortcut}
                </kbd>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
