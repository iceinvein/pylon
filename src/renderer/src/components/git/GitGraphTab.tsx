import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { GRAPH_CONSTANTS, getGraphWidth } from '../../lib/git-graph-layout'
import { useGitGraphStore } from '../../store/git-graph-store'
import { BranchList } from './BranchList'
import { CommitDetail } from './CommitDetail'
import { GitGraphCanvas } from './GitGraphCanvas'

type GitGraphTabProps = {
  cwd: string
  sessionId: string | null
}

export function GitGraphTab({ cwd, sessionId }: GitGraphTabProps) {
  const {
    commits,
    branches,
    loading,
    error,
    selectedCommit,
    hasMore,
    fetchGraph,
    fetchBranches,
    selectCommit,
  } = useGitGraphStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cwd) {
      fetchGraph(cwd)
      fetchBranches(cwd)
    }
  }, [cwd, fetchGraph, fetchBranches])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || loading || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      const lastHash = commits[commits.length - 1]?.hash
      if (lastHash) fetchGraph(cwd, lastHash)
    }
  }, [commits, cwd, fetchGraph, hasMore, loading])

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!confirm(`Checkout branch "${branch}"?`)) return
      await window.api.gitGraphCheckout(cwd, branch)
    },
    [cwd],
  )

  const handleScrollTo = useCallback(
    (hash: string) => {
      const idx = commits.findIndex((c) => c.hash.startsWith(hash))
      if (idx !== -1 && scrollRef.current) {
        scrollRef.current.scrollTop = idx * GRAPH_CONSTANTS.ROW_HEIGHT - 100
        selectCommit(commits[idx].hash)
      }
    },
    [commits, selectCommit],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId needed for future AI explain
  const handleExplain = useCallback(
    (_hash: string) => {
      // TODO: Route to chat session with explain prompt
    },
    [sessionId],
  )

  const graphWidth = getGraphWidth(commits)
  const selectedCommitData = commits.find((c) => c.hash === selectedCommit)

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <p className="text-red-400 text-xs">{error}</p>
        <button
          type="button"
          onClick={() => fetchGraph(cwd)}
          className="rounded bg-stone-800 px-3 py-1 text-stone-300 text-xs hover:bg-stone-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <BranchList branches={branches} onCheckout={handleCheckout} onScrollTo={handleScrollTo} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
          <span className="text-stone-400 text-xs">{commits.length} commits</span>
          <button
            type="button"
            onClick={() => {
              fetchGraph(cwd)
              fetchBranches(cwd)
            }}
            className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-300"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Graph + commit list */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          <div className="relative" style={{ height: commits.length * GRAPH_CONSTANTS.ROW_HEIGHT }}>
            {/* Canvas graph lines */}
            <div className="absolute top-0 left-0" style={{ width: graphWidth }}>
              <GitGraphCanvas commits={commits} />
            </div>

            {/* Commit rows (DOM overlay) */}
            {commits.map((commit, i) => (
              <button
                key={commit.hash}
                type="button"
                onClick={() => selectCommit(selectedCommit === commit.hash ? null : commit.hash)}
                className={`absolute flex w-full items-center text-left transition-colors hover:bg-stone-800/50 ${
                  selectedCommit === commit.hash ? 'bg-stone-800/70' : ''
                }`}
                style={{
                  top: i * GRAPH_CONSTANTS.ROW_HEIGHT,
                  height: GRAPH_CONSTANTS.ROW_HEIGHT,
                  paddingLeft: graphWidth + 8,
                }}
              >
                <span className="min-w-0 flex-1 truncate text-stone-300 text-xs">
                  {commit.message}
                </span>
                <span className="flex-shrink-0 px-2 font-[family-name:var(--font-mono)] text-[10px] text-stone-600">
                  {commit.shortHash}
                </span>
                {commit.refs.length > 0 && (
                  <div className="flex flex-shrink-0 gap-1 pr-2">
                    {commit.refs.slice(0, 2).map((ref) => (
                      <span
                        key={ref.name}
                        className={`rounded px-1 py-0.5 text-[9px] ${
                          ref.isCurrent
                            ? 'bg-amber-950/50 text-amber-400'
                            : 'bg-stone-800 text-stone-500'
                        }`}
                      >
                        {ref.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 size={14} className="animate-spin text-stone-600" />
            </div>
          )}
        </div>

        {/* Selected commit detail */}
        {selectedCommitData && (
          <CommitDetail
            commit={selectedCommitData}
            onClose={() => selectCommit(null)}
            onExplain={handleExplain}
          />
        )}
      </div>
    </div>
  )
}
