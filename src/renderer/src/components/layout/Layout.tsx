// src/renderer/src/components/layout/Layout.tsx
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitBranchStatus } from '../../../../shared/types'
import logoUrl from '../../assets/logo.png'
import { useSessionStore } from '../../store/session-store'
import { useUiStore } from '../../store/ui-store'
import { GitPanel } from '../git/GitPanel'
import { StatusBar } from '../StatusBar'
import { ModeSwitcher } from './ModeSwitcher'
import { SessionSidebar } from './SessionSidebar'

const DEFAULT_WIDTH = 260
const MIN_WIDTH = 200
const MAX_WIDTH = 400

type LayoutProps = {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const activeMode = useUiStore((s) => s.activeMode)
  const activeSessionId = useUiStore((s) => s.activeSessionId)

  // Derive cwd from active session for StatusBar + git watching
  const sessions = useSessionStore((s) => s.sessions)
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined
  const activeCwd = activeSession?.cwd ?? ''

  const branchStatus = useSessionStore((s) =>
    activeCwd ? s.branchStatus.get(activeCwd) : undefined,
  )
  const setBranchStatus = useSessionStore((s) => s.setBranchStatus)

  // Watch git for active session's cwd
  useEffect(() => {
    if (!activeCwd) return
    window.api.watchGitCwd(activeCwd)

    const unsub = window.api.onGitStatusChanged(
      (data: { cwd: string; status: GitBranchStatus }) => {
        setBranchStatus(data.cwd, data.status)
      },
    )
    return unsub
  }, [activeCwd, setBranchStatus])

  // Git panel
  const [gitPanelOpen, setGitPanelOpen] = useState(false)
  const toggleGitPanel = useCallback(() => setGitPanelOpen((v) => !v), [])

  // Sidebar width + drag
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      dragStartX.current = e.clientX
      dragStartWidth.current = sidebarWidth

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const delta = ev.clientX - dragStartX.current
        setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta)))
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
    [sidebarWidth],
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base-bg text-base-text">
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only z-100 rounded-md bg-accent px-4 py-2 font-medium text-base-bg text-sm focus:not-sr-only focus:fixed focus:top-14 focus:left-14"
      >
        Skip to content
      </a>

      {/* Titlebar: drag region + logo + mode switcher */}
      <div
        className="fixed top-0 right-0 left-0 z-50 flex h-12 items-center gap-3 border-base-border-subtle border-b bg-base-bg px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* macOS traffic lights spacer */}
        <div className="w-16 shrink-0" />
        <img
          src={logoUrl}
          alt="Pylon"
          className="h-5 w-5 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
        <ModeSwitcher />
        <div className="flex-1" />
      </div>

      {/* Sidebar — only shown in sessions mode; other modes have their own internal layout */}
      {activeMode === 'sessions' && (
        <div
          className="flex shrink-0 border-base-border-subtle border-r pt-12"
          style={{ width: sidebarWidth }}
        >
          <div className="min-w-0 flex-1">
            <SessionSidebar />
          </div>
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            className="flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-base-border active:bg-base-text-faint"
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col pt-12">
        <main id="main-content" className="min-h-0 flex-1 overflow-hidden">
          {children}
        </main>
        {activeMode === 'sessions' && (
          <StatusBar
            cwd={activeCwd}
            branchStatus={branchStatus}
            gitPanelOpen={gitPanelOpen}
            onToggleGitPanel={toggleGitPanel}
          />
        )}
      </div>

      {/* Git panel slide-over */}
      <AnimatePresence initial={false}>
        {gitPanelOpen && activeMode === 'sessions' && (
          <motion.div
            key="git-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex shrink-0 overflow-hidden border-base-border-subtle border-l pt-12"
          >
            <div className="min-w-0 flex-1">
              <GitPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
