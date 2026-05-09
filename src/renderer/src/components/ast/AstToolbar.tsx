import { Boxes, ChevronDown, GitBranch, RefreshCw, Search, Workflow, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { ArchAnalysis, AstOverlay, RepoGraph } from '../../../../shared/types'
import { useAstStore } from '../../store/ast-store'
import { ProjectsPopover } from '../ProjectsPopover'

type AstToolbarProps = {
  scope: string
  repoGraph: RepoGraph | null
  archAnalysis: ArchAnalysis | null
  analysisStatus: string
  onReanalyze: () => void
  onSwitchProject: (path: string) => void
  onBrowse: () => void
}

const OVERLAYS: Array<{ id: AstOverlay; label: string; icon: typeof GitBranch }> = [
  { id: 'groups', label: 'Groups', icon: Boxes },
  { id: 'deps', label: 'Dependencies', icon: GitBranch },
  { id: 'calls', label: 'Calls', icon: Workflow },
  { id: 'dataflow', label: 'Data Flow', icon: Workflow },
]

function scopeBreadcrumb(scope: string): string {
  const parts = scope.split('/')
  return parts.slice(-2).join('/')
}

export function AstToolbar({
  scope,
  repoGraph,
  archAnalysis,
  analysisStatus,
  onReanalyze,
  onSwitchProject,
  onBrowse,
}: AstToolbarProps) {
  const activeOverlays = useAstStore((s) => s.activeOverlays)
  const expandedClusters = useAstStore((s) => s.expandedClusters)
  const toggleOverlay = useAstStore((s) => s.toggleOverlay)
  const searchQuery = useAstStore((s) => s.searchQuery)
  const searchMatches = useAstStore((s) => s.searchMatches)
  const setSearchQuery = useAstStore((s) => s.setSearchQuery)
  const analysisFreshness = useAstStore((s) => s.analysisFreshness)

  const [popoverOpen, setPopoverOpen] = useState(false)
  const scopeBtnRef = useRef<HTMLButtonElement>(null)

  const handleSelectProject = useCallback(
    (path: string) => {
      setPopoverOpen(false)
      onSwitchProject(path)
    },
    [onSwitchProject],
  )

  const handleBrowse = useCallback(() => {
    setPopoverOpen(false)
    onBrowse()
  }, [onBrowse])

  const isAnalyzing = analysisStatus === 'parsing' || analysisStatus === 'analyzing'
  const dataFlowLinkCount =
    archAnalysis?.dataFlows.reduce((sum, flow) => sum + Math.max(flow.steps.length - 1, 0), 0) ?? 0

  const overlayCounts: Record<AstOverlay, number> = {
    groups: expandedClusters.size + (archAnalysis?.clusters.length ?? 0),
    deps: repoGraph?.edges.length ?? 0,
    calls: archAnalysis?.callEdges.length ?? 0,
    dataflow: dataFlowLinkCount,
  }
  const trimmedSearchQuery = searchQuery.trim()
  const showSearchStatus = trimmedSearchQuery.length > 0
  const searchStatus =
    searchMatches.length === 0
      ? 'No matches'
      : `${searchMatches.length} file${searchMatches.length === 1 ? '' : 's'}`

  return (
    <div className="flex items-center gap-3 border-base-border border-b px-4 py-2">
      {/* Scope breadcrumb — clickable to switch project */}
      <button
        ref={scopeBtnRef}
        type="button"
        onClick={() => setPopoverOpen(!popoverOpen)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-base-text-muted text-xs transition-colors hover:bg-base-raised hover:text-base-text"
        title={scope}
      >
        {scopeBreadcrumb(scope)}
        <ChevronDown size={10} />
      </button>

      <ProjectsPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        onSelectProject={handleSelectProject}
        onBrowse={handleBrowse}
        anchorRef={scopeBtnRef}
      />

      <div className="h-4 w-px bg-base-border" />

      {/* Overlay toggles */}
      {OVERLAYS.map(({ id, label, icon: Icon }) => {
        const count = overlayCounts[id]
        const isDisabled = count === 0
        const isActive = activeOverlays.has(id) && !isDisabled
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!isDisabled) toggleOverlay(id)
            }}
            disabled={isDisabled}
            title={isDisabled ? `${label}: no links available` : `${label}: ${count} links`}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              isActive
                ? 'bg-base-raised text-base-text'
                : 'text-base-text-muted hover:text-base-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-base-text-muted'
            }`}
          >
            <Icon size={12} />
            {label}
            <span className="font-mono text-[10px] text-base-text-faint">{count}</span>
          </button>
        )
      })}

      <div className="h-4 w-px bg-base-border" />

      {/* Search files and symbols */}
      <div className="flex min-w-0 items-center gap-1">
        <Search size={12} className="text-base-text-muted" />
        <input
          type="text"
          placeholder="Search files, paths, symbols..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-48 bg-transparent text-base-text text-xs placeholder:text-base-text-muted focus:outline-none"
        />
        {showSearchStatus && (
          <span
            className={`shrink-0 font-mono text-[10px] ${
              searchMatches.length === 0 ? 'text-error' : 'text-base-text-faint'
            }`}
          >
            {searchStatus}
          </span>
        )}
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
            aria-label="Clear search"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div className="flex-1" />

      {analysisFreshness && (
        <span
          className={`text-xs ${analysisFreshness.stale ? 'text-warning' : 'text-base-text-muted'}`}
        >
          Cache {analysisFreshness.stale ? 'stale' : 'fresh'} ·{' '}
          {new Date(analysisFreshness.analyzedAt).toLocaleTimeString()}
        </span>
      )}

      {repoGraph && (
        <span className="text-base-text-muted text-xs">
          {repoGraph.files.length} file{repoGraph.files.length !== 1 ? 's' : ''}
        </span>
      )}

      {/* Re-analyze button */}
      <button
        type="button"
        onClick={onReanalyze}
        disabled={isAnalyzing}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-base-text-muted text-xs transition-colors hover:text-base-text disabled:opacity-50"
      >
        <RefreshCw size={12} className={isAnalyzing ? 'animate-spin' : ''} />
        Re-analyze
      </button>
    </div>
  )
}
