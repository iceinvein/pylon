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
  const textColor = isBehind ? 'text-amber-400' : 'text-stone-500'

  return (
    <span className={`flex items-center gap-1.5 text-xs ${textColor}`}>
      <GitBranch size={12} className="flex-shrink-0" />
      {parts.join(' ')}
    </span>
  )
}

export function StatusBar({ cwd: _cwd, branchStatus }: StatusBarProps) {
  const toggleGitPanel = useUiStore((s) => s.toggleGitPanel)
  const gitPanelOpen = useUiStore((s) => s.gitPanelOpen)

  if (!branchStatus?.isGitRepo || !branchStatus.branch) {
    return <div className="h-6 border-stone-800 border-t bg-stone-950" />
  }

  return (
    <div className="flex h-6 items-center border-stone-800 border-t bg-stone-950 px-3">
      <button
        type="button"
        onClick={toggleGitPanel}
        className={`rounded px-1 py-0.5 transition-colors hover:bg-stone-800 ${gitPanelOpen ? 'bg-stone-800' : ''}`}
      >
        <BranchIndicator status={branchStatus} />
      </button>
      <div className="flex-1" />
    </div>
  )
}
