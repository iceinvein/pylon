import { Activity, useEffect } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { Layout } from './components/layout/Layout'
import { SettingsOverlay } from './components/SettingsOverlay'
import { useGitBridge } from './hooks/use-git-bridge'
import { useIpcBridge } from './hooks/use-ipc-bridge'
import { usePrReviewBridge } from './hooks/use-pr-review-bridge'
import { useTestBridge } from './hooks/use-test-bridge'
import { resumeStoredSession, type StoredSession } from './lib/resume-session'
import { HomePage } from './pages/HomePage'
import { PrReviewView } from './pages/PrReviewView'
import { SessionView } from './pages/SessionView'
import { TestView } from './pages/TestView'
import { useSessionStore } from './store/session-store'
import { useTabStore } from './store/tab-store'
import { useUiStore } from './store/ui-store'

export default function App() {
  useIpcBridge()
  usePrReviewBridge()
  useTestBridge()
  useGitBridge()
  const sidebarView = useUiStore((s) => s.sidebarView)

  const { tabs, activeTabId, setActiveTab } = useTabStore()
  const setNewTabPopoverOpen = useUiStore((s) => s.setNewTabPopoverOpen)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Cmd+1..9 to switch tabs, Cmd+N to open new tab popover
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return

      // Cmd+N — open the new tab project picker
      if (e.key === 'n') {
        e.preventDefault()
        setNewTabPopoverOpen(true)
        return
      }

      // Cmd+1..9 — switch to tab by index
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= 9) {
        const tab = tabs[n - 1]
        if (tab) {
          e.preventDefault()
          setActiveTab(tab.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabs, setActiveTab, setNewTabPopoverOpen])

  // Update Electron window title to reflect the active session
  const activeSession = useSessionStore((s) =>
    activeTab?.sessionId ? s.sessions.get(activeTab.sessionId) : undefined,
  )
  useEffect(() => {
    const title = activeSession?.title || activeTab?.label
    document.title = title ? `${title} — Pylon` : 'Pylon'
  }, [activeSession?.title, activeTab?.label])

  // Restore persisted tabs on startup
  const restoreTabs = useTabStore((s) => s.restoreTabs)
  const updateTab = useTabStore((s) => s.updateTab)

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time startup restore
  useEffect(() => {
    let cancelled = false

    async function restore() {
      const saved = await window.api.getSavedTabs()
      if (cancelled || !saved?.tabs?.length || saved.version !== 1) return

      // Populate tab bar immediately (labels/cwds visible)
      restoreTabs(saved.tabs, saved.activeTabId)

      // Fetch all sessions to validate sessionIds and provide StoredSession data
      const allSessions = (await window.api.listSessions()) as StoredSession[]
      const sessionMap = new Map(allSessions.map((s) => [s.id, s]))

      // Validate sessions and mark hydration state
      for (const tab of saved.tabs) {
        if (tab.sessionId && !sessionMap.has(tab.sessionId)) {
          // Session was deleted — clear the reference
          updateTab(tab.id, { sessionId: null })
        } else if (tab.sessionId && tab.id !== saved.activeTabId) {
          // Has a session but not the active tab — mark for lazy hydration
          updateTab(tab.id, { hydrated: false })
        }
      }

      // Hydrate the active tab immediately if it has a session
      const activeTab = saved.tabs.find((t) => t.id === saved.activeTabId)
      if (activeTab?.sessionId) {
        const session = sessionMap.get(activeTab.sessionId)
        if (session) {
          await resumeStoredSession(session)
          updateTab(activeTab.id, { hydrated: true })
        }
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Layout>
        {sidebarView === 'pr-review' ? (
          <PrReviewView />
        ) : sidebarView === 'testing' ? (
          <TestView />
        ) : (
          <>
            {/* Render all tabs simultaneously, hiding inactive ones via <Activity>.
                This preserves scroll position, React state, and refs across tab switches
                instead of remounting (which the old key={activeTab.id} approach did). */}
            {tabs
              .filter((t) => t.cwd)
              .map((tab) => (
                <Activity key={tab.id} mode={tab.id === activeTabId ? 'visible' : 'hidden'}>
                  <SessionView tab={tab} isActive={tab.id === activeTabId} />
                </Activity>
              ))}
            {/* Show HomePage when no tab has a cwd (i.e. no project selected) */}
            {!activeTab?.cwd && <HomePage />}
          </>
        )}
      </Layout>
      <SettingsOverlay />
      <CommandPalette />
    </>
  )
}
