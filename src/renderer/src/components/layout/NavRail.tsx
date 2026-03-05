import { Home, FolderOpen, Settings } from 'lucide-react'
import { useTabStore } from '../../store/tab-store'
import { useUiStore } from '../../store/ui-store'

export function NavRail() {
  const { addTab } = useTabStore()
  const { sidebarView, setSidebarView } = useUiStore()

  async function handleOpenFolder() {
    const path = await window.api.openFolder()
    if (path) {
      addTab(path)
      setSidebarView('files')
    }
  }

  return (
    <div className="flex w-[50px] flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950 py-3">
      <button
        onClick={() => setSidebarView('home')}
        title="Home"
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          sidebarView === 'home'
            ? 'bg-zinc-700 text-zinc-100'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
        }`}
      >
        <Home size={18} />
      </button>

      <button
        onClick={handleOpenFolder}
        title="Open Folder"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
      >
        <FolderOpen size={18} />
      </button>

      <div className="flex-1" />

      <button
        onClick={() => setSidebarView('settings')}
        title="Settings"
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          sidebarView === 'settings'
            ? 'bg-zinc-700 text-zinc-100'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
        }`}
      >
        <Settings size={18} />
      </button>
    </div>
  )
}
