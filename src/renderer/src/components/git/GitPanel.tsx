import { GitBranch, GitCommitHorizontal, Terminal } from 'lucide-react'
import { useState } from 'react'
import { useTabStore } from '../../store/tab-store'
import { GitCommitTab } from './GitCommitTab'
import { GitGraphTab } from './GitGraphTab'
import { GitOpsTab } from './GitOpsTab'

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
        <p className="text-base-text-faint text-xs">Open a project to use Git tools</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab strip */}
      <div className="flex border-base-border-subtle border-b">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs transition-colors ${
              activeTab === id
                ? 'border-accent border-b-2 text-base-text'
                : 'text-base-text-muted hover:text-base-text'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content — placeholders until tab components are built */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'graph' && <GitGraphTab cwd={cwd} sessionId={tab?.sessionId ?? null} />}
        {activeTab === 'commit' && <GitCommitTab cwd={cwd} sessionId={tab?.sessionId ?? null} />}
        {activeTab === 'command' && <GitOpsTab cwd={cwd} sessionId={tab?.sessionId ?? null} />}
      </div>
    </div>
  )
}
