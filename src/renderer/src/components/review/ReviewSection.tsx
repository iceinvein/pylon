import { ChevronDown, ChevronRight, MessageSquare, X } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const sectionProseClasses = [
  'prose prose-invert prose-sm max-w-none',
  'prose-p:text-[var(--color-base-text)] prose-li:text-[var(--color-base-text)]',
  'prose-headings:text-[var(--color-base-text)] prose-strong:text-[var(--color-base-text)]',
  'prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline',
  'prose-pre:bg-[var(--color-base-surface)] prose-pre:border prose-pre:border-[var(--color-base-border-subtle)] prose-pre:rounded-lg prose-pre:my-2',
  'prose-code:text-[var(--color-accent-text)] prose-code:bg-[var(--color-base-raised)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-[family-name:var(--font-mono)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-table:border-collapse',
  'prose-th:border prose-th:border-[var(--color-base-border)] prose-th:bg-[var(--color-base-raised)]/50 prose-th:px-3 prose-th:py-1.5 prose-th:text-[var(--color-base-text)]',
  'prose-td:border prose-td:border-[var(--color-base-border-subtle)] prose-td:px-3 prose-td:py-1.5 prose-td:text-[var(--color-base-text)]',
  'prose-blockquote:border-[var(--color-base-border)] prose-blockquote:text-[var(--color-base-text-secondary)]',
  'prose-hr:border-[var(--color-base-border-subtle)]',
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
        hasComment ? 'border-l-warning bg-warning/5' : 'border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="mt-0.5 shrink-0 text-base-text-faint transition-colors hover:text-base-text-secondary"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="min-w-6 pt-0.5 font-semibold text-base-text-muted text-xs tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-left font-medium text-base-text text-sm leading-relaxed transition-colors hover:text-base-text"
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
          className={`shrink-0 p-1 transition-colors ${
            hasComment
              ? 'text-warning hover:text-warning'
              : 'text-base-text-faint hover:text-base-text-secondary'
          }`}
          title="Add comment"
        >
          <MessageSquare size={15} />
        </button>
      </div>

      {/* Comment bubble */}
      {hasComment && !editing && !collapsed && (
        <div className="mt-3 ml-11 rounded-md border border-base-border bg-base-raised/50 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-base-text/20">
              <span className="font-bold text-[10px] text-warning">U</span>
            </div>
            <span className="font-semibold text-[10px] text-warning">COMMENT</span>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-auto text-base-text-faint hover:text-base-text-secondary"
            >
              <X size={12} />
            </button>
          </div>
          <p className="text-base-text text-xs leading-relaxed">{comment}</p>
        </div>
      )}

      {/* Comment editor */}
      {editing && !collapsed && (
        <div className="mt-3 ml-11">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add your feedback..."
            className="w-full resize-none rounded-md border border-base-border bg-base-raised/50 px-3 py-2 text-base-text text-xs leading-relaxed outline-none placeholder:text-base-text-faint focus:border-base-text/30"
            rows={3}
          />
          <div className="mt-1 text-[10px] text-base-text-faint">
            Cmd+Enter to save · Esc to cancel
          </div>
        </div>
      )}
    </div>
  )
}
