import { ChevronDown, ChevronRight, GripVertical, Play } from 'lucide-react'
import { useState } from 'react'
import type { CommitGroup } from '../../../../shared/git-types'

type CommitPlanCardProps = {
  group: CommitGroup
  onExecute: () => void
  onEditMessage: (message: string) => void
  executing: boolean
}

export function CommitPlanCard({
  group,
  onExecute,
  onEditMessage,
  executing,
}: CommitPlanCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(group.message)

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/50">
      <div className="flex items-start gap-2 p-3">
        <GripVertical size={14} className="mt-0.5 flex-shrink-0 cursor-grab text-stone-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 font-medium text-[10px] text-stone-400">
              {group.order}
            </span>
            {editing ? (
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onBlur={() => {
                  setEditing(false)
                  onEditMessage(message)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditing(false)
                    onEditMessage(message)
                  }
                }}
                className="min-w-0 flex-1 rounded bg-stone-800 px-2 py-0.5 font-[family-name:var(--font-mono)] text-stone-200 text-xs outline-none ring-1 ring-amber-600"
                // biome-ignore lint/a11y/noAutofocus: intentional focus on edit mode
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-w-0 flex-1 truncate text-left font-[family-name:var(--font-mono)] text-stone-200 text-xs hover:text-amber-400"
                title="Click to edit"
              >
                {group.message}
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-stone-500">{group.files.length} files</p>
        </div>
        <button
          type="button"
          onClick={onExecute}
          disabled={executing}
          className="flex-shrink-0 rounded bg-emerald-600 p-1.5 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          title="Commit this group"
        >
          <Play size={11} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 border-stone-800 border-t px-3 py-1.5 text-[10px] text-stone-500 hover:bg-stone-800/50"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Files & rationale
      </button>

      {expanded && (
        <div className="border-stone-800 border-t px-3 py-2">
          <p className="mb-2 text-[10px] text-stone-500 italic">{group.rationale}</p>
          {group.files.map((f) => (
            <div
              key={f.path}
              className="font-[family-name:var(--font-mono)] text-[10px] text-stone-400"
            >
              {f.path}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
