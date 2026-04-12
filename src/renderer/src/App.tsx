// src/renderer/src/App.tsx
import { Activity, useEffect } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { EmptyState } from './components/EmptyState'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { Layout } from './components/layout/Layout'
import { SettingsOverlay } from './components/SettingsOverlay'
import { useGitBridge } from './hooks/use-git-bridge'
import { useIpcBridge } from './hooks/use-ipc-bridge'
import { usePrReviewBridge } from './hooks/use-pr-review-bridge'
import { useTestBridge } from './hooks/use-test-bridge'
import { useWorktreeSetupBridge } from './hooks/use-worktree-setup-bridge'
import { resumeStoredSession, type StoredSession } from './lib/resume-session'
import { AstView } from './pages/AstView'
import { PrReviewView } from './pages/PrReviewView'
import { SessionView } from './pages/SessionView'
import { TestView } from './pages/TestView'
import { useSessionStore } from './store/session-store'
import { useUiStore } from './store/ui-store'

export default function App() {
  useIpcBridge()
  usePrReviewBridge()
  useTestBridge()
  useGitBridge()
  useWorktreeSetupBridge()

  const activeMode = useUiStore((s) => s.activeMode)
  const activeSessionId = useUiStore((s) => s.activeSessionId)
  const recentSessionIds = useUiStore((s) => s.recentSessionIds)
  const setActiveMode = useUiStore((s) => s.setActiveMode)
  const setNewSessionPopoverOpen = useUiStore((s) => s.setNewSessionPopoverOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const sessions = useSessionStore((s) => s.sessions)

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.altKey || e.ctrlKey) return

      // Cmd+N — new session
      if (!e.shiftKey && e.key === 'n') {
        e.preventDefault()
        setActiveMode('sessions')
        setNewSessionPopoverOpen(true)
        return
      }

      // Cmd+, — settings
      if (!e.shiftKey && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }

      // Cmd+W — deselect session
      if (!e.shiftKey && e.key === 'w') {
        e.preventDefault()
        useUiStore.getState().deselectSession()
        return
      }

      // Cmd+Shift+1..4 — mode switching
      if (e.shiftKey) {
        const modes = ['sessions', 'pr-review', 'testing', 'code'] as const
        const n = parseInt(e.key, 10)
        if (n >= 1 && n <= 4) {
          e.preventDefault()
          setActiveMode(modes[n - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveMode, setNewSessionPopoverOpen, setSettingsOpen])

  // Update window title
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined
  useEffect(() => {
    const title = activeSession?.title
    document.title = title ? `${title} — Pylon` : 'Pylon'
  }, [activeSession?.title])

  // Restore persisted active session on startup
  useEffect(() => {
    let cancelled = false

    async function restore() {
      // Read persisted session nav from the existing getSavedTabs IPC
      // (will be renamed to getSavedNav in Task 15)
      const raw = await window.api.getSavedTabs()
      if (cancelled || !raw) return

      // Check if this is the new format (version 2)
      const saved = raw as unknown as {
        version: number
        activeSessionId?: string | null
        recentSessionIds?: string[]
      }
      if (saved.version !== 2 || !saved.activeSessionId) return

      // Validate the session still exists
      const allSessions = (await window.api.listSessions()) as StoredSession[]
      const sessionMap = new Map(allSessions.map((s) => [s.id, s]))
      const activeStored = sessionMap.get(saved.activeSessionId)

      if (activeStored) {
        await resumeStoredSession(activeStored)
        useUiStore.getState().setActiveSession(saved.activeSessionId)
      }

      // Restore recent IDs (don't hydrate — lazy on switch)
      if (saved.recentSessionIds) {
        const validRecent = saved.recentSessionIds.filter((id) => sessionMap.has(id))
        useUiStore.setState({ recentSessionIds: validRecent })
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  // Build the set of session IDs that should be mounted (active + recent LRU)
  const mountedIds = [activeSessionId, ...recentSessionIds].filter(
    (id): id is string => !!id && sessions.has(id),
  )
  // Deduplicate
  const uniqueMountedIds = [...new Set(mountedIds)]

  return (
    <>
      <Layout>
        {activeMode === 'pr-review' ? (
          <PrReviewView />
        ) : activeMode === 'testing' ? (
          <TestView />
        ) : activeMode === 'code' ? (
          <AstView />
        ) : (
          <>
            {uniqueMountedIds.map((id) => (
              <Activity key={id} mode={id === activeSessionId ? 'visible' : 'hidden'}>
                <SessionView sessionId={id} isActive={id === activeSessionId} />
              </Activity>
            ))}
            {!activeSessionId && <EmptyState />}
          </>
        )}
      </Layout>
      <SettingsOverlay />
      <CommandPalette />
      <KeyboardShortcuts />
    </>
  )
}
