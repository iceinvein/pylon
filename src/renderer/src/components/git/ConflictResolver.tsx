import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { ConflictResolution } from '../../../../shared/git-types'

type ConflictResolverProps = {
  conflicts: ConflictResolution[]
  onApply: (resolutions: ConflictResolution[]) => void
  onCancel: () => void
}

const confidenceColors = {
  high: 'text-emerald-400',
  medium: 'text-yellow-400',
  low: 'text-red-400',
}

export function ConflictResolver({ conflicts, onApply, onCancel }: ConflictResolverProps) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  const toggleFile = (path: string) => {
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const acceptAll = () => setAccepted(new Set(conflicts.map((c) => c.filePath)))

  const handleApply = () => {
    const selected = conflicts.filter((c) => accepted.has(c.filePath))
    onApply(selected)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
        <p className="font-medium text-stone-300 text-xs">Conflict Resolution</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={acceptAll}
            className="text-[10px] text-stone-500 hover:text-stone-300"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] text-stone-500 hover:text-red-400"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conflicts.map((conflict) => (
          <div
            key={conflict.filePath}
            className="mb-2 rounded-lg border border-stone-700 bg-stone-900/50"
          >
            <label className="flex cursor-pointer items-center gap-2 p-2.5">
              <input
                type="checkbox"
                checked={accepted.has(conflict.filePath)}
                onChange={() => toggleFile(conflict.filePath)}
                className="h-3 w-3 rounded border-stone-600 bg-stone-800 accent-amber-600"
              />
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-stone-300 text-xs">
                {conflict.filePath}
              </span>
              <span className={`text-[10px] ${confidenceColors[conflict.confidence]}`}>
                {conflict.confidence}
                {conflict.confidence === 'low' && (
                  <AlertTriangle size={10} className="ml-1 inline" />
                )}
              </span>
            </label>
            <div className="border-stone-800 border-t px-3 py-2">
              <p className="text-[10px] text-stone-500">{conflict.explanation}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-stone-800 border-t p-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={accepted.size === 0}
          className="w-full rounded bg-emerald-600 px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          Apply {accepted.size} resolution{accepted.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}
