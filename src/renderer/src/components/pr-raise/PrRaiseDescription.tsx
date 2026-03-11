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
        <Loader2 size={20} className="animate-spin text-stone-500" />
        <span className="text-sm text-stone-500">Generating description...</span>
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
            className="w-full rounded-md border border-stone-700 bg-stone-900 p-4 font-[family-name:var(--font-mono)] text-sm text-stone-200 leading-relaxed placeholder:text-stone-600 focus:border-blue-500/50 focus:outline-none"
            placeholder={'## Summary\n- describe changes...\n\n## Test Plan\n- [ ] verify...'}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-[12px] text-stone-300 transition-colors hover:bg-stone-700"
          >
            Done editing
          </button>
        </div>
      ) : (
        <div className="group relative">
          {/* Rendered markdown-ish preview */}
          <div className="prose-invert max-w-none space-y-2 text-sm text-stone-300 leading-relaxed">
            {body.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                return (
                  <h3 key={i} className="mt-4 font-semibold text-stone-200 first:mt-0">
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
                    <span className="mr-2 text-stone-500">•</span>
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
            className="absolute top-0 right-0 flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-[11px] text-stone-400 opacity-0 transition-all hover:bg-stone-700 hover:text-stone-200 group-hover:opacity-100"
          >
            <Pencil size={12} />
            Edit
          </button>
        </div>
      )}
    </div>
  )
}
