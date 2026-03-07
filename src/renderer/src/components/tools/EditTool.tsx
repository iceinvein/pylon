import { useMemo } from 'react'
import { FileText } from 'lucide-react'
import { diffLines, diffWords } from 'diff'

type EditToolProps = {
  input: Record<string, unknown>
}

type DiffLine = {
  type: 'context' | 'added' | 'removed'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

type DiffHunk = {
  lines: DiffLine[]
}

const CONTEXT_LINES = 3

function computeDiffHunks(oldStr: string, newStr: string): DiffHunk[] {
  const changes = diffLines(oldStr, newStr)
  const allLines: DiffLine[] = []
  let oldLine = 1
  let newLine = 1

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, '').split('\n')
    for (const line of lines) {
      if (change.added) {
        allLines.push({ type: 'added', content: line, newLineNo: newLine++ })
      } else if (change.removed) {
        allLines.push({ type: 'removed', content: line, oldLineNo: oldLine++ })
      } else {
        allLines.push({ type: 'context', content: line, oldLineNo: oldLine++, newLineNo: newLine++ })
      }
    }
  }

  // Group into hunks with context
  const changedIndices = new Set<number>()
  allLines.forEach((line, i) => {
    if (line.type !== 'context') changedIndices.add(i)
  })

  if (changedIndices.size === 0) return []

  // Expand context around changes
  const visibleIndices = new Set<number>()
  for (const idx of changedIndices) {
    for (let i = Math.max(0, idx - CONTEXT_LINES); i <= Math.min(allLines.length - 1, idx + CONTEXT_LINES); i++) {
      visibleIndices.add(i)
    }
  }

  // Split into hunks (groups separated by gaps)
  const sorted = [...visibleIndices].sort((a, b) => a - b)
  const hunks: DiffHunk[] = []
  let currentHunk: DiffLine[] = []

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      hunks.push({ lines: currentHunk })
      currentHunk = []
    }
    currentHunk.push(allLines[sorted[i]])
  }
  if (currentHunk.length > 0) {
    hunks.push({ lines: currentHunk })
  }

  return hunks
}

function InlineHighlight({ oldText, newText, type }: { oldText: string; newText: string; type: 'added' | 'removed' }) {
  const parts = diffWords(oldText, newText)

  return (
    <span>
      {parts.map((part, i) => {
        if (type === 'removed' && part.added) return null
        if (type === 'added' && part.removed) return null

        const isHighlighted = type === 'removed' ? part.removed : part.added
        return (
          <span
            key={i}
            className={isHighlighted ? (type === 'removed' ? 'bg-red-700/50 rounded-xs' : 'bg-emerald-700/50 rounded-xs') : ''}
          >
            {part.value}
          </span>
        )
      })}
    </span>
  )
}

function DiffLineRow({
  line,
  pairedContent,
}: {
  line: DiffLine
  pairedContent?: string
}) {
  // Single line number: show the relevant line number for this line type
  const lineNo =
    line.type === 'removed' ? line.oldLineNo :
    line.type === 'added' ? line.newLineNo :
    line.newLineNo

  return (
    <div
      className={`flex gap-0 ${
        line.type === 'removed'
          ? 'bg-red-950/30'
          : line.type === 'added'
            ? 'bg-emerald-950/30'
            : ''
      }`}
    >
      {/* Line number */}
      <span className="w-8 flex-shrink-0 select-none pr-1 text-right text-stone-600">
        {lineNo}
      </span>

      {/* +/- marker */}
      <span
        className={`w-4 flex-shrink-0 select-none text-center ${
          line.type === 'removed'
            ? 'text-red-500'
            : line.type === 'added'
              ? 'text-emerald-500'
              : 'text-stone-700'
        }`}
      >
        {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
      </span>

      {/* Content */}
      <span
        className={`min-w-0 flex-1 whitespace-pre ${
          line.type === 'removed'
            ? 'text-red-300/90'
            : line.type === 'added'
              ? 'text-emerald-300/90'
              : 'text-stone-400'
        }`}
      >
        {pairedContent !== undefined ? (
          <InlineHighlight
            oldText={line.type === 'removed' ? line.content : pairedContent}
            newText={line.type === 'added' ? line.content : pairedContent}
            type={line.type as 'added' | 'removed'}
          />
        ) : (
          line.content
        )}
      </span>
    </div>
  )
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

  // Build a map of paired removed/added lines for word-level highlighting.
  // We pair consecutive removed+added runs line-by-line.
  const pairedLines = useMemo(() => {
    const map = new Map<DiffLine, string>()
    for (const hunk of hunks) {
      let i = 0
      while (i < hunk.lines.length) {
        // Find runs of removed lines followed by added lines
        const removeStart = i
        while (i < hunk.lines.length && hunk.lines[i].type === 'removed') i++
        const removeEnd = i
        const addStart = i
        while (i < hunk.lines.length && hunk.lines[i].type === 'added') i++
        const addEnd = i

        const removeCount = removeEnd - removeStart
        const addCount = addEnd - addStart

        // Only pair if counts are equal (clean replacement)
        if (removeCount > 0 && addCount > 0 && removeCount === addCount) {
          for (let j = 0; j < removeCount; j++) {
            const removedLine = hunk.lines[removeStart + j]
            const addedLine = hunk.lines[addStart + j]
            map.set(removedLine, addedLine.content)
            map.set(addedLine, removedLine.content)
          }
        }

        // Skip context lines
        if (i === removeStart) i++
      }
    }
    return map
  }, [hunks])

  const isCreate = !oldString && newString
  const summaryParts: string[] = []
  if (addedCount > 0) summaryParts.push(`Added ${addedCount} line${addedCount !== 1 ? 's' : ''}`)
  if (removedCount > 0) summaryParts.push(`removed ${removedCount} line${removedCount !== 1 ? 's' : ''}`)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-stone-400">
        <FileText size={13} className="flex-shrink-0 text-yellow-400" />
        <span className="font-[family-name:var(--font-mono)] text-stone-300">{path}</span>
      </div>
      {summaryParts.length > 0 && (
        <div className="text-xs text-stone-500">
          {isCreate ? 'Created' : 'Updated'} &mdash; {summaryParts.join(', ')}
        </div>
      )}
      <div className="overflow-x-auto rounded border border-stone-800 bg-stone-950/60 font-[family-name:var(--font-mono)] text-xs leading-5">
        {hunks.map((hunk, hi) => (
          <div key={hi}>
            {hi > 0 && (
              <div className="border-y border-stone-800/50 bg-stone-900/30 px-2 py-0.5 text-center text-stone-600">
                ⋯
              </div>
            )}
            {hunk.lines.map((line, li) => (
              <DiffLineRow key={li} line={line} pairedContent={pairedLines.get(line)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
