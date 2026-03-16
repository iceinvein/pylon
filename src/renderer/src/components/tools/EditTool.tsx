import { FileText } from 'lucide-react'
import { useMemo } from 'react'
import { computeDiffHunks } from '../../lib/diff-utils'
import { DiffView } from '../DiffView'

type EditToolProps = {
  input: Record<string, unknown>
}

export function EditTool({ input }: EditToolProps) {
  const path = String(input.file_path ?? input.path ?? '')
  const oldString = String(input.old_string ?? input.old ?? '')
  const newString = String(input.new_string ?? input.new ?? '')

  const { hunks, addedCount, removedCount } = useMemo(() => {
    const h = computeDiffHunks(oldString, newString)
    let added = 0
    let removed = 0
    for (const hunk of h) {
      for (const line of hunk.lines) {
        if (line.type === 'added') added++
        if (line.type === 'removed') removed++
      }
    }
    return { hunks: h, addedCount: added, removedCount: removed }
  }, [oldString, newString])

  const isCreate = !oldString && newString
  const summaryParts: string[] = []
  if (addedCount > 0) summaryParts.push(`Added ${addedCount} line${addedCount !== 1 ? 's' : ''}`)
  if (removedCount > 0)
    summaryParts.push(`removed ${removedCount} line${removedCount !== 1 ? 's' : ''}`)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[var(--color-base-text-secondary)] text-xs">
        <FileText size={13} className="flex-shrink-0 text-yellow-400" />
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-base-text)]">
          {path}
        </span>
      </div>
      {summaryParts.length > 0 && (
        <div className="text-[var(--color-base-text-muted)] text-xs">
          {isCreate ? 'Created' : 'Updated'} &mdash; {summaryParts.join(', ')}
        </div>
      )}
      <div className="rounded border border-[var(--color-base-border-subtle)] bg-[var(--color-base-bg)]/60">
        <DiffView hunks={hunks} />
      </div>
    </div>
  )
}
