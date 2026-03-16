import { GitBranch, Loader2, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { GRAPH_CONSTANTS, getGraphWidth } from '../../lib/git-graph-layout'
import { useGitGraphStore } from '../../store/git-graph-store'
import { CommitDetail } from './CommitDetail'
import { GitGraphCanvas } from './GitGraphCanvas'

type GitGraphTabProps = {
  cwd: string
  sessionId: string | null
}

export function GitGraphTab({ cwd }: GitGraphTabProps) {
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
  const currentBranch = branches.find((b) => b.isCurrent)

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-stone-800 border-b px-3 py-1.5">
        {currentBranch && (
          <span className="flex items-center gap-1.5 text-amber-400 text-xs">
            <GitBranch size={11} />
            <span className="truncate">{currentBranch.name}</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-stone-600">{commits.length} commits</span>
        <button
          type="button"
          onClick={() => {
            fetchGraph(cwd)
            fetchBranches(cwd)
          }}
          className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-300"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Graph + commit list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
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
              className={`absolute right-0 left-0 flex items-center overflow-hidden text-left transition-colors hover:bg-stone-800/50 ${
                selectedCommit === commit.hash ? 'bg-stone-800/70' : ''
              }`}
              style={{
                top: i * GRAPH_CONSTANTS.ROW_HEIGHT,
                height: GRAPH_CONSTANTS.ROW_HEIGHT,
                paddingLeft:
                  GRAPH_CONSTANTS.GRAPH_LEFT_PADDING * 2 + GRAPH_CONSTANTS.COLUMN_WIDTH + 8,
                paddingRight: 8,
              }}
            >
              <span className="min-w-0 flex-1 truncate text-stone-300 text-xs">
                {commit.message}
              </span>
              <span className="ml-2 flex-shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-stone-600">
                {commit.shortHash}
              </span>
              {commit.refs.length > 0 && (
                <div className="ml-1.5 flex flex-shrink-0 gap-1">
                  {commit.refs.slice(0, 2).map((ref) => (
                    <span
                      key={ref.name}
                      className={`whitespace-nowrap rounded px-1 py-0.5 text-[9px] ${
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

      {/* Inline commit detail — slides up from bottom */}
      <AnimatePresence>
        {selectedCommitData && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <CommitDetail commit={selectedCommitData} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
