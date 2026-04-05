// src/renderer/src/components/layout/SessionCard.tsx
import { Clock, DollarSign, GitBranch, Trash2 } from 'lucide-react'
import { memo } from 'react'
import type { SdkMessage, SessionStatus } from '../../../../shared/types'
import type { StoredSession } from '../../lib/resume-session'
import { getSessionPreview } from '../../lib/session-preview'
import { formatCost, timeAgo } from '../../lib/utils'

type SessionCardProps = {
  session: StoredSession
  isActive: boolean
  status?: SessionStatus
  messages?: SdkMessage[]
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  isPendingDelete?: boolean
  onUndoDelete?: (e: React.MouseEvent) => void
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string }> = {
  running: { dot: 'bg-green-400', label: 'running', color: 'text-green-400' },
  starting: { dot: 'bg-green-400', label: 'starting', color: 'text-green-400' },
  waiting: { dot: 'bg-amber-400', label: 'waiting', color: 'text-amber-400' },
  error: { dot: 'bg-red-400', label: 'error', color: 'text-red-400' },
}

export const SessionCard = memo(function SessionCard({
  session,
  isActive,
  status,
  messages,
  onSelect,
  onDelete,
  isPendingDelete,
  onUndoDelete,
}: SessionCardProps) {
  const statusInfo = status ? STATUS_CONFIG[status] : null
  const preview = messages ? getSessionPreview(messages) : ''

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors ${
        isPendingDelete ? 'opacity-40' : ''
      } ${
        isActive
          ? 'border-accent border-l-2 bg-base-raised text-base-text'
          : 'border-transparent border-l-2 text-base-text-secondary hover:bg-base-raised/60'
      }`}
    >
      {/* Title + status */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`min-w-0 flex-1 truncate font-medium text-xs ${
            isActive ? 'text-base-text' : 'text-base-text-secondary'
          }`}
        >
          {session.title || 'Untitled'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {statusInfo && (
            <>
              <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
              <span className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</span>
            </>
          )}
          {!statusInfo && status !== 'empty' && (
            <span className="text-[10px] text-base-text-faint">idle</span>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <p className="line-clamp-2 text-[10px] text-base-text-muted leading-relaxed">{preview}</p>
      )}

      {/* Metadata footer */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] text-base-text-faint">
          <Clock size={9} />
          {timeAgo(session.updated_at)}
        </span>
        {session.total_cost_usd > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-base-text-faint">
            <DollarSign size={9} />
            {formatCost(session.total_cost_usd)}
          </span>
        )}
        {session.worktree_branch && (
          <span className="flex items-center gap-1 text-[10px] text-accent/80">
            <GitBranch size={9} />
            {session.worktree_branch}
          </span>
        )}

        <div className="flex-1" />

        {/* Delete / Undo */}
        {isPendingDelete ? (
          <button
            type="button"
            onClick={onUndoDelete}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-[10px] text-accent-text transition-colors hover:bg-accent/15"
          >
            Undo
          </button>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete session"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-base-text-faint opacity-0 transition-all hover:text-error group-hover:opacity-100"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </button>
  )
})
