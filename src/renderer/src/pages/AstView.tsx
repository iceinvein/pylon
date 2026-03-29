import { Clock, FolderOpen, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AstChatPanel } from '../components/ast/AstChatPanel'
import { AstSplitPanel } from '../components/ast/AstSplitPanel'
import { AstToolbar } from '../components/ast/AstToolbar'
import { CodePanel } from '../components/ast/CodePanel'
import { FileAstView } from '../components/ast/FileAstView'
import { RepoMapView } from '../components/ast/RepoMapView'
import { useAstBridge } from '../hooks/use-ast-bridge'
import { useAstStore } from '../store/ast-store'

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function getProjectName(projectPath: string): string {
  return projectPath.split('/').pop() ?? projectPath
}

export function AstView() {
  useAstBridge()

  const scope = useAstStore((s) => s.scope)
  const repoGraph = useAstStore((s) => s.repoGraph)
  const archAnalysis = useAstStore((s) => s.archAnalysis)
  const fileAst = useAstStore((s) => s.fileAst)
  const selectedFile = useAstStore((s) => s.selectedFile)
  const drilledFile = useAstStore((s) => s.drilledFile)
  const selectedNode = useAstStore((s) => s.selectedNode)
  const analysisStatus = useAstStore((s) => s.analysisStatus)
  const analysisProgress = useAstStore((s) => s.analysisProgress)
  const setScope = useAstStore((s) => s.setScope)
  const setFileAst = useAstStore((s) => s.setFileAst)

  // When drilledFile changes, request file AST for the tree view
  useEffect(() => {
    if (!drilledFile) {
      setFileAst(null)
      return
    }

    let cancelled = false
    window.api
      .getFileAst(drilledFile)
      .then((nodes) => {
        if (!cancelled) setFileAst(nodes)
      })
      .catch(() => {
        if (!cancelled) setFileAst(null)
      })

    return () => {
      cancelled = true
    }
  }, [drilledFile, setFileAst])

  const setRepoGraph = useAstStore((s) => s.setRepoGraph)
  const setArchAnalysis = useAstStore((s) => s.setArchAnalysis)
  const setAnalysisStatus = useAstStore((s) => s.setAnalysisStatus)

  // Try loading cached analysis for a scope, fall back to full analysis
  const openScope = useCallback(
    async (scopePath: string) => {
      setScope(scopePath)

      // Check for cached analysis first
      const cached = await window.api.getCachedAnalysis(scopePath)
      if (cached) {
        setRepoGraph(cached.repoGraph as import('../../../shared/types').RepoGraph)
        if (cached.archAnalysis) {
          setArchAnalysis(cached.archAnalysis as import('../../../shared/types').ArchAnalysis)
        }
        setAnalysisStatus(
          'ready',
          `Loaded from cache (${new Date(cached.analyzedAt).toLocaleString()})`,
        )
        return
      }

      // No cache — run full analysis
      await window.api.analyzeScope(scopePath)
    },
    [setScope, setRepoGraph, setArchAnalysis, setAnalysisStatus],
  )

  const handleBrowse = useCallback(async () => {
    const path = await window.api.openFolder()
    if (path) await openScope(path)
  }, [openScope])

  const handleSelectProject = useCallback(
    async (path: string) => {
      await openScope(path)
    },
    [openScope],
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

  // Derive filename from drilledFile (for the AST tree view heading)
  const fileName = drilledFile ? (drilledFile.split('/').pop() ?? drilledFile) : ''

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
        <>
          <div className="min-h-0 flex-1">
            <AstSplitPanel
              left={
                drilledFile && fileAst ? (
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
          <AstChatPanel />
        </>
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .listProjects()
      .then((list) => {
        // Sort by most recently used
        const sorted = [...list].sort((a, b) => b.lastUsed - a.lastUsed)
        setProjects(sorted)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
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
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-base-text-muted" />
          </div>
        ) : (
          <>
            {projects.length > 0 && (
              <>
                <span className="text-base-text-muted text-xs">Known projects</span>
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {projects.map((p) => (
                    <li key={p.path}>
                      <button
                        type="button"
                        onClick={() => onSelectProject(p.path)}
                        className="flex w-full items-center gap-3 rounded-lg border border-base-border bg-base-bg px-4 py-2.5 text-left transition-colors hover:bg-base-bg-subtle"
                      >
                        <FolderOpen size={16} className="shrink-0 text-accent-text" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-base-text text-sm">
                            {getProjectName(p.path)}
                          </div>
                          <div className="truncate text-base-text-muted text-xs">{p.path}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-base-text-muted text-xs">
                          <Clock size={10} />
                          {formatTimeAgo(p.lastUsed)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="relative flex items-center">
                  <div className="flex-1 border-base-border border-t" />
                  <span className="mx-3 text-base-text-muted text-xs">or</span>
                  <div className="flex-1 border-base-border border-t" />
                </div>
              </>
            )}
            <button
              type="button"
              onClick={onBrowse}
              className="flex items-center justify-center gap-2 rounded-lg border border-base-border bg-base-bg px-4 py-3 text-base-text transition-colors hover:bg-base-bg-subtle"
            >
              <FolderOpen size={16} />
              <span className="text-sm">Browse for a folder...</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
