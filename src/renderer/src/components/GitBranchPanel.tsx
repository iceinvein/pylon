import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type {
  GitBranchStatus,
  GitFetchCompareCommit,
  GitFetchComparison,
  GitPullResult,
} from '../../../shared/types'
import { useSessionStore } from '../store/session-store'

type GitBranchPanelProps = {
  cwd: string
  branchStatus: GitBranchStatus
  onClose: () => void
}

type CommitSectionProps = {
  label: string
  icon: React.ReactNode
  commits: GitFetchCompareCommit[]
  colorClass: string
  defaultOpen?: boolean
  footer?: React.ReactNode
}

function CommitSection({
  label,
  icon,
  commits,
  colorClass,
  defaultOpen,
  footer,
}: CommitSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? true)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-stone-800/60"
      >
        {open ? (
          <ChevronDown size={12} className="flex-shrink-0 text-stone-500" />
        ) : (
          <ChevronRight size={12} className="flex-shrink-0 text-stone-500" />
        )}
        <span className={`flex-shrink-0 ${colorClass}`}>{icon}</span>
        <span className="font-medium text-stone-300">{label}</span>
        <span className="text-stone-600">{commits.length}</span>
      </button>
      {open && (
        <div className="ml-3 border-stone-800/60 border-l pl-2">
          {commits.map((commit) => (
            <div
              key={commit.hash}
              className="flex items-start gap-2 rounded px-1.5 py-[3px] text-xs transition-colors hover:bg-stone-800/40"
            >
              <span className="flex-shrink-0 font-mono text-stone-600">
                {commit.hash.slice(0, 7)}
              </span>
              <span className="text-stone-400">{commit.message}</span>
            </div>
          ))}
          {footer}
        </div>
      )}
    </div>
  )
}

export function GitBranchPanel({ cwd, branchStatus, onClose }: GitBranchPanelProps) {
  const [comparison, setComparison] = useState<GitFetchComparison | null>(null)
  const [fetching, setFetching] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullResult, setPullResult] = useState<GitPullResult | null>(null)
  const setBranchStatus = useSessionStore((s) => s.setBranchStatus)

  // Fetch on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes branchStatus to avoid infinite re-fetch loop
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
  }, [cwd, setBranchStatus])

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

  const upstreamName = branchStatus.hasUpstream ? `origin/${branchStatus.branch}` : null

  return (
    <div className="flex h-full flex-col bg-[var(--color-base-bg)]">
      {/* Header — branch name + metadata summary */}
      <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={13} className="flex-shrink-0 text-stone-500" />
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="truncate font-semibold text-stone-200">{branchStatus.branch}</span>
            {fetching ? (
              <Loader2 size={10} className="flex-shrink-0 animate-spin text-stone-600" />
            ) : (
              <>
                {behind > 0 && (
                  <span className="flex-shrink-0 text-amber-400/80" title={`${behind} behind`}>
                    {behind}↓
                  </span>
                )}
                {ahead > 0 && (
                  <span className="flex-shrink-0 text-blue-400/80" title={`${ahead} ahead`}>
                    {ahead}↑
                  </span>
                )}
                {ahead === 0 && behind === 0 && branchStatus.hasUpstream && (
                  <span className="flex-shrink-0 text-green-500/70">✓</span>
                )}
              </>
            )}
            {upstreamName && (
              <>
                <span className="flex-shrink-0 text-stone-600">⇄</span>
                <span className="truncate text-stone-500">{upstreamName}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 rounded p-0.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-300"
          title="Close branch panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body — collapsible sections */}
      <div className="flex-1 space-y-1 overflow-y-auto px-1.5 py-2">
        {fetching ? (
          <div className="flex items-center gap-2 px-2 py-2 text-stone-500 text-xs">
            <Loader2 size={12} className="animate-spin" />
            Fetching from origin…
          </div>
        ) : (
          <>
            {!branchStatus.hasUpstream && (
              <div className="px-2 py-1 text-stone-500 text-xs">No upstream configured</div>
            )}

            {/* Incoming (behind) commits */}
            {comparison && comparison.behindCommits.length > 0 && (
              <CommitSection
                label="Incoming"
                icon={<ArrowDownToLine size={12} />}
                commits={comparison.behindCommits}
                colorClass="text-amber-400"
                footer={
                  <>
                    {comparison.filesChanged > 0 && (
                      <div className="px-1.5 py-1 text-[10px] text-stone-600">
                        {comparison.filesChanged} file{comparison.filesChanged !== 1 ? 's' : ''}{' '}
                        changed
                      </div>
                    )}
                    {!pullResult?.success && (
                      <div className="px-1.5 pt-1 pb-1.5">
                        <button
                          type="button"
                          onClick={handlePull}
                          disabled={pulling}
                          className="flex w-full items-center justify-center gap-1.5 rounded bg-stone-800 px-2 py-1 text-stone-300 text-xs transition-colors hover:bg-stone-700 disabled:opacity-50"
                        >
                          {pulling ? (
                            <>
                              <Loader2 size={11} className="animate-spin" />
                              Pulling…
                            </>
                          ) : (
                            <>
                              <ArrowDownToLine size={11} />
                              Pull {behind} commit{behind !== 1 ? 's' : ''}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                }
              />
            )}

            {/* Outgoing (ahead) commits */}
            {comparison && comparison.aheadCommits.length > 0 && (
              <CommitSection
                label="Outgoing"
                icon={<ArrowUpFromLine size={12} />}
                commits={comparison.aheadCommits}
                colorClass="text-blue-400"
              />
            )}

            {/* Up to date */}
            {ahead === 0 && behind === 0 && branchStatus.hasUpstream && (
              <div className="px-2 py-1 text-green-500/70 text-xs">✓ Up to date with origin</div>
            )}

            {/* Pull result toast */}
            {pullResult && (
              <div
                className={`mx-1.5 mt-1 rounded px-2 py-1.5 text-xs ${
                  pullResult.success
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                {pullResult.success ? 'Pulled successfully' : pullResult.error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
