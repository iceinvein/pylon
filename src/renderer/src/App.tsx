import { useEffect } from 'react'
import { Layout } from './components/layout/Layout'
import { HomePage } from './pages/HomePage'
import { SessionView } from './pages/SessionView'
import { PrReviewView } from './pages/PrReviewView'
import { SettingsOverlay } from './components/SettingsOverlay'
import { CommandPalette } from './components/CommandPalette'
import { useTabStore } from './store/tab-store'
import { useIpcBridge } from './hooks/use-ipc-bridge'
import { usePrReviewBridge } from './hooks/use-pr-review-bridge'
import { useUiStore } from './store/ui-store'

export default function App() {
  useIpcBridge()
  usePrReviewBridge()
  const sidebarView = useUiStore((s) => s.sidebarView)

  const { tabs, activeTabId, setActiveTab, addTab } = useTabStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Cmd+1..9 to switch tabs, Cmd+N to open new tab
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return

      // Cmd+N — new blank tab (shows HomePage)
      if (e.key === 'n') {
        e.preventDefault()
        addTab('', 'New Tab')
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
  }, [tabs, setActiveTab, addTab])

  return (
    <>
      <Layout>
        {sidebarView === 'pr-review' ? (
          <PrReviewView />
        ) : activeTab && activeTab.cwd ? (
          <SessionView key={activeTab.id} tab={activeTab} />
        ) : (
          <HomePage />
        )}
      </Layout>
      <SettingsOverlay />
      <CommandPalette />
    </>
  )
}
