import { useState, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  FilePlus,
  FileMinus,
  FileSymlink,
  FileQuestion,
} from 'lucide-react'
import { useSessionStore } from '../store/session-store'
import { useTabStore } from '../store/tab-store'
import { computeDiffHunks, parseUnifiedDiff } from '../lib/diff-utils'
import { DiffView } from './DiffView'

type FileDiffData = {
  filePath: string
  status: string
  diff: string
}

const statusIcons: Record<string, typeof FileText> = {
  added: FilePlus,
  deleted: FileMinus,
  renamed: FileSymlink,
  modified: FileText,
  untracked: FileQuestion,
}

const statusColors: Record<string, string> = {
  added: 'text-emerald-400',
  deleted: 'text-red-400',
  renamed: 'text-blue-400',
  modified: 'text-yellow-400',
  untracked: 'text-purple-400',
}

const statusLabels: Record<string, string> = {
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  modified: 'M',
  untracked: 'U',
}

/* ── Detail view: full diff for a single file ── */

type FileDiffViewProps = {
  filePath: string
  sessionCwd: string
  sessionId: string
  status: string
  onBack: () => void
}

function FileDiffView({ filePath, sessionCwd, sessionId, status, onBack }: FileDiffViewProps) {
  const cached = useSessionStore((s) => s.diffCache.get(sessionId)?.get(filePath))
  const setCachedDiff = useSessionStore((s) => s.setCachedDiff)
  const [diffData, setDiffData] = useState<FileDiffData | null>(cached ?? null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  const relativePath = filePath.startsWith(sessionCwd)
    ? filePath.slice(sessionCwd.length + 1)
    : filePath

  const fetchDiff = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await window.api.getFileDiffs(sessionId, [filePath])
      const result = results.length > 0 ? results[0] : null
      setDiffData(result)
      if (result) {
        setCachedDiff(sessionId, result)
      }
    } catch (err) {
      console.error('Failed to fetch diff:', err)
      setError('Failed to load diff')
    } finally {
      setLoading(false)
    }
  }, [sessionId, filePath, setCachedDiff])

  // Fetch on mount only if not cached
  useState(() => { if (!cached) fetchDiff() })

  const hunks = useMemo(() => {
    if (!diffData?.diff) return []
    const { oldStr, newStr } = parseUnifiedDiff(diffData.diff)
    return computeDiffHunks(oldStr, newStr)
  }, [diffData])

  const Icon = statusIcons[status] ?? FileText
  const iconColor = statusColors[status] ?? 'text-stone-500'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with back + filename + refresh */}
      <div className="flex items-center gap-2 border-b border-stone-800 px-2 py-2">
        <button
          onClick={onBack}
          className="flex-shrink-0 rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
          title="Back to file list"
        >
          <ArrowLeft size={14} />
        </button>
        <Icon size={13} className={`flex-shrink-0 ${iconColor}`} />
        <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-xs text-stone-300">
          {relativePath}
        </span>
        <button
          onClick={fetchDiff}
          className="flex-shrink-0 rounded p-1 text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-400"
          title="Refresh diff"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto">
        {loading && !diffData ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={16} className="animate-spin text-stone-600" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-xs text-red-400">{error}</div>
        ) : (
          <DiffView hunks={hunks} />
        )}
      </div>
    </div>
  )
}

/* ── File list row ── */

type FileRowProps = {
  filePath: string
  sessionCwd: string
  status: string
  onSelect: () => void
}

function FileRow({ filePath, sessionCwd, status, onSelect }: FileRowProps) {
  const relativePath = filePath.startsWith(sessionCwd)
    ? filePath.slice(sessionCwd.length + 1)
    : filePath

  // Show directory in muted text, filename in normal
  const lastSlash = relativePath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : ''
  const name = lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath

  const Icon = statusIcons[status] ?? FileText
  const iconColor = statusColors[status] ?? 'text-stone-500'
  const label = statusLabels[status] ?? '?'
  const labelColor = statusColors[status] ?? 'text-stone-500'

  return (
    <button
      onClick={onSelect}
      className="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-stone-800/60"
    >
      <Icon size={13} className={`flex-shrink-0 ${iconColor}`} />
      <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-xs">
        {dir && <span className="text-stone-600">{dir}</span>}
        <span className="text-stone-300">{name}</span>
      </span>
      <span className={`flex-shrink-0 font-[family-name:var(--font-mono)] text-[10px] font-semibold ${labelColor}`}>
        {label}
      </span>
    </button>
  )
}

/* ── Main panel with list ↔ detail navigation ── */

const emptyChangedFiles: string[] = []

export function ChangesPanel() {
  const { tabs, activeTabId } = useTabStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const sessionId = activeTab?.sessionId ?? null

  const changedFilesRaw = useSessionStore((s) =>
    sessionId ? s.changedFiles.get(sessionId) : undefined
  )
  const changedFiles = changedFilesRaw ?? emptyChangedFiles

  const session = useSessionStore((s) =>
    sessionId ? s.sessions.get(sessionId) : undefined
  )

  const sessionCwd = session?.cwd ?? activeTab?.cwd ?? ''

  // Navigation state: null = file list, string = viewing diff for that file
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // File statuses fetched from git
  const [fileStatuses, setFileStatuses] = useState<Map<string, string>>(new Map())

  // Fetch statuses when the file list changes
  useEffect(() => {
    if (!sessionId || changedFiles.length === 0) return

    let cancelled = false
    window.api.getFileStatuses(sessionId, changedFiles).then((results) => {
      if (cancelled) return
      const map = new Map<string, string>()
      for (const { filePath, status } of results) {
        map.set(filePath, status)
      }
      setFileStatuses(map)
    }).catch(console.error)

    return () => { cancelled = true }
  }, [sessionId, changedFiles])

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-stone-600">No active session</p>
      </div>
    )
  }

  if (changedFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <FileText size={20} className="mb-2 text-stone-700" />
        <p className="text-xs text-stone-600">No files changed yet</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {selectedFile ? (
          <motion.div
            key="diff"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="flex h-full flex-col"
          >
            <FileDiffView
              filePath={selectedFile}
              sessionCwd={sessionCwd}
              sessionId={sessionId}
              status={fileStatuses.get(selectedFile) ?? 'modified'}
              onBack={() => setSelectedFile(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="flex h-full flex-col"
          >
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {changedFiles.map((filePath) => (
                <FileRow
                  key={filePath}
                  filePath={filePath}
                  sessionCwd={sessionCwd}
                  status={fileStatuses.get(filePath) ?? 'modified'}
                  onSelect={() => setSelectedFile(filePath)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
