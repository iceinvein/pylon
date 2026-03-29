import { GitBranch, RefreshCw, Workflow } from 'lucide-react'
import type { AstOverlay, RepoGraph } from '../../../../shared/types'
import { useAstStore } from '../../store/ast-store'

type AstToolbarProps = {
  scope: string
  repoGraph: RepoGraph | null
  analysisStatus: string
  onReanalyze: () => void
}

const OVERLAYS: Array<{ id: AstOverlay; label: string; icon: typeof GitBranch }> = [
  { id: 'deps', label: 'Dependencies', icon: GitBranch },
  { id: 'calls', label: 'Calls', icon: Workflow },
  { id: 'dataflow', label: 'Data Flow', icon: Workflow },
]

function scopeBreadcrumb(scope: string): string {
  const parts = scope.split('/')
  return parts.slice(-2).join('/')
}

export function AstToolbar({ scope, repoGraph, analysisStatus, onReanalyze }: AstToolbarProps) {
  const activeOverlays = useAstStore((s) => s.activeOverlays)
  const toggleOverlay = useAstStore((s) => s.toggleOverlay)

  const isAnalyzing = analysisStatus === 'parsing' || analysisStatus === 'analyzing'

  return (
    <div className="flex items-center gap-3 border-base-border border-b px-4 py-2">
      {/* Scope breadcrumb */}
      <span className="font-mono text-base-text-muted text-xs" title={scope}>
        {scopeBreadcrumb(scope)}
      </span>

      <div className="h-4 w-px bg-base-border" />

      {/* Overlay toggles */}
      {OVERLAYS.map(({ id, label, icon: Icon }) => {
        const isActive = activeOverlays.has(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggleOverlay(id)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              isActive
                ? 'bg-accent/15 text-accent-text'
                : 'text-base-text-muted hover:text-base-text'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        )
      })}

      <div className="flex-1" />

      {/* File count */}
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
