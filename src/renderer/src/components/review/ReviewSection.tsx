import { ChevronDown, ChevronRight, MessageSquare, X } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const sectionProseClasses = [
  'prose prose-invert prose-sm max-w-none',
  'prose-p:text-stone-300 prose-li:text-stone-300',
  'prose-headings:text-stone-200 prose-strong:text-stone-200',
  'prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline',
  'prose-pre:bg-stone-900 prose-pre:border prose-pre:border-stone-800 prose-pre:rounded-lg prose-pre:my-2',
  'prose-code:text-amber-300 prose-code:bg-stone-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-[family-name:var(--font-mono)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-table:border-collapse',
  'prose-th:border prose-th:border-stone-700 prose-th:bg-stone-800/50 prose-th:px-3 prose-th:py-1.5 prose-th:text-stone-200',
  'prose-td:border prose-td:border-stone-800 prose-td:px-3 prose-td:py-1.5 prose-td:text-stone-300',
  'prose-blockquote:border-stone-600 prose-blockquote:text-stone-400',
  'prose-hr:border-stone-800',
  'prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
].join(' ')

type ReviewSectionProps = {
  index: number
  title: string
  body: string
  comment: string | null
  onSetComment: (comment: string | null) => void
}

export function ReviewSection({ index, title, body, comment, onSetComment }: ReviewSectionProps) {
  const [editing, setEditing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
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
      className={`border-l-[3px] px-5 py-4 transition-colors ${
        hasComment ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="mt-0.5 flex-shrink-0 text-stone-600 transition-colors hover:text-stone-400"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="min-w-[24px] pt-0.5 font-semibold text-stone-500 text-xs tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-left font-medium text-[13px] text-stone-200 leading-relaxed transition-colors hover:text-stone-100"
          >
            {title}
          </button>
          {body && !collapsed && (
            <div className={`mt-2 ${sectionProseClasses}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleStartComment}
          className={`flex-shrink-0 p-1 transition-colors ${
            hasComment
              ? 'text-amber-500 hover:text-amber-400'
              : 'text-stone-700 hover:text-stone-400'
          }`}
          title="Add comment"
        >
          <MessageSquare size={15} />
        </button>
      </div>

      {/* Comment bubble */}
      {hasComment && !editing && !collapsed && (
        <div className="mt-3 ml-[44px] rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/30">
              <span className="font-bold text-[9px] text-amber-500">U</span>
            </div>
            <span className="font-semibold text-[10px] text-amber-500">COMMENT</span>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-auto text-stone-600 hover:text-stone-400"
            >
              <X size={12} />
            </button>
          </div>
          <p className="text-stone-300 text-xs leading-relaxed">{comment}</p>
        </div>
      )}

      {/* Comment editor */}
      {editing && !collapsed && (
        <div className="mt-3 ml-[44px]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add your feedback..."
            className="w-full resize-none rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-stone-200 text-xs leading-relaxed outline-none placeholder:text-stone-600 focus:border-amber-500/50"
            rows={3}
          />
          <div className="mt-1 text-[10px] text-stone-600">Cmd+Enter to save · Esc to cancel</div>
        </div>
      )}
    </div>
  )
}
