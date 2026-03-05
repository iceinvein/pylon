import { X, Plus } from 'lucide-react'
import { useTabStore } from '../../store/tab-store'
import { useSessionStore } from '../../store/session-store'
import type { SessionStatus } from '../../../../shared/types'

function StatusDot({ status }: { status: SessionStatus | undefined }) {
  if (!status || status === 'empty' || status === 'done') {
    return <span className="h-2 w-2 rounded-full bg-zinc-600" />
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
  const { sessions } = useSessionStore()

  function handleNewTab() {
    // Open folder picker for new tab
    window.api.openFolder().then((path) => {
      if (path) addTab(path)
    })
  }

  return (
    <div className="flex h-9 items-center gap-0.5 overflow-x-auto border-b border-zinc-800 bg-zinc-950 px-1 scrollbar-none">
      {tabs.map((tab) => {
        const session = tab.sessionId ? sessions.get(tab.sessionId) : undefined
        const isActive = tab.id === activeTabId

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex h-7 min-w-0 max-w-[180px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${
              isActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
            }`}
          >
            <StatusDot status={session?.status} />
            <span className="min-w-0 flex-1 truncate">{tab.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="ml-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-zinc-600 group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}

      <button
        onClick={handleNewTab}
        title="New Tab"
        className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
