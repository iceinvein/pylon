import { diffWords } from 'diff'
import { useCallback, useMemo, useRef } from 'react'
import type { ReviewFinding } from '../../../../shared/types'
import type { DiffHunk, DiffLine } from '../../lib/diff-utils'
import { DiffFindingAnnotation } from './DiffFindingAnnotation'

type Props = {
  hunks: DiffHunk[]
  findings?: ReviewFinding[]
  selectedFindingIds?: Set<string>
  onToggleFinding?: (id: string) => void
  onPostFinding?: (finding: ReviewFinding) => void
}

type SplitRow = {
  left: DiffLine | null
  right: DiffLine | null
}

function buildSplitRows(hunks: DiffHunk[]): { rows: SplitRow[]; hunkBoundaries: Set<number> } {
  const rows: SplitRow[] = []
  const hunkBoundaries = new Set<number>()

  for (let hi = 0; hi < hunks.length; hi++) {
    if (hi > 0) hunkBoundaries.add(rows.length)
    const hunk = hunks[hi]
    let i = 0
    while (i < hunk.lines.length) {
      const line = hunk.lines[i]
      if (line.type === 'context') {
        rows.push({ left: line, right: line })
        i++
      } else {
        const removed: DiffLine[] = []
        const added: DiffLine[] = []
        while (i < hunk.lines.length && hunk.lines[i].type === 'removed') {
          removed.push(hunk.lines[i])
          i++
        }
        while (i < hunk.lines.length && hunk.lines[i].type === 'added') {
          added.push(hunk.lines[i])
          i++
        }
        const maxLen = Math.max(removed.length, added.length)
        for (let j = 0; j < maxLen; j++) {
          rows.push({
            left: j < removed.length ? removed[j] : null,
            right: j < added.length ? added[j] : null,
          })
        }
      }
    }
  }

  return { rows, hunkBoundaries }
}

function WordHighlight({
  oldText,
  newText,
  side,
}: {
  oldText: string
  newText: string
  side: 'left' | 'right'
}) {
  const parts = diffWords(oldText, newText)
  return (
    <span>
      {parts.map((part, i) => {
        if (side === 'left' && part.added) return null
        if (side === 'right' && part.removed) return null
        const isHighlighted = side === 'left' ? part.removed : part.added
        return (
          <span
            key={i}
            className={
              isHighlighted
                ? side === 'left'
                  ? 'rounded-xs bg-red-700/50'
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

function SplitCell({
  line,
  pairedContent,
  side,
}: {
  line: DiffLine | null
  pairedContent?: string
  side: 'left' | 'right'
}) {
  if (!line) {
    return (
      <div className="flex min-h-[1.25rem] gap-0 bg-stone-900/30">
        <span className="w-10 flex-shrink-0" />
        <span className="min-w-0 flex-1" />
      </div>
    )
  }

  const lineNo = side === 'left' ? line.oldLineNo : line.newLineNo
  const isChanged = side === 'left' ? line.type === 'removed' : line.type === 'added'

  return (
    <div
      className={`flex gap-0 ${
        isChanged ? (side === 'left' ? 'bg-red-950/30' : 'bg-emerald-950/30') : ''
      }`}
    >
      <span className="w-10 flex-shrink-0 select-none pr-2 text-right text-stone-600">
        {lineNo}
      </span>
      <span
        className={`min-w-0 flex-1 whitespace-pre ${
          isChanged
            ? side === 'left'
              ? 'text-red-300/90'
              : 'text-emerald-300/90'
            : 'text-stone-400'
        }`}
      >
        {pairedContent !== undefined ? (
          <WordHighlight
            oldText={side === 'left' ? line.content : pairedContent}
            newText={side === 'right' ? line.content : pairedContent}
            side={side}
          />
        ) : (
          line.content
        )}
      </span>
    </div>
  )
}

export function SplitDiffView({
  hunks,
  findings = [],
  selectedFindingIds,
  onToggleFinding,
  onPostFinding,
}: Props) {
  const { rows, hunkBoundaries } = useMemo(() => buildSplitRows(hunks), [hunks])

  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) {
      to.scrollTop = from.scrollTop
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [])

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

  // Build paired content map for word highlighting in split view
  const rowPairs = useMemo(() => {
    const map = new Map<number, string>()
    for (let i = 0; i < rows.length; i++) {
      const { left, right } = rows[i]
      if (left && right && left.type === 'removed' && right.type === 'added') {
        map.set(i, 'paired')
      }
    }
    return map
  }, [rows])

  if (hunks.length === 0) {
    return <div className="px-3 py-2 text-stone-600 text-xs">No changes</div>
  }

  return (
    <div className="flex overflow-hidden font-[family-name:var(--font-mono)] text-xs leading-5">
      {/* Left (old) */}
      <div
        ref={leftRef}
        className="min-w-0 flex-1 overflow-auto border-stone-800 border-r"
        onScroll={() => syncScroll('left')}
      >
        {rows.map((row, i) => (
          <div key={i}>
            {hunkBoundaries.has(i) && (
              <div className="border-stone-800/50 border-y bg-stone-900/30 px-2 py-0.5 text-center text-stone-600">
                ⋯
              </div>
            )}
            <SplitCell
              line={row.left}
              pairedContent={rowPairs.has(i) ? row.right?.content : undefined}
              side="left"
            />
          </div>
        ))}
      </div>
      {/* Right (new) */}
      <div
        ref={rightRef}
        className="min-w-0 flex-1 overflow-auto"
        onScroll={() => syncScroll('right')}
      >
        {rows.map((row, i) => {
          const lineNo = row.right?.newLineNo
          const lineFindings = lineNo ? findingsByLine.get(lineNo) : undefined
          return (
            <div key={i}>
              {hunkBoundaries.has(i) && (
                <div className="border-stone-800/50 border-y bg-stone-900/30 px-2 py-0.5 text-center text-stone-600">
                  ⋯
                </div>
              )}
              <SplitCell
                line={row.right}
                pairedContent={rowPairs.has(i) ? row.left?.content : undefined}
                side="right"
              />
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
    </div>
  )
}
