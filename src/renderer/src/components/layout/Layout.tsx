import { type ReactNode, useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { NavRail } from './NavRail'
import { TabBar } from './TabBar'
import { HistoryPanel } from '../HistoryPanel'
import { useUiStore } from '../../store/ui-store'

type LayoutProps = {
  children: ReactNode
}

const MIN_WIDTH = 200
const MAX_WIDTH = 500
const DEFAULT_WIDTH = 260

export function Layout({ children }: LayoutProps) {
  const sidebarView = useUiStore((s) => s.sidebarView)
  const showSidebar = sidebarView === 'history'

  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - dragStartX.current
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta)))
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-950 text-stone-100">
      {/* Drag region for macOS title bar */}
      <div className="fixed top-0 left-0 right-0 h-12 z-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <NavRail />
      <AnimatePresence initial={false}>
        {showSidebar && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelWidth + 5, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-shrink-0 overflow-hidden bg-[var(--color-base-bg)] pt-12"
          >
            <div className="min-w-0 flex-1">
              <HistoryPanel />
            </div>
            {/* Drag handle */}
            <div
              onMouseDown={handleDragStart}
              className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-r border-stone-800 bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col pt-12">
        <TabBar />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
