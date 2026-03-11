import { ArrowDownToLine, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitBranchStatus, GitFetchComparison, GitPullResult } from '../../../shared/types'
import { useSessionStore } from '../store/session-store'

type GitBranchPopoverProps = {
  cwd: string
  branchStatus: GitBranchStatus
  onClose: () => void
}

export function GitBranchPopover({ cwd, branchStatus, onClose }: GitBranchPopoverProps) {
  const [comparison, setComparison] = useState<GitFetchComparison | null>(null)
  const [fetching, setFetching] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullResult, setPullResult] = useState<GitPullResult | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const setBranchStatus = useSessionStore((s) => s.setBranchStatus)

  // Fetch on mount
  useEffect(() => {
    setFetching(true)
    window.api
      .fetchAndCompare(cwd)
      .then((result) => {
        setComparison(result)
        setBranchStatus(cwd, {
          ...branchStatus,
          ahead: result.ahead,
          behind: result.behind,
        })
      })
      .catch(() => {
        // Fetch failed — show whatever we had
      })
      .finally(() => setFetching(false))
  }, [cwd, branchStatus, setBranchStatus])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handlePull = useCallback(async () => {
    setPulling(true)
    setPullResult(null)
    try {
      const result = await window.api.pullBranch(cwd)
      setPullResult(result)
      if (result.success) {
        const updated = await window.api.getGitBranchStatus(cwd)
        setBranchStatus(cwd, updated)
        const freshComparison = await window.api.fetchAndCompare(cwd)
        setComparison(freshComparison)
      }
    } catch {
      setPullResult({ success: false, error: 'Pull failed unexpectedly' })
    } finally {
      setPulling(false)
    }
  }, [cwd, setBranchStatus])

  const behind = comparison?.behind ?? branchStatus.behind
  const ahead = comparison?.ahead ?? branchStatus.ahead

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-7 left-2 z-50 w-80 rounded-lg border border-stone-700 bg-stone-900 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-stone-700 border-b px-3 py-2">
        <span className="font-medium text-stone-300 text-xs">{branchStatus.branch}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {fetching ? (
          <div className="flex items-center gap-2 py-2 text-stone-500 text-xs">
            <Loader2 size={12} className="animate-spin" />
            Fetching from origin...
          </div>
        ) : (
          <>
            {/* Ahead/behind summary */}
            <div className="flex items-center gap-3 text-xs">
              {ahead > 0 && <span className="text-blue-400">↑ {ahead} ahead</span>}
              {behind > 0 && <span className="text-amber-400">↓ {behind} behind</span>}
              {ahead === 0 && behind === 0 && branchStatus.hasUpstream && (
                <span className="text-green-400">✓ Up to date</span>
              )}
              {!branchStatus.hasUpstream && (
                <span className="text-stone-500">No upstream configured</span>
              )}
            </div>

            {/* Behind commits */}
            {comparison && comparison.behindCommits.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-[10px] text-stone-600 uppercase tracking-wider">
                  Missing commits
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {comparison.behindCommits.map((commit) => (
                    <div key={commit.hash} className="flex items-start gap-2 py-0.5 text-xs">
                      <span className="flex-shrink-0 font-mono text-stone-600">
                        {commit.hash.slice(0, 7)}
                      </span>
                      <span className="truncate text-stone-400">{commit.message}</span>
                    </div>
                  ))}
                </div>
                {comparison.filesChanged > 0 && (
                  <div className="mt-1 text-[10px] text-stone-600">
                    {comparison.filesChanged} file{comparison.filesChanged !== 1 ? 's' : ''} changed
                  </div>
                )}
              </div>
            )}

            {/* Pull result */}
            {pullResult && (
              <div
                className={`mt-2 rounded px-2 py-1 text-xs ${
                  pullResult.success
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                {pullResult.success ? 'Pulled successfully' : pullResult.error}
              </div>
            )}

            {/* Pull button */}
            {behind > 0 && !pullResult?.success && (
              <button
                type="button"
                onClick={handlePull}
                disabled={pulling}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-stone-800 px-3 py-1.5 text-stone-300 text-xs transition-colors hover:bg-stone-700 disabled:opacity-50"
              >
                {pulling ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Pulling...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine size={12} />
                    Pull {behind} commit{behind !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
