import { Home, Clock, FolderOpen, Settings } from 'lucide-react'
import { motion } from 'motion/react'
import { useTabStore } from '../../store/tab-store'
import { useUiStore } from '../../store/ui-store'

export function NavRail() {
  const addTab = useTabStore((s) => s.addTab)
  const { sidebarView, setSidebarView, setSettingsOpen } = useUiStore()

  async function handleOpenFolder() {
    const path = await window.api.openFolder()
    if (path) {
      addTab(path)
    }
  }

  return (
    <div className="flex w-[50px] flex-col items-center gap-1 border-r border-stone-800 bg-[var(--color-base-bg)] pt-12 pb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <motion.button
        onClick={() => setSidebarView('home')}
        title="Home"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          sidebarView === 'home'
            ? 'text-stone-100'
            : 'text-stone-400 hover:text-stone-100'
        }`}
      >
        {sidebarView === 'home' && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-lg bg-stone-700"
            transition={{ duration: 0.15, ease: 'easeOut' }}
          />
        )}
        <Home size={18} className="relative z-10" />
      </motion.button>

      <motion.button
        onClick={() => setSidebarView(sidebarView === 'history' ? 'home' : 'history')}
        title="Session History"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          sidebarView === 'history'
            ? 'text-stone-100'
            : 'text-stone-400 hover:text-stone-100'
        }`}
      >
        {sidebarView === 'history' && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-lg bg-stone-700"
            transition={{ duration: 0.15, ease: 'easeOut' }}
          />
        )}
        <Clock size={18} className="relative z-10" />
      </motion.button>

      <motion.button
        onClick={handleOpenFolder}
        title="Open Folder"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-colors hover:text-stone-100"
      >
        <FolderOpen size={18} className="relative z-10" />
      </motion.button>

      <div className="mt-auto flex flex-col items-center gap-1">
        <motion.button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-colors hover:text-stone-100"
        >
          <Settings size={18} />
        </motion.button>
      </div>
    </div>
  )
}
