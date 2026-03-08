import { X, Plus } from 'lucide-react'
import { useTabStore } from '../../store/tab-store'
import { useSessionStore } from '../../store/session-store'
import type { SessionStatus } from '../../../../shared/types'

function StatusDot({ status }: { status: SessionStatus | undefined }) {
  if (!status || status === 'empty' || status === 'done') {
    return <span className="h-2 w-2 rounded-full bg-stone-600" />
  }
  if (status === 'running' || status === 'starting' || status === 'waiting') {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
  }
  if (status === 'error') {
    return <span className="h-2 w-2 rounded-full bg-red-500" />
  }
  return null
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useTabStore()
  const sessions = useSessionStore((s) => s.sessions)

  function handleNewTab() {
    // Open folder picker for new tab
    window.api.openFolder().then((path) => {
      if (path) addTab(path)
    })
  }

  return (
    <div className="flex h-9 items-center border-b border-stone-800 bg-stone-950 px-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {tabs.map((tab, tabIndex) => {
          const session = tab.sessionId ? sessions.get(tab.sessionId) : undefined
          const isActive = tab.id === activeTabId
          const shortcutNum = tabIndex < 9 ? tabIndex + 1 : null

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs transition-colors ${
                isActive
                  ? 'bg-stone-800 text-stone-100'
                  : 'text-stone-400 hover:bg-stone-800/60 hover:text-stone-300'
              }`}
            >
              <StatusDot status={session?.status} />
              <span className="min-w-0 flex-1 truncate">{tab.label}</span>
              {/* Right slot: shortcut indicator by default, close button on hover */}
              <div className="relative ml-1 flex h-5 flex-shrink-0 items-center justify-center">
                {shortcutNum !== null && (
                  <span className={`px-1 text-[11px] tabular-nums transition-opacity group-hover:opacity-0 ${
                    isActive ? 'text-stone-500' : 'text-stone-600'
                  }`}>
                    ⌘{shortcutNum}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="absolute inset-0 flex items-center justify-center rounded opacity-0 transition-opacity hover:bg-stone-600 group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={handleNewTab}
        title="New Tab"
        className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
