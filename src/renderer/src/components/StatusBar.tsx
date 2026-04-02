import { GitBranch } from 'lucide-react'
import type { GitBranchStatus } from '../../../shared/types'
import { formatCost } from '../lib/utils'
import { useSessionStore } from '../store/session-store'
import { useTabStore } from '../store/tab-store'
import { useUiStore } from '../store/ui-store'

const MODEL_SHORT: Record<string, string> = {
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
}

type StatusBarProps = {
  cwd: string
  branchStatus: GitBranchStatus | undefined
}

function BranchIndicator({ status }: { status: GitBranchStatus }) {
  if (!status.branch) return null

  const parts: string[] = [status.branch]

  if (status.hasUpstream) {
    if (status.ahead > 0) parts.push(`↑${status.ahead}`)
    if (status.behind > 0) parts.push(`↓${status.behind}`)
    if (status.ahead === 0 && status.behind === 0) parts.push('✓')
  }

  const isBehind = status.behind > 0
  const textColor = isBehind ? 'text-[var(--color-warning)]' : 'text-[var(--color-base-text-muted)]'

  return (
    <span className={`flex items-center gap-1.5 text-xs ${textColor}`}>
      <GitBranch size={12} className="shrink-0" />
      {parts.join(' ')}
    </span>
  )
}

function SessionInfo() {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const sessionId = useTabStore((s) => s.tabs.find((t) => t.id === activeTabId)?.sessionId)
  const session = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId) : undefined))

  if (!session) return null

  const modelLabel = MODEL_SHORT[session.model] ?? session.model
  const cost = session.cost?.totalUsd ?? 0

  return (
    <span className="flex items-center gap-2.5 text-base-text-faint text-xs">
      <span>{modelLabel}</span>
      {cost > 0 && <span className="font-mono">{formatCost(cost)}</span>}
    </span>
  )
}

export function StatusBar({ cwd: _cwd, branchStatus }: StatusBarProps) {
  const sidebarView = useUiStore((s) => s.sidebarView)
  const setSidebarView = useUiStore((s) => s.setSidebarView)
  const isGitOpen = sidebarView === 'git'

  if (!branchStatus?.isGitRepo || !branchStatus.branch) {
    return (
      <div className="flex h-6 items-center border-base-border-subtle border-t bg-base-bg px-3">
        <div className="flex-1" />
        <SessionInfo />
      </div>
    )
  }

  return (
    <div className="flex h-6 items-center border-base-border-subtle border-t bg-base-bg px-3">
      <button
        type="button"
        onClick={() => setSidebarView(isGitOpen ? 'home' : 'git')}
        className={`rounded px-1 py-0.5 transition-colors hover:bg-base-raised ${isGitOpen ? 'bg-base-raised' : ''}`}
      >
        <BranchIndicator status={branchStatus} />
      </button>
      <div className="flex-1" />
      <SessionInfo />
    </div>
  )
}
