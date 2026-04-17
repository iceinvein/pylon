import { ClipboardList, GitBranch } from 'lucide-react'
import type { GitBranchStatus } from '../../../shared/types'
import { formatCost } from '../lib/utils'
import { useSessionStore } from '../store/session-store'
import { useUiStore } from '../store/ui-store'
import { Tooltip } from './Tooltip'

const MODEL_SHORT: Record<string, string> = {
  'claude-opus-4-7': 'Opus 4.7',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
}

type StatusBarProps = {
  cwd: string
  branchStatus: GitBranchStatus | undefined
  gitPanelOpen?: boolean
  onToggleGitPanel?: () => void
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
  const sessionId = useUiStore((s) => s.activeSessionId)
  const session = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId) : undefined))
  const mode = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId)?.mode : undefined))

  if (!session) return null

  const modelLabel = MODEL_SHORT[session.model] ?? session.model
  const cost = session.cost?.totalUsd ?? 0

  return (
    <span className="flex items-center gap-2.5 text-base-text-faint text-xs">
      {mode === 'plan' && (
        <Tooltip content="Plan mode active — Claude will plan, not execute" side="top">
          <span className="flex cursor-default items-center gap-1 rounded-full bg-violet-900/40 px-2 py-0.5 text-[10px] text-violet-300">
            <ClipboardList size={10} />
            Plan
          </span>
        </Tooltip>
      )}
      <Tooltip content="Active model" side="top">
        <span className="cursor-default">{modelLabel}</span>
      </Tooltip>
      {cost > 0 && (
        <Tooltip content="Session cost" side="top">
          <span className="cursor-default font-mono">{formatCost(cost)}</span>
        </Tooltip>
      )}
    </span>
  )
}

export function StatusBar({
  cwd: _cwd,
  branchStatus,
  gitPanelOpen,
  onToggleGitPanel,
}: StatusBarProps) {
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
      <Tooltip content="Current branch" side="top">
        <button
          type="button"
          onClick={onToggleGitPanel}
          aria-label="Current branch"
          className={`rounded px-1 py-0.5 transition-colors hover:bg-base-raised ${gitPanelOpen ? 'bg-base-raised' : ''}`}
        >
          <BranchIndicator status={branchStatus} />
        </button>
      </Tooltip>
      <div className="flex-1" />
      <SessionInfo />
    </div>
  )
}
