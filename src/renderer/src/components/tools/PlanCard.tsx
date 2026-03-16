import { Check, ClipboardList, MessageSquare } from 'lucide-react'
import type { DetectedPlan } from '../../../../shared/types'
import { useSessionStore } from '../../store/session-store'
import { useUiStore } from '../../store/ui-store'

type PlanCardProps = {
  plan: DetectedPlan
  sessionId: string
  sectionTitles: string[]
}

export function PlanCard({ plan, sessionId, sectionTitles }: PlanCardProps) {
  const updatePlanStatus = useSessionStore((s) => s.updatePlanStatus)
  const openReviewPanel = useUiStore((s) => s.openReviewPanel)
  const session = useSessionStore((s) => s.sessions.get(sessionId))
  const canAct =
    session?.status === 'running' || session?.status === 'waiting' || session?.status === 'done'

  const fileName = plan.relativePath.split('/').pop() ?? plan.relativePath
  const commentCount = plan.comments.length

  function handleApprove() {
    updatePlanStatus(sessionId, plan.filePath, 'approved')
    const msg = `Plan approved for ${plan.relativePath}. Proceed with implementation.`
    useSessionStore.getState().appendMessage(sessionId, { type: 'user', content: msg })
    window.api.sendMessage(sessionId, msg, [])
  }

  function handleOpenReview() {
    openReviewPanel(sessionId, plan.filePath)
  }

  const statusColor = {
    pending: 'border-violet-800/50',
    approved: 'border-emerald-800/50',
    changes_requested: 'border-[var(--color-accent)]/50',
  }[plan.status]

  const badgeColor = {
    pending: 'bg-violet-900/40 text-violet-300',
    approved: 'bg-emerald-900/40 text-emerald-300',
    changes_requested: 'bg-[var(--color-accent)]/40 text-[var(--color-accent-text)]',
  }[plan.status]

  const badgeText = {
    pending: 'Plan',
    approved: 'Approved',
    changes_requested: `${commentCount} comment${commentCount !== 1 ? 's' : ''}`,
  }[plan.status]

  return (
    <div
      className={`max-w-[520px] overflow-hidden rounded-lg border ${statusColor} bg-[var(--color-base-surface)]/80`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-[var(--color-base-border-subtle)] border-b px-4 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-violet-900/30">
          <ClipboardList size={16} className="text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[13px] text-[var(--color-base-text)]">
            {fileName}
          </div>
          <div className="text-[11px] text-[var(--color-base-text-muted)]">
            {plan.relativePath} · {sectionTitles.length} section
            {sectionTitles.length !== 1 ? 's' : ''}
          </div>
        </div>
        <span className={`rounded px-2 py-0.5 font-medium text-[11px] ${badgeColor}`}>
          {plan.status === 'approved' && <Check size={10} className="mr-1 inline" />}
          {plan.status === 'changes_requested' && (
            <MessageSquare size={10} className="mr-1 inline" />
          )}
          {badgeText}
        </span>
      </div>

      {/* Section preview */}
      {sectionTitles.length > 0 && (
        <div className="flex flex-col gap-1 px-4 py-2.5">
          {sectionTitles.slice(0, 6).map((title, i) => (
            <div
              key={title}
              className="flex items-center gap-2 text-[var(--color-base-text-secondary)] text-xs"
            >
              <span className="text-[var(--color-base-text-faint)]">{i + 1}.</span>
              <span className="truncate">{title}</span>
            </div>
          ))}
          {sectionTitles.length > 6 && (
            <div className="text-[var(--color-base-text-faint)] text-xs">
              + {sectionTitles.length - 6} more
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      {plan.status === 'pending' && (
        <div className="flex items-center gap-2 border-[var(--color-base-border-subtle)] border-t px-4 py-2.5">
          <button
            type="button"
            onClick={handleOpenReview}
            className="flex-1 rounded-md bg-violet-600 px-4 py-2 font-medium text-[13px] text-white transition-colors hover:bg-violet-500"
          >
            Review Plan
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!canAct}
            className="rounded-md border border-[var(--color-base-border)] bg-[var(--color-base-raised)] px-4 py-2 text-[13px] text-[var(--color-base-text)] transition-colors hover:bg-[var(--color-base-border)] disabled:opacity-40"
          >
            Approve
          </button>
        </div>
      )}

      {plan.status === 'changes_requested' && (
        <div className="flex items-center gap-2 border-[var(--color-base-border-subtle)] border-t px-4 py-2.5">
          <button
            type="button"
            onClick={handleOpenReview}
            className="flex-1 rounded-md border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/20 px-4 py-2 font-medium text-[13px] text-[var(--color-accent-text)] transition-colors hover:bg-[var(--color-accent)]/40"
          >
            Review Again
          </button>
        </div>
      )}
    </div>
  )
}
