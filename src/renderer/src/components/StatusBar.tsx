import { GitBranch } from 'lucide-react'
import type { GitBranchStatus } from '../../../shared/types'
import { useUiStore } from '../store/ui-store'

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
      <GitBranch size={12} className="flex-shrink-0" />
      {parts.join(' ')}
    </span>
  )
}

export function StatusBar({ cwd: _cwd, branchStatus }: StatusBarProps) {
  const sidebarView = useUiStore((s) => s.sidebarView)
  const setSidebarView = useUiStore((s) => s.setSidebarView)
  const isGitOpen = sidebarView === 'git'

  if (!branchStatus?.isGitRepo || !branchStatus.branch) {
    return (
      <div className="h-6 border-[var(--color-base-border-subtle)] border-t bg-[var(--color-base-bg)]" />
    )
  }

  return (
    <div className="flex h-6 items-center border-[var(--color-base-border-subtle)] border-t bg-[var(--color-base-bg)] px-3">
      <button
        type="button"
        onClick={() => setSidebarView(isGitOpen ? 'home' : 'git')}
        className={`rounded px-1 py-0.5 transition-colors hover:bg-[var(--color-base-raised)] ${isGitOpen ? 'bg-[var(--color-base-raised)]' : ''}`}
      >
        <BranchIndicator status={branchStatus} />
      </button>
      <div className="flex-1" />
    </div>
  )
}
