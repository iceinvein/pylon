import { useState } from 'react'
import { MessageSquare, X } from 'lucide-react'

type ReviewSectionProps = {
  index: number
  title: string
  body: string
  comment: string | null
  onSetComment: (comment: string | null) => void
}

export function ReviewSection({ index, title, body, comment, onSetComment }: ReviewSectionProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment ?? '')
  const hasComment = comment !== null && comment.length > 0

  function handleStartComment() {
    setDraft(comment ?? '')
    setEditing(true)
  }

  function handleSave() {
    const trimmed = draft.trim()
    onSetComment(trimmed || null)
    setEditing(false)
  }

  function handleRemove() {
    onSetComment(null)
    setEditing(false)
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave()
    }
    if (e.key === 'Escape') {
      setEditing(false)
      setDraft(comment ?? '')
    }
  }

  return (
    <div
      className={`border-l-[3px] px-4 py-3 transition-colors ${
        hasComment ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="min-w-[20px] pt-0.5 text-xs font-semibold text-stone-600">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-relaxed text-stone-200">{title}</div>
          {body && (
            <div className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-stone-500">{body}</div>
          )}
        </div>
        <button
          onClick={handleStartComment}
          className={`flex-shrink-0 p-1 transition-colors ${
            hasComment ? 'text-amber-500 hover:text-amber-400' : 'text-stone-700 hover:text-stone-400'
          }`}
          title="Add comment"
        >
          <MessageSquare size={15} />
        </button>
      </div>

      {/* Comment bubble */}
      {hasComment && !editing && (
        <div className="ml-[28px] mt-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/30">
              <span className="text-[9px] font-bold text-amber-500">U</span>
            </div>
            <span className="text-[10px] font-semibold text-amber-500">COMMENT</span>
            <button onClick={handleRemove} className="ml-auto text-stone-600 hover:text-stone-400">
              <X size={12} />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-stone-300">{comment}</p>
        </div>
      )}

      {/* Comment editor */}
      {editing && (
        <div className="ml-[28px] mt-2.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="Add your feedback..."
            className="w-full resize-none rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-stone-200 outline-none placeholder:text-stone-600 focus:border-amber-500/50"
            rows={2}
          />
          <div className="mt-1 text-[10px] text-stone-600">
            Cmd+Enter to save · Esc to cancel
          </div>
        </div>
      )}
    </div>
  )
}
