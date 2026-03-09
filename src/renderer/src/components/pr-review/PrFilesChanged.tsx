import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { parseUnifiedDiff, computeDiffHunks } from '../../lib/diff-utils'
import { DiffView } from '../DiffView'

type PrFile = {
  path: string
  additions: number
  deletions: number
}

type PrFilesChangedProps = {
  files: PrFile[]
  diff?: string
}

/** Split a full unified diff into per-file chunks keyed by file path. */
function splitDiffByFile(fullDiff: string): Map<string, string> {
  const map = new Map<string, string>()
  // Split on "diff --git" boundaries
  const chunks = fullDiff.split(/^(?=diff --git )/m)

  for (const chunk of chunks) {
    if (!chunk.startsWith('diff --git ')) continue
    // Extract file path from "diff --git a/path b/path"
    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    // Use the "b" path (destination) as the key
    const filePath = headerMatch[2]
    map.set(filePath, chunk)
  }

  return map
}

function formatNumber(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function PrFilesChanged({ files, diff }: PrFilesChangedProps) {
  const [expanded, setExpanded] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  const fileDiffs = useMemo(() => (diff ? splitDiffByFile(diff) : new Map<string, string>()), [diff])

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-stone-800 bg-stone-900/40">
      {/* Summary header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-stone-800/50"
      >
        <ChevronDown
          size={12}
          className={`flex-shrink-0 text-stone-500 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
        />
        <FileText size={12} className="flex-shrink-0 text-stone-500" />
        <span className="text-stone-300">
          {files.length} file{files.length !== 1 ? 's' : ''} changed
        </span>
        <span className="ml-auto flex items-center gap-2 font-[family-name:var(--font-mono)] tabular-nums">
          <span className="text-emerald-500">+{formatNumber(totalAdditions)}</span>
          <span className="text-red-500">-{formatNumber(totalDeletions)}</span>
        </span>
      </button>

      {/* File list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-[70vh] overflow-y-auto border-t border-stone-800">
              {files.map((file, i) => (
                <FileRow
                  key={file.path}
                  file={file}
                  isLast={i === files.length - 1}
                  fileDiff={fileDiffs.get(file.path)}
                  isExpanded={expandedFiles.has(file.path)}
                  onToggle={() => toggleFile(file.path)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FileRow({
  file,
  isLast,
  fileDiff,
  isExpanded,
  onToggle,
}: {
  file: PrFile
  isLast: boolean
  fileDiff?: string
  isExpanded: boolean
  onToggle: () => void
}) {
  const lastSlash = file.path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : ''
  const name = lastSlash >= 0 ? file.path.slice(lastSlash + 1) : file.path
  const hasDiff = !!fileDiff

  return (
    <div className={isLast && !isExpanded ? '' : 'border-b border-stone-800/50'}>
      <button
        onClick={hasDiff ? onToggle : undefined}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
          hasDiff ? 'hover:bg-stone-800/40 cursor-pointer' : 'cursor-default'
        } ${isExpanded ? 'bg-stone-800/30' : ''}`}
      >
        {hasDiff ? (
          isExpanded
            ? <ChevronDown size={11} className="flex-shrink-0 text-stone-500" />
            : <ChevronRight size={11} className="flex-shrink-0 text-stone-500" />
        ) : (
          <span className="w-[11px] flex-shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)]">
          {dir && <span className="text-stone-600">{dir}</span>}
          <span className="text-stone-300">{name}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-2 font-[family-name:var(--font-mono)] tabular-nums">
          <span className="text-emerald-500">+{file.additions}</span>
          <span className="text-red-500">-{file.deletions}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && fileDiff && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <FileDiffContent rawDiff={fileDiff} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FileDiffContent({ rawDiff }: { rawDiff: string }) {
  const hunks = useMemo(() => {
    const { oldStr, newStr } = parseUnifiedDiff(rawDiff)
    return computeDiffHunks(oldStr, newStr)
  }, [rawDiff])

  if (hunks.length === 0) {
    return (
      <div className="border-t border-stone-800/30 bg-stone-950/50 px-3 py-2 text-xs text-stone-600">
        Binary file or no textual changes
      </div>
    )
  }

  return (
    <div className="border-t border-stone-800/30 bg-stone-950/50">
      <DiffView hunks={hunks} />
    </div>
  )
}
