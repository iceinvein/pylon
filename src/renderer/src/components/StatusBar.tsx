import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import type { GitBranchStatus } from '../../../shared/types'
import { GitBranchPopover } from './GitBranchPopover'

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

export function StatusBar({ cwd, branchStatus }: StatusBarProps) {
  const [showPopover, setShowPopover] = useState(false)

  if (!branchStatus?.isGitRepo || !branchStatus.branch) {
    return <div className="h-6 border-stone-800 border-t bg-stone-950" />
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPopover(!showPopover)}
        className="flex h-6 w-full items-center gap-3 border-stone-800 border-t bg-stone-950 px-3 transition-colors hover:bg-stone-900"
      >
        <BranchIndicator status={branchStatus} />
        <div className="flex-1" />
      </button>
      {showPopover && (
        <GitBranchPopover
          cwd={cwd}
          branchStatus={branchStatus}
          onClose={() => setShowPopover(false)}
        />
      )}
    </div>
  )
}
