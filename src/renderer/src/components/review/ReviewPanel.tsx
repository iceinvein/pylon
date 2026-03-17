import { ClipboardList, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import type { PlanComment, PlanSection } from '../../../../shared/types'
import { parsePlanSections } from '../../lib/parse-plan'
import { useSessionStore } from '../../store/session-store'
import { useUiStore } from '../../store/ui-store'
import { ReviewSection } from './ReviewSection'

export function ReviewPanel() {
  const reviewPlanRef = useUiStore((s) => s.reviewPanelPlan)
  const closeReviewPanel = useUiStore((s) => s.closeReviewPanel)

  const sessionId = reviewPlanRef?.sessionId ?? ''
  const filePath = reviewPlanRef?.filePath ?? ''

  const plan = useSessionStore((s) => {
    const plans = s.detectedPlans.get(sessionId)
    return plans?.find((p) => p.filePath === filePath) ?? null
  })

  const session = useSessionStore((s) => s.sessions.get(sessionId))
  const canAct =
    session?.status === 'running' || session?.status === 'waiting' || session?.status === 'done'

  const [sections, setSections] = useState<PlanSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local comments map — initialized from store, synced back on submit
  const [comments, setComments] = useState<Map<number, string>>(() => {
    const map = new Map<number, string>()
    if (plan) {
      for (const c of plan.comments) map.set(c.sectionIndex, c.comment)
    }
    return map
  })

  // Load and parse the plan file
  useEffect(() => {
    if (!filePath) return
    setLoading(true)
    setError(null)
    window.api
      .readPlanFile(filePath)
      .then((content) => {
        setSections(parsePlanSections(content))
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to read plan file')
        setLoading(false)
      })
  }, [filePath])

  // Flatten sections for display: show top-level, and children if they exist
  const flatSections = sections.flatMap((section) =>
    section.children && section.children.length > 0 ? section.children : [section],
  )

  const commentCount = comments.size
  const relativePath = plan?.relativePath ?? filePath.split('/').slice(-2).join('/')

  const handleSetComment = useCallback((sectionIndex: number, comment: string | null) => {
    setComments((prev) => {
      const next = new Map(prev)
      if (comment === null) {
        next.delete(sectionIndex)
      } else {
        next.set(sectionIndex, comment)
      }
      return next
    })
  }, [])

  function buildComments(): PlanComment[] {
    const result: PlanComment[] = []
    for (const [idx, comment] of comments) {
      const section = flatSections[idx]
      if (section) {
        result.push({ sectionIndex: idx, sectionTitle: section.title, comment })
      }
    }
    return result
  }

  function handleApprove() {
    if (!sessionId || !plan) return
    const store = useSessionStore.getState()
    store.setPlanComments(sessionId, filePath, [])
    store.updatePlanStatus(sessionId, filePath, 'approved')
    const msg = `Plan approved for ${relativePath}. Proceed with implementation.`
    store.appendMessage(sessionId, { type: 'user', content: msg })
    window.api.sendMessage(sessionId, msg, [])
    closeReviewPanel()
  }

  function handleRequestChanges() {
    if (!sessionId || !plan) return
    const planComments = buildComments()
    const store = useSessionStore.getState()
    store.setPlanComments(sessionId, filePath, planComments)
    store.updatePlanStatus(sessionId, filePath, 'changes_requested')

    const lines = [`Review of ${relativePath}:\n`]
    for (const c of planComments) {
      lines.push(`### ${c.sectionTitle}`)
      lines.push(c.comment)
      lines.push('')
    }
    lines.push('Please revise the plan addressing these comments.')
    const msg = lines.join('\n')

    store.appendMessage(sessionId, { type: 'user', content: msg })
    window.api.sendMessage(sessionId, msg, [])
    closeReviewPanel()
  }

  // Close on Escape key
  useEffect(() => {
    if (!reviewPlanRef) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeReviewPanel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [reviewPlanRef, closeReviewPanel])

  const isOpen = reviewPlanRef !== null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="review-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={closeReviewPanel}
          />
          {/* Slide-over panel */}
          <motion.div
            key="review-slider"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 flex w-[70vw] min-w-120 max-w-225 flex-col border-base-border-subtle border-l bg-base-bg shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-base-border-subtle border-b px-6 py-4">
              <div>
                <div className="flex items-center gap-2.5 font-semibold text-base text-base-text">
                  <ClipboardList size={18} className="text-violet-400" />
                  Review Plan
                </div>
                <div className="mt-1 text-[12px] text-base-text-muted">
                  {relativePath} · {flatSections.length} section
                  {flatSections.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={closeReviewPanel}
                className="rounded-md p-1.5 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
                aria-label="Close review panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable sections */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-base-text-faint text-sm">
                  Loading plan...
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16">
                  <span className="text-error text-sm">Failed to load plan</span>
                  <span className="text-[12px] text-base-text-faint">{error}</span>
                </div>
              ) : flatSections.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-base-text-faint text-sm">
                  No sections found in plan file
                </div>
              ) : (
                <div className="divide-y divide-base-border-subtle/60">
                  {flatSections.map((section, i) => (
                    <ReviewSection
                      key={`${section.level}-${section.title}`}
                      index={i}
                      title={section.title}
                      body={section.body}
                      comment={comments.get(i) ?? null}
                      onSetComment={(c) => handleSetComment(i, c)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer action bar */}
            <div className="flex items-center gap-3 border-base-border-subtle border-t px-6 py-4">
              <div className="flex-1 text-base-text-muted text-xs">
                {commentCount > 0 ? (
                  <span className="text-warning">
                    {commentCount} comment{commentCount !== 1 ? 's' : ''} on {flatSections.length}{' '}
                    section
                    {flatSections.length !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span>
                    {flatSections.length} section{flatSections.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleApprove}
                disabled={!canAct}
                className="rounded-md border border-base-border bg-base-raised px-5 py-2 text-[13px] text-base-text transition-colors hover:bg-base-border disabled:opacity-40"
              >
                Approve
              </button>
              {commentCount > 0 && (
                <button
                  type="button"
                  onClick={handleRequestChanges}
                  disabled={!canAct}
                  className="rounded-md bg-accent px-5 py-2 font-semibold text-[13px] text-base-bg transition-colors hover:bg-accent-hover disabled:opacity-40"
                >
                  Request Changes
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
