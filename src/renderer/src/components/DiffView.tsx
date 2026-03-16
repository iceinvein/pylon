import { diffWords } from 'diff'
import { useMemo } from 'react'
import type { ReviewFinding } from '../../../shared/types'
import type { DiffHunk, DiffLine } from '../lib/diff-utils'
import { buildPairedLines } from '../lib/diff-utils'
import { DiffFindingAnnotation } from './pr-review/DiffFindingAnnotation'

function InlineHighlight({
  oldText,
  newText,
  type,
}: {
  oldText: string
  newText: string
  type: 'added' | 'removed'
}) {
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
            className={
              isHighlighted
                ? type === 'removed'
                  ? 'rounded-xs bg-[var(--color-error)]/50'
                  : 'rounded-xs bg-emerald-700/50'
                : ''
            }
          >
            {part.value}
          </span>
        )
      })}
    </span>
  )
}

function DiffLineRow({ line, pairedContent }: { line: DiffLine; pairedContent?: string }) {
  const lineNo =
    line.type === 'removed'
      ? line.oldLineNo
      : line.type === 'added'
        ? line.newLineNo
        : line.newLineNo

  return (
    <div
      className={`flex gap-0 ${
        line.type === 'removed'
          ? 'bg-[var(--color-error)]/30'
          : line.type === 'added'
            ? 'bg-[var(--color-success)]/30'
            : ''
      }`}
    >
      <span className="w-8 flex-shrink-0 select-none pr-1 text-right text-[var(--color-base-text-faint)]">
        {lineNo}
      </span>
      <span
        className={`w-4 flex-shrink-0 select-none text-center ${
          line.type === 'removed'
            ? 'text-[var(--color-error)]'
            : line.type === 'added'
              ? 'text-emerald-500'
              : 'text-[var(--color-base-text-faint)]'
        }`}
      >
        {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
      </span>
      <span
        className={`min-w-0 flex-1 whitespace-pre ${
          line.type === 'removed'
            ? 'text-[var(--color-error)]/90'
            : line.type === 'added'
              ? 'text-emerald-300/90'
              : 'text-[var(--color-base-text-secondary)]'
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
  findings?: ReviewFinding[]
  selectedFindingIds?: Set<string>
  onToggleFinding?: (id: string) => void
  onPostFinding?: (finding: ReviewFinding) => void
}

export function DiffView({
  hunks,
  findings = [],
  selectedFindingIds,
  onToggleFinding,
  onPostFinding,
}: DiffViewProps) {
  const pairedLines = useMemo(() => buildPairedLines(hunks), [hunks])

  const findingsByLine = useMemo(() => {
    const map = new Map<number, ReviewFinding[]>()
    for (const f of findings) {
      if (f.line != null) {
        const existing = map.get(f.line) || []
        existing.push(f)
        map.set(f.line, existing)
      }
    }
    return map
  }, [findings])

  if (hunks.length === 0) {
    return <div className="px-3 py-2 text-[var(--color-base-text-faint)] text-xs">No changes</div>
  }

  return (
    <div className="overflow-x-auto font-[family-name:var(--font-mono)] text-xs leading-5">
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          {hi > 0 && (
            <div className="border-[var(--color-base-border-subtle)]/50 border-y bg-[var(--color-base-surface)]/30 px-2 py-0.5 text-center text-[var(--color-base-text-faint)]">
              ⋯
            </div>
          )}
          {hunk.lines.map((line, li) => {
            const lineFindings = line.newLineNo ? findingsByLine.get(line.newLineNo) : undefined
            return (
              <div key={li}>
                <DiffLineRow line={line} pairedContent={pairedLines.get(line)} />
                {lineFindings?.map((f) => (
                  <DiffFindingAnnotation
                    key={f.id}
                    finding={f}
                    checked={selectedFindingIds?.has(f.id) ?? false}
                    onToggle={() => onToggleFinding?.(f.id)}
                    onPost={() => onPostFinding?.(f)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export { DiffLineRow, InlineHighlight }
