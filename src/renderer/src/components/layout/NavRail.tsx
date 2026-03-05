import { Home, FolderOpen } from 'lucide-react'
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
    <div className="flex w-[50px] flex-col items-center gap-1 border-r border-stone-800 bg-stone-950 pt-12 pb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setSidebarView('home')}
        title="Home"
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          sidebarView === 'home'
            ? 'bg-stone-700 text-stone-100'
            : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
        }`}
      >
        <Home size={18} />
      </button>

      <button
        onClick={handleOpenFolder}
        title="Open Folder"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100"
      >
        <FolderOpen size={18} />
      </button>
    </div>
  )
}
