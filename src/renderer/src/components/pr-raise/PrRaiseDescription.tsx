import { Loader2, Pencil } from 'lucide-react'
import { useState } from 'react'

type Props = {
  body: string
  onBodyChange: (body: string) => void
  generating: boolean
}

export function PrRaiseDescription({ body, onBodyChange, generating }: Props) {
  const [editing, setEditing] = useState(false)

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={20} className="animate-spin text-base-text-muted" />
        <span className="text-base-text-muted text-sm">Generating description...</span>
      </div>
    )
  }

  return (
    <div className="p-6">
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={16}
            className="w-full rounded-md border border-base-border bg-base-surface p-4 font-mono text-base-text text-sm leading-relaxed placeholder:text-base-text-faint focus:border-info/50 focus:outline-none"
            placeholder={'## Summary\n- describe changes...\n\n## Test Plan\n- [ ] verify...'}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-base-border bg-base-raised px-3 py-1.5 text-[12px] text-base-text transition-colors hover:bg-base-border"
          >
            Done editing
          </button>
        </div>
      ) : (
        <div className="group relative">
          {/* Rendered markdown-ish preview */}
          <div className="prose-invert max-w-none space-y-2 text-base-text text-sm leading-relaxed">
            {body.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                return (
                  <h3 key={i} className="mt-4 font-semibold text-base-text first:mt-0">
                    {line.replace('## ', '')}
                  </h3>
                )
              }
              if (line.startsWith('- [ ] ')) {
                return (
                  <div key={i} className="flex items-center gap-2 pl-1">
                    <input type="checkbox" disabled className="accent-blue-500" />
                    <span>{line.replace('- [ ] ', '')}</span>
                  </div>
                )
              }
              if (line.startsWith('- ')) {
                return (
                  <div key={i} className="pl-1">
                    <span className="mr-2 text-base-text-muted">•</span>
                    {line.replace('- ', '')}
                  </div>
                )
              }
              if (line.trim() === '') return <div key={i} className="h-2" />
              return <p key={i}>{line}</p>
            })}
          </div>
          {/* Edit button */}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="absolute top-0 right-0 flex items-center gap-1.5 rounded-md border border-base-border bg-base-raised px-2.5 py-1.5 text-base-text-secondary text-xs opacity-0 transition-all hover:bg-base-border hover:text-base-text group-hover:opacity-100"
          >
            <Pencil size={12} />
            Edit
          </button>
        </div>
      )}
    </div>
  )
}
