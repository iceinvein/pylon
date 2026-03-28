import { FolderOpen, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAstBridge } from '../hooks/use-ast-bridge'
import { useAstStore } from '../store/ast-store'

export function AstView() {
  useAstBridge()

  const scope = useAstStore((s) => s.scope)
  const repoGraph = useAstStore((s) => s.repoGraph)
  const analysisStatus = useAstStore((s) => s.analysisStatus)
  const analysisProgress = useAstStore((s) => s.analysisProgress)
  const setScope = useAstStore((s) => s.setScope)

  async function handleBrowse() {
    const path = await window.api.openFolder()
    if (path) {
      setScope(path)
      await window.api.analyzeScope(path)
    }
  }

  async function handleSelectProject(path: string) {
    setScope(path)
    await window.api.analyzeScope(path)
  }

  if (!scope) {
    return <ProjectSelector onBrowse={handleBrowse} onSelectProject={handleSelectProject} />
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base-text text-lg">Codebase Explorer</h2>
          <p className="mt-0.5 text-base-text-muted text-sm">{scope}</p>
        </div>
        <button
          type="button"
          onClick={handleBrowse}
          className="flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-base-text-muted text-sm transition-colors hover:text-base-text"
        >
          <FolderOpen size={14} />
          Change folder
        </button>
      </div>

      <AnalysisStatusBar status={analysisStatus} progress={analysisProgress} />

      {repoGraph && analysisStatus === 'ready' && (
        <div className="rounded-lg border border-base-border bg-base-bg-subtle p-4">
          <p className="text-base-text-muted text-sm">
            <span className="font-medium text-base-text">{repoGraph.files.length}</span> files
            parsed &nbsp;&middot;&nbsp;
            <span className="font-medium text-base-text">{repoGraph.edges.length}</span> import
            edges
          </p>
        </div>
      )}
    </div>
  )
}

function AnalysisStatusBar({ status, progress }: { status: string; progress: string }) {
  if (status === 'idle') return null

  const isLoading = status === 'parsing' || status === 'analyzing'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-base-border bg-base-bg-subtle px-4 py-3">
      {isLoading && <Loader2 size={14} className="animate-spin text-accent-text" />}
      <span className="text-base-text-muted text-sm">
        {progress || (status === 'ready' ? 'Analysis complete' : status)}
      </span>
    </div>
  )
}

function ProjectSelector({
  onBrowse,
  onSelectProject,
}: {
  onBrowse: () => void
  onSelectProject: (path: string) => void
}) {
  const [projects, setProjects] = useState<Array<{ path: string; lastUsed: number }>>([])

  useEffect(() => {
    window.api
      .listProjects()
      .then(setProjects)
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h2 className="font-semibold text-base-text text-xl">Explore Codebase</h2>
        <p className="mt-2 text-base-text-muted text-sm">
          Visualize your code structure, imports, and architecture
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={onBrowse}
          className="flex items-center justify-center gap-2 rounded-lg border border-base-border bg-base-bg px-4 py-3 text-base-text transition-colors hover:bg-base-bg-subtle"
        >
          <FolderOpen size={16} />
          <span className="text-sm">Browse for a folder...</span>
        </button>

        {projects.length > 0 && (
          <>
            <div className="relative flex items-center">
              <div className="flex-1 border-base-border border-t" />
              <span className="mx-3 text-base-text-muted text-xs">Recent projects</span>
              <div className="flex-1 border-base-border border-t" />
            </div>
            <ul className="flex flex-col gap-1">
              {projects.map((p) => (
                <li key={p.path}>
                  <button
                    type="button"
                    onClick={() => onSelectProject(p.path)}
                    className="w-full truncate rounded-lg border border-base-border bg-base-bg px-4 py-2.5 text-left text-base-text-muted text-sm transition-colors hover:bg-base-bg-subtle hover:text-base-text"
                  >
                    {p.path}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
