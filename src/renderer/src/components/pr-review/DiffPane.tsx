import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Columns2, Rows3, Eye, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react'
import { parseUnifiedDiffToHunks } from '../../lib/diff-utils'
import { DiffView } from '../DiffView'
import { SplitDiffView } from './SplitDiffView'
import { DiffFindingAnnotation } from './DiffFindingAnnotation'
import type { ReviewFinding } from '../../../../shared/types'

type FileEntry = {
  path: string
  additions: number
  deletions: number
}

type Props = {
  selectedFile: string | null
  files: FileEntry[]
  fileDiffs: Map<string, string>
  findings: ReviewFinding[]
  selectedFindingIds: Set<string>
  onToggleFinding: (id: string) => void
  onPostFinding: (finding: ReviewFinding) => void
}

type DiffMode = 'unified' | 'split'

const SEVERITY_TICK_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  suggestion: 'bg-blue-500',
  nitpick: 'bg-stone-500',
}


export function DiffPane({ selectedFile, files, fileDiffs, findings, selectedFindingIds, onToggleFinding, onPostFinding }: Props) {
  const [mode, setMode] = useState<DiffMode>('unified')
  const [activeFindingIdx, setActiveFindingIdx] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tickPositions, setTickPositions] = useState<{ top: number; severity: string }[]>([])

  // All hooks must run unconditionally (Rules of Hooks)
  const rawDiff = useMemo(() => {
    if (!selectedFile) return undefined
    const exact = fileDiffs.get(selectedFile)
    if (exact) return exact
    for (const [key, diff] of fileDiffs) {
      if (key.endsWith(selectedFile) || selectedFile.endsWith(key)) return diff
    }
    return undefined
  }, [selectedFile, fileDiffs])

  const fileFindings = useMemo(
    () => selectedFile ? findings.filter((f) =>
      f.file === selectedFile || selectedFile.endsWith(f.file) || f.file.endsWith(selectedFile)
    ) : [],
    [selectedFile, findings]
  )

  const hunks = useMemo(() => {
    if (!rawDiff) return []
    return parseUnifiedDiffToHunks(rawDiff)
  }, [rawDiff])

  // Reset active finding index when file changes
  useEffect(() => { setActiveFindingIdx(-1) }, [selectedFile])

  // Compute tick positions for the scrollbar indicator after render
  useEffect(() => {
    if (!scrollRef.current || fileFindings.length === 0) {
      setTickPositions([])
      return
    }
    // Small delay so DOM has rendered findings
    const timer = setTimeout(() => {
      const container = scrollRef.current
      if (!container) return
      const scrollHeight = container.scrollHeight
      const clientHeight = container.clientHeight
      if (scrollHeight <= clientHeight) { setTickPositions([]); return }

      const ticks: { top: number; severity: string }[] = []
      for (const f of fileFindings) {
        const el = container.querySelector(`[data-finding-id="${f.id}"]`) as HTMLElement | null
        if (el) {
          const pct = (el.offsetTop / scrollHeight) * 100
          ticks.push({ top: pct, severity: f.severity })
        }
      }
      setTickPositions(ticks)
    }, 100)
    return () => clearTimeout(timer)
  }, [fileFindings, hunks, mode])

  const scrollToFinding = useCallback((idx: number) => {
    if (idx < 0 || idx >= fileFindings.length || !scrollRef.current) return
    setActiveFindingIdx(idx)
    const f = fileFindings[idx]
    const el = scrollRef.current.querySelector(`[data-finding-id="${f.id}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Brief highlight pulse
      el.classList.add('ring-1', 'ring-stone-400/60')
      setTimeout(() => el.classList.remove('ring-1', 'ring-stone-400/60'), 1200)
    }
  }, [fileFindings])

  const goNext = useCallback(() => {
    const next = activeFindingIdx < fileFindings.length - 1 ? activeFindingIdx + 1 : 0
    scrollToFinding(next)
  }, [activeFindingIdx, fileFindings.length, scrollToFinding])

  const goPrev = useCallback(() => {
    const prev = activeFindingIdx > 0 ? activeFindingIdx - 1 : fileFindings.length - 1
    scrollToFinding(prev)
  }, [activeFindingIdx, fileFindings.length, scrollToFinding])

  // Keyboard shortcuts: F/N = next finding, Shift+F/Shift+N = previous
  useEffect(() => {
    if (fileFindings.length === 0) return
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'f' || e.key === 'n') {
        e.preventDefault()
        if (e.shiftKey) goPrev()
        else goNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fileFindings.length, goNext, goPrev])

  // Overview mode — general findings (no file)
  if (selectedFile === null) {
    const generalFindings = findings.filter((f) => !f.file)
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-stone-800 bg-stone-900/30 px-4 py-2">
          <Eye size={12} className="text-stone-500" />
          <span className="text-[11px] font-medium text-stone-300">Overview</span>
          <span className="text-[11px] text-stone-600">General findings</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {generalFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-stone-600">
              <CheckCircle2 size={24} strokeWidth={1.5} />
              <p className="text-xs">No general findings</p>
              <p className="text-[10px]">Select a file from the tree to view inline findings</p>
            </div>
          ) : (
            <div className="space-y-2">
              {generalFindings.map((f) => (
                <DiffFindingAnnotation
                  key={f.id}
                  finding={f}
                  checked={selectedFindingIds.has(f.id)}
                  onToggle={() => onToggleFinding(f.id)}
                  onPost={() => onPostFinding(f)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // File diff mode
  const file = files.find((f) => f.path === selectedFile)
  const parts = selectedFile.split('/')
  const fileName = parts.pop() || selectedFile
  const dirPath = parts.join('/')

  // Findings that can't be placed inline
  const hunkNewLines = new Set<number>()
  for (const h of hunks) for (const l of h.lines) if (l.newLineNo) hunkNewLines.add(l.newLineNo)
  const unplacedFindings = fileFindings.filter((f) => f.line == null || !hunkNewLines.has(f.line))

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-stone-800 bg-stone-900/30 px-4 py-2">
        <div className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[11px]">
          {dirPath && <span className="text-stone-600">{dirPath}/</span>}
          <span className="text-stone-200">{fileName}</span>
        </div>
        {file && (
          <span className="flex-shrink-0 font-[family-name:var(--font-mono)] text-[10px] tabular-nums">
            <span className="text-emerald-500">+{file.additions}</span>{' '}
            <span className="text-red-500">-{file.deletions}</span>
          </span>
        )}
        {/* Finding navigation */}
        {fileFindings.length > 0 && (
          <div className="flex flex-shrink-0 items-center overflow-hidden rounded-md border border-stone-600 bg-stone-800">
            <button
              onClick={goPrev}
              className="px-1.5 py-1 text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
              title="Previous finding (Shift+F)"
            >
              <ChevronUp size={13} strokeWidth={2.5} />
            </button>
            <span
              className="cursor-default border-x border-stone-700 px-2.5 py-1 text-[11px] font-medium tabular-nums text-stone-200"
              title={`${fileFindings.length} finding${fileFindings.length !== 1 ? 's' : ''} in this file`}
            >
              {activeFindingIdx >= 0
                ? <><span className="text-white">{activeFindingIdx + 1}</span><span className="text-stone-500"> / </span><span>{fileFindings.length}</span></>
                : <>{fileFindings.length} <span className="text-[10px] font-normal text-stone-400">finding{fileFindings.length !== 1 ? 's' : ''}</span></>
              }
            </span>
            <button
              onClick={goNext}
              className="px-1.5 py-1 text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
              title="Next finding (F)"
            >
              <ChevronDown size={13} strokeWidth={2.5} />
            </button>
          </div>
        )}
        {/* Mode toggle */}
        <div className="flex flex-shrink-0 overflow-hidden rounded-md border border-stone-700">
          <button
            onClick={() => setMode('unified')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors ${
              mode === 'unified' ? 'bg-stone-700 text-stone-200' : 'text-stone-500 hover:text-stone-300'
            }`}
            title="Unified view"
          >
            <Rows3 size={10} />
            Unified
          </button>
          <button
            onClick={() => setMode('split')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors ${
              mode === 'split' ? 'bg-stone-700 text-stone-200' : 'text-stone-500 hover:text-stone-300'
            }`}
            title="Side-by-side view"
          >
            <Columns2 size={10} />
            Split
          </button>
        </div>
      </div>

      {/* Diff content with scrollbar tick marks */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-auto">
          {/* Unplaced findings (no line or line not in hunks) */}
          {unplacedFindings.length > 0 && (
            <div className="space-y-1 border-b border-stone-800 bg-stone-900/20 p-3">
              {unplacedFindings.map((f) => (
                <DiffFindingAnnotation
                  key={f.id}
                  finding={f}
                  checked={selectedFindingIds.has(f.id)}
                  onToggle={() => onToggleFinding(f.id)}
                  onPost={() => onPostFinding(f)}
                />
              ))}
            </div>
          )}
          {hunks.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-xs text-stone-600">
              {rawDiff ? 'Binary file or no textual changes' : 'No diff available for this file'}
            </div>
          ) : mode === 'unified' ? (
            <DiffView
              hunks={hunks}
              findings={fileFindings}
              selectedFindingIds={selectedFindingIds}
              onToggleFinding={onToggleFinding}
              onPostFinding={onPostFinding}
            />
          ) : (
            <SplitDiffView
              hunks={hunks}
              findings={fileFindings}
              selectedFindingIds={selectedFindingIds}
              onToggleFinding={onToggleFinding}
              onPostFinding={onPostFinding}
            />
          )}
        </div>

        {/* Scrollbar tick marks showing finding positions */}
        {tickPositions.length > 0 && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-2">
            {tickPositions.map((tick, i) => (
              <div
                key={i}
                className={`absolute right-0.5 h-1.5 w-1.5 rounded-full ${SEVERITY_TICK_COLORS[tick.severity] || SEVERITY_TICK_COLORS.suggestion}`}
                style={{ top: `${tick.top}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
