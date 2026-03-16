import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { GitBranchStatus } from '../../../../shared/types'
import { useSessionStore } from '../../store/session-store'
import { useTabStore } from '../../store/tab-store'
import { useUiStore } from '../../store/ui-store'
import { GitPanel } from '../git/GitPanel'
import { HistoryPanel } from '../HistoryPanel'
import { StatusBar } from '../StatusBar'
import { NavRail } from './NavRail'
import { TabBar } from './TabBar'

type LayoutProps = {
  children: ReactNode
}

const MIN_WIDTH = 200
const MAX_WIDTH = 500
const DEFAULT_WIDTH = 260

const GIT_MIN_WIDTH = 300
const GIT_MAX_WIDTH = 700
const GIT_DEFAULT_WIDTH = 420

export function Layout({ children }: LayoutProps) {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabs = useTabStore((s) => s.tabs)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeCwd = activeTab?.cwd ?? ''
  const branchStatus = useSessionStore((s) =>
    activeCwd ? s.branchStatus.get(activeCwd) : undefined,
  )

  const sidebarView = useUiStore((s) => s.sidebarView)
  const showSidebar = sidebarView === 'history'

  const setBranchStatus = useSessionStore((s) => s.setBranchStatus)

  // Tell main process to watch this cwd + listen for push updates
  useEffect(() => {
    if (!activeCwd) return

    // Start watching in main process
    window.api.watchGitCwd(activeCwd)

    // Listen for status changes pushed from main
    const unsub = window.api.onGitStatusChanged(
      (data: { cwd: string; status: GitBranchStatus }) => {
        setBranchStatus(data.cwd, data.status)
      },
    )

    return unsub
  }, [activeCwd, setBranchStatus])

  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [gitPanelWidth, setGitPanelWidth] = useState(GIT_DEFAULT_WIDTH)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const makeDragHandler = useCallback(
    (currentWidth: number, setWidth: (w: number) => void, minW: number, maxW: number) =>
      (e: React.MouseEvent) => {
        e.preventDefault()
        dragging.current = true
        dragStartX.current = e.clientX
        dragStartWidth.current = currentWidth

        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'

        const handleMouseMove = (ev: MouseEvent) => {
          if (!dragging.current) return
          const delta = ev.clientX - dragStartX.current
          setWidth(Math.min(maxW, Math.max(minW, dragStartWidth.current + delta)))
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
      },
    [],
  )

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => makeDragHandler(panelWidth, setPanelWidth, MIN_WIDTH, MAX_WIDTH)(e),
    [panelWidth, makeDragHandler],
  )

  const handleGitDragStart = useCallback(
    (e: React.MouseEvent) =>
      makeDragHandler(gitPanelWidth, setGitPanelWidth, GIT_MIN_WIDTH, GIT_MAX_WIDTH)(e),
    [gitPanelWidth, makeDragHandler],
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-950 text-stone-100">
      {/* Drag region for macOS title bar */}
      <div
        className="fixed top-0 right-0 left-0 z-50 h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
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
            {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
            <div
              onMouseDown={handleDragStart}
              className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-stone-800 border-r bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
            />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Git management panel */}
      <AnimatePresence initial={false}>
        {sidebarView === 'git' && (
          <motion.div
            key="git-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: gitPanelWidth + 5, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-shrink-0 overflow-hidden pt-12"
          >
            <div className="min-w-0 flex-1">
              <GitPanel />
            </div>
            {/* Drag handle */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
            <div
              onMouseDown={handleGitDragStart}
              className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-stone-800 border-r bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col pt-12">
        {sidebarView !== 'pr-review' && sidebarView !== 'testing' && <TabBar />}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        {sidebarView !== 'pr-review' && sidebarView !== 'testing' && (
          <StatusBar cwd={activeCwd} branchStatus={branchStatus} />
        )}
      </div>
    </div>
  )
}
