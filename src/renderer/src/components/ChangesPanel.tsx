import { useState, useCallback, useMemo, useEffect } from 'react'
import { log } from '../../../shared/logger'
const logger = log.child('changes-panel')
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowLeft,
  RefreshCw,
  FileText,
  FilePlus,
  FileMinus,
  FileSymlink,
  FileQuestion,
  GitMerge,
  Trash2,
  AlertTriangle,
  Check,
  Loader2,
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
      logger.error('Failed to fetch diff:', err)
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
    }).catch((err) => logger.error('Failed to fetch file statuses:', err))

    return () => { cancelled = true }
  }, [sessionId, changedFiles])

  // Worktree state
  const [worktreeInfo, setWorktreeInfo] = useState<{
    worktreePath: string | null
    worktreeBranch: string | null
    originalBranch: string | null
  } | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mergeError, setMergeError] = useState<{ message: string; files?: string[] } | null>(null)
  const [mergeSuccess, setMergeSuccess] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [discardLoading, setDiscardLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    window.api.getWorktreeInfo(sessionId).then(setWorktreeInfo).catch((err) => logger.error('Failed to get worktree info:', err))
  }, [sessionId])

  const handleMergeCleanup = useCallback(async () => {
    if (!sessionId) return
    setMergeLoading(true)
    setMergeError(null)
    try {
      const result = await window.api.mergeWorktree(sessionId)
      if (result.success) {
        setMergeSuccess(true)
        setWorktreeInfo(null)
      } else {
        const messages: Record<string, string> = {
          conflicts: 'Merge conflicts detected. Resolve them manually in your terminal.',
          'not-a-worktree': 'This session is not using a worktree.',
          'branch-not-found': 'The original branch could not be found.',
          'uncommitted-changes': 'Uncommitted changes in worktree. Ask Claude to commit first.',
        }
        setMergeError({
          message: messages[result.error ?? ''] ?? result.error ?? 'Merge failed',
          files: result.conflictFiles,
        })
      }
    } catch {
      setMergeError({ message: 'Unexpected error during merge' })
    } finally {
      setMergeLoading(false)
    }
  }, [sessionId])

  const handleDiscardCleanup = useCallback(async () => {
    if (!sessionId) return
    setDiscardLoading(true)
    try {
      await window.api.discardWorktree(sessionId)
      setWorktreeInfo(null)
      setShowDiscardConfirm(false)
    } catch {
      logger.error('Failed to discard worktree')
    } finally {
      setDiscardLoading(false)
    }
  }, [sessionId])

  const isWorktreeSession = worktreeInfo?.worktreePath != null

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

            {/* Worktree actions */}
            {isWorktreeSession && (
              <div className="border-t border-stone-800 px-3 py-3">
                {mergeSuccess ? (
                  <div className="flex items-center gap-2 rounded bg-emerald-950/40 px-3 py-2 text-xs text-emerald-400">
                    <Check size={14} />
                    <span>Merged into {worktreeInfo?.originalBranch ?? 'original branch'} and cleaned up</span>
                  </div>
                ) : (
                  <>
                    {mergeError && (
                      <div className="mb-2 rounded bg-red-950/40 px-3 py-2">
                        <div className="flex items-start gap-2 text-xs text-red-400">
                          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                          <div>
                            <p>{mergeError.message}</p>
                            {mergeError.files && mergeError.files.length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-red-500/80">
                                {mergeError.files.map((f) => (
                                  <li key={f} className="font-[family-name:var(--font-mono)]">{f}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleMergeCleanup}
                        disabled={mergeLoading || discardLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {mergeLoading ? <Loader2 size={13} className="animate-spin" /> : <GitMerge size={13} />}
                        Merge & Cleanup
                      </button>

                      {showDiscardConfirm ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleDiscardCleanup}
                            disabled={discardLoading}
                            className="rounded bg-red-600 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                          >
                            {discardLoading ? <Loader2 size={11} className="animate-spin" /> : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setShowDiscardConfirm(false)}
                            className="rounded px-2 py-1.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDiscardConfirm(true)}
                          disabled={mergeLoading || discardLoading}
                          className="flex items-center gap-1.5 rounded border border-stone-700 px-3 py-1.5 text-xs text-stone-400 transition-colors hover:border-red-800 hover:bg-red-950/30 hover:text-red-400 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                          Discard
                        </button>
                      )}
                    </div>

                    <p className="mt-1.5 text-[10px] text-stone-600">
                      Merges <span className="text-stone-500">{worktreeInfo?.worktreeBranch}</span> → <span className="text-stone-500">{worktreeInfo?.originalBranch}</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
