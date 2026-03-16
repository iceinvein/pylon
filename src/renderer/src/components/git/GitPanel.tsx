import { GitBranch, GitCommitHorizontal, Terminal } from 'lucide-react'
import { useState } from 'react'
import { useTabStore } from '../../store/tab-store'
import { GitCommitTab } from './GitCommitTab'
import { GitGraphTab } from './GitGraphTab'

type GitTab = 'graph' | 'commit' | 'command'

const TAB_CONFIG: { id: GitTab; label: string; icon: typeof GitBranch }[] = [
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'commit', label: 'Commit', icon: GitCommitHorizontal },
  { id: 'command', label: 'Command', icon: Terminal },
]

export function GitPanel() {
  const [activeTab, setActiveTab] = useState<GitTab>('graph')
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)
  const cwd = tab?.cwd ?? ''

  if (!cwd) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-stone-600 text-xs">Open a project to use Git tools</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab strip */}
      <div className="flex border-stone-800 border-b">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs transition-colors ${
              activeTab === id
                ? 'border-amber-500 border-b-2 text-stone-100'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content — placeholders until tab components are built */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'graph' && (
          <GitGraphTab cwd={cwd} sessionId={tab?.sessionId ?? null} />
        )}
        {activeTab === 'commit' && (
          <GitCommitTab cwd={cwd} sessionId={tab?.sessionId ?? null} />
        )}
        {activeTab === 'command' && (
          <div className="flex h-full items-center justify-center text-stone-600 text-xs">
            Command tab — coming soon
          </div>
        )}
      </div>
    </div>
  )
}
