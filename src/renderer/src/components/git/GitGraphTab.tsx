import { GitBranch, Loader2, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { GRAPH_CONSTANTS, getGraphWidth, getNodeWidth } from '../../lib/git-graph-layout'
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
  const nodeWidth = getNodeWidth(commits)
  const selectedCommitData = commits.find((c) => c.hash === selectedCommit)

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <p className="text-error text-xs">{error}</p>
        <button
          type="button"
          onClick={() => fetchGraph(cwd)}
          className="rounded bg-base-raised px-3 py-1 text-base-text text-xs hover:bg-base-border"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-base-border-subtle border-b px-3 py-1.5">
        {currentBranch && (
          <span className="flex items-center gap-1.5 text-warning text-xs">
            <GitBranch size={11} />
            <span className="truncate">{currentBranch.name}</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-base-text-faint">{commits.length} commits</span>
        <button
          type="button"
          onClick={() => {
            fetchGraph(cwd)
            fetchBranches(cwd)
          }}
          className="rounded p-1 text-base-text-muted hover:bg-base-raised hover:text-base-text"
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
              className={`absolute right-0 left-0 flex items-center overflow-hidden text-left transition-colors hover:bg-base-raised/50 ${
                selectedCommit === commit.hash ? 'bg-base-raised/70' : ''
              }`}
              style={{
                top: i * GRAPH_CONSTANTS.ROW_HEIGHT,
                height: GRAPH_CONSTANTS.ROW_HEIGHT,
                paddingLeft: nodeWidth + GRAPH_CONSTANTS.TEXT_LEFT_PADDING,
                paddingRight: 8,
              }}
            >
              <span className="min-w-0 flex-1 truncate text-base-text text-xs">
                {commit.message}
              </span>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-base-text-faint">
                {commit.shortHash}
              </span>
              {commit.refs.length > 0 && (
                <div className="ml-1.5 flex shrink-0 gap-1">
                  {commit.refs.slice(0, 2).map((ref) => (
                    <span
                      key={ref.name}
                      className={`whitespace-nowrap rounded px-1 py-0.5 text-[9px] ${
                        ref.isCurrent
                          ? 'bg-accent-muted/50 text-warning'
                          : 'bg-base-raised text-base-text-muted'
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
            <Loader2 size={14} className="animate-spin text-base-text-faint" />
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
