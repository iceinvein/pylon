import { Layout } from './components/layout/Layout'
import { HomePage } from './pages/HomePage'
import { SessionView } from './pages/SessionView'
import { SubagentDrawer } from './components/SubagentDrawer'
import { SettingsOverlay } from './components/SettingsOverlay'
import { CommandPalette } from './components/CommandPalette'
import { useTabStore } from './store/tab-store'
import { useIpcBridge } from './hooks/use-ipc-bridge'

export default function App() {
  useIpcBridge()

  const { tabs, activeTabId } = useTabStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Global keyboard shortcut for command palette is handled inside CommandPalette

  return (
    <>
      <Layout>
        {activeTab ? (
          <SessionView key={activeTab.id} tab={activeTab} />
        ) : (
          <HomePage />
        )}
      </Layout>
      <SubagentDrawer />
      <SettingsOverlay />
      <CommandPalette />
    </>
  )
}
