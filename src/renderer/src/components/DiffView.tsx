import { useMemo } from 'react'
import { diffWords } from 'diff'
import type { DiffLine, DiffHunk } from '../lib/diff-utils'
import { buildPairedLines } from '../lib/diff-utils'

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
      <span className="w-8 flex-shrink-0 select-none pr-1 text-right text-stone-600">
        {lineNo}
      </span>
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

type DiffViewProps = {
  hunks: DiffHunk[]
}

export function DiffView({ hunks }: DiffViewProps) {
  const pairedLines = useMemo(() => buildPairedLines(hunks), [hunks])

  if (hunks.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-stone-600">No changes</div>
    )
  }

  return (
    <div className="overflow-x-auto font-[family-name:var(--font-mono)] text-xs leading-5">
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
  )
}

export { DiffLineRow, InlineHighlight }
