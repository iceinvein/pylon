import { useEffect, useState, useCallback } from 'react'
import { X, ClipboardList } from 'lucide-react'
import { useSessionStore } from '../../store/session-store'
import { useUiStore } from '../../store/ui-store'
import { parsePlanSections } from '../../lib/parse-plan'
import { ReviewSection } from './ReviewSection'
import type { PlanSection, PlanComment } from '../../../../shared/types'

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
  const canAct = session?.status === 'running' || session?.status === 'waiting' || session?.status === 'done'

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
    window.api.readPlanFile(filePath)
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
    section.children && section.children.length > 0 ? section.children : [section]
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

  if (!reviewPlanRef) return null

  return (
    <div className="flex h-full flex-col bg-[var(--color-base-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-200">
            <ClipboardList size={15} className="text-violet-400" />
            Review Plan
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500">
            {relativePath} · {flatSections.length} section{flatSections.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={closeReviewPanel}
          className="rounded p-1 text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-300"
          aria-label="Close review panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-xs text-stone-600">
            Loading plan...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12">
            <span className="text-xs text-red-400">Failed to load plan</span>
            <span className="text-[11px] text-stone-600">{error}</span>
          </div>
        ) : flatSections.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-stone-600">
            No sections found in plan file
          </div>
        ) : (
          <div className="divide-y divide-stone-800/60">
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
      <div className="flex items-center gap-2.5 border-t border-stone-800 px-4 py-3">
        <div className="flex-1 text-xs text-stone-500">
          {commentCount > 0 ? (
            <span className="text-amber-500">{commentCount} comment{commentCount !== 1 ? 's' : ''} on {flatSections.length} section{flatSections.length !== 1 ? 's' : ''}</span>
          ) : (
            <span>{flatSections.length} section{flatSections.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={handleApprove}
          disabled={!canAct}
          className="rounded-md border border-stone-700 bg-stone-800 px-4 py-2 text-[13px] text-stone-300 transition-colors hover:bg-stone-700 disabled:opacity-40"
        >
          Approve
        </button>
        {commentCount > 0 && (
          <button
            onClick={handleRequestChanges}
            disabled={!canAct}
            className="rounded-md bg-amber-600 px-4 py-2 text-[13px] font-semibold text-stone-950 transition-colors hover:bg-amber-500 disabled:opacity-40"
          >
            Request Changes
          </button>
        )}
      </div>
    </div>
  )
}
