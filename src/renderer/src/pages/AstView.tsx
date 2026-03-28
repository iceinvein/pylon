import { FolderOpen, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AstSplitPanel } from '../components/ast/AstSplitPanel'
import { AstToolbar } from '../components/ast/AstToolbar'
import { CodePanel } from '../components/ast/CodePanel'
import { FileAstView } from '../components/ast/FileAstView'
import { RepoMapView } from '../components/ast/RepoMapView'
import { useAstBridge } from '../hooks/use-ast-bridge'
import { useAstStore } from '../store/ast-store'

export function AstView() {
  useAstBridge()

  const scope = useAstStore((s) => s.scope)
  const repoGraph = useAstStore((s) => s.repoGraph)
  const archAnalysis = useAstStore((s) => s.archAnalysis)
  const fileAst = useAstStore((s) => s.fileAst)
  const selectedFile = useAstStore((s) => s.selectedFile)
  const selectedNode = useAstStore((s) => s.selectedNode)
  const analysisStatus = useAstStore((s) => s.analysisStatus)
  const analysisProgress = useAstStore((s) => s.analysisProgress)
  const setScope = useAstStore((s) => s.setScope)
  const setFileAst = useAstStore((s) => s.setFileAst)

  // When selectedFile changes, request file AST
  useEffect(() => {
    if (!selectedFile) {
      setFileAst(null)
      return
    }

    let cancelled = false
    window.api
      .getFileAst(selectedFile)
      .then((nodes) => {
        if (!cancelled) setFileAst(nodes)
      })
      .catch(() => {
        if (!cancelled) setFileAst(null)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFile, setFileAst])

  const handleBrowse = useCallback(async () => {
    const path = await window.api.openFolder()
    if (path) {
      setScope(path)
      await window.api.analyzeScope(path)
    }
  }, [setScope])

  const handleSelectProject = useCallback(
    async (path: string) => {
      setScope(path)
      await window.api.analyzeScope(path)
    },
    [setScope],
  )

  const handleReanalyze = useCallback(async () => {
    if (scope) {
      await window.api.analyzeScope(scope)
    }
  }, [scope])

  if (!scope) {
    return <ProjectSelector onBrowse={handleBrowse} onSelectProject={handleSelectProject} />
  }

  const isLoading = analysisStatus === 'parsing' || analysisStatus === 'analyzing'

  // Derive filename from selectedFile
  const fileName = selectedFile ? (selectedFile.split('/').pop() ?? selectedFile) : ''

  return (
    <div className="flex h-full flex-col">
      <AstToolbar
        scope={scope}
        repoGraph={repoGraph}
        analysisStatus={analysisStatus}
        onReanalyze={handleReanalyze}
      />

      {isLoading && (
        <div className="flex items-center gap-2 border-base-border border-b px-4 py-2">
          <Loader2 size={14} className="animate-spin text-accent-text" />
          <span className="text-base-text-muted text-sm">{analysisProgress || 'Analyzing...'}</span>
        </div>
      )}

      {repoGraph && analysisStatus === 'ready' && (
        <div className="min-h-0 flex-1">
          <AstSplitPanel
            left={
              selectedFile && fileAst ? (
                <FileAstView fileAst={fileAst} fileName={fileName} />
              ) : (
                <RepoMapView repoGraph={repoGraph} archAnalysis={archAnalysis} />
              )
            }
            right={
              <CodePanel
                selectedFile={selectedFile}
                fileAst={fileAst}
                selectedNodeId={selectedNode}
              />
            }
          />
        </div>
      )}

      {analysisStatus === 'error' && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-error text-sm">Analysis failed. Try re-analyzing.</p>
        </div>
      )}

      {analysisStatus === 'idle' && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-base-text-muted text-sm">Select a folder to begin analysis.</p>
        </div>
      )}
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
