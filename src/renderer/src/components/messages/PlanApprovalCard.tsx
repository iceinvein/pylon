import { ClipboardList } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { PendingPlanApproval } from '../../../../shared/types'

type PlanApprovalCardProps = {
  approval: PendingPlanApproval
  onRespond: (requestId: string, approved: boolean) => void
}

export function PlanApprovalCard({ approval, onRespond }: PlanApprovalCardProps) {
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null)
  const [visible, setVisible] = useState(true)

  function handleExecute() {
    setResolved('approved')
    setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRespond(approval.requestId, true), 200)
    }, 150)
  }

  function handleReject() {
    setResolved('rejected')
    onRespond(approval.requestId, false)
  }

  const hasPrompts = approval.allowedPrompts && approval.allowedPrompts.length > 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className={`my-2 mr-6 ml-15 rounded-lg border p-4 transition-colors duration-150 ${
            resolved === 'approved'
              ? 'border-emerald-800/50 bg-emerald-900/10'
              : 'border-violet-800/50 bg-violet-900/10'
          }`}
        >
          <div className="flex items-start gap-3">
            <ClipboardList size={16} className="mt-0.5 shrink-0 text-violet-400" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-violet-300">Plan Complete</p>
              <p className="mt-0.5 text-base-text-secondary text-xs">
                Claude has finished planning and is ready to execute.
              </p>

              {hasPrompts && (
                <div className="mt-2 space-y-1">
                  <p className="text-base-text-faint text-xs">Permissions needed:</p>
                  {approval.allowedPrompts!.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-base-text-secondary text-xs"
                    >
                      <span className="text-base-text-faint">-</span>
                      <span>{p.prompt}</span>
                    </div>
                  ))}
                </div>
              )}

              {!resolved && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExecute}
                    className="rounded-md bg-violet-600 px-4 py-1.5 font-medium text-[13px] text-white transition-colors hover:bg-violet-500"
                  >
                    Execute Plan
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="rounded-md border border-base-border bg-base-raised px-4 py-1.5 text-[13px] text-base-text transition-colors hover:bg-base-border"
                  >
                    Reject
                  </button>
                </div>
              )}

              {resolved === 'approved' && (
                <p className="mt-2 text-emerald-400 text-xs">Executing plan...</p>
              )}
              {resolved === 'rejected' && (
                <p className="mt-2 text-base-text-muted text-xs">Plan rejected.</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
