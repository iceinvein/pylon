import { create } from 'zustand'
import type {
  ArchAnalysis,
  AstAnalysisFreshness,
  AstChatMessage,
  AstNode,
  AstOverlay,
  CodeEntity,
  FileNode,
  ImpactIndex,
  ImpactSummary,
  RepoGraph,
} from '../../../shared/types'

type AnalysisStatus = 'idle' | 'parsing' | 'analyzing' | 'ready' | 'error'

type AstStore = {
  scope: string
  repoGraph: RepoGraph | null
  archAnalysis: ArchAnalysis | null
  fileAst: AstNode[] | null
  selectedFile: string | null // file shown in CodePanel (right pane)
  selectedEntity: CodeEntity | null
  drilledFile: string | null // file drilled into AST tree (replaces repo map in left pane)
  selectedNode: string | null
  impactIndex: ImpactIndex | null
  impactSummary: ImpactSummary | null
  impactLoading: boolean
  impactError: string | null
  analysisFreshness: AstAnalysisFreshness | null
  entitySearchResults: CodeEntity[]
  hoveredNode: string | null
  activeOverlays: Set<AstOverlay>
  chatMessages: AstChatMessage[]
  analysisStatus: AnalysisStatus
  analysisProgress: string
  explainText: string | null
  explainLoading: boolean
  explainRequestId: string | null
  chatLoading: boolean
  zoom: number
  panX: number
  panY: number
  expandedClusters: Set<string>
  focusedNode: string | null
  searchQuery: string
  searchMatches: string[]

  setScope: (scope: string) => void
  setRepoGraph: (graph: RepoGraph) => void
  setArchAnalysis: (analysis: ArchAnalysis) => void
  setFileAst: (nodes: AstNode[] | null) => void
  selectFile: (filePath: string | null) => void
  setSelectedEntity: (entity: CodeEntity | null) => void
  setImpactIndex: (index: ImpactIndex | null) => void
  setImpact: (summary: ImpactSummary | null) => void
  setImpactLoading: (loading: boolean) => void
  setImpactError: (error: string | null) => void
  setAnalysisFreshness: (freshness: AstAnalysisFreshness | null) => void
  setEntitySearchResults: (results: CodeEntity[]) => void
  drillFile: (filePath: string | null) => void
  selectNode: (nodeId: string | null) => void
  setHoveredNode: (nodeId: string | null) => void
  toggleOverlay: (overlay: AstOverlay) => void
  addChatMessage: (message: AstChatMessage) => void
  setAnalysisStatus: (status: AnalysisStatus, progress?: string) => void
  setExplain: (text: string | null, loading: boolean, requestId?: string | null) => void
  setChatLoading: (loading: boolean) => void
  setZoom: (zoom: number) => void
  setPan: (panX: number, panY: number) => void
  toggleCluster: (clusterId: string) => void
  setFocusedNode: (nodeId: string | null) => void
  setSearchQuery: (query: string) => void
  reset: () => void
}

const initialState = {
  scope: '',
  repoGraph: null,
  archAnalysis: null,
  fileAst: null,
  selectedFile: null,
  selectedEntity: null as CodeEntity | null,
  drilledFile: null,
  selectedNode: null,
  impactIndex: null as ImpactIndex | null,
  impactSummary: null as ImpactSummary | null,
  impactLoading: false,
  impactError: null as string | null,
  analysisFreshness: null as AstAnalysisFreshness | null,
  entitySearchResults: [] as CodeEntity[],
  hoveredNode: null,
  activeOverlays: new Set<AstOverlay>(),
  chatMessages: [],
  analysisStatus: 'idle' as AnalysisStatus,
  analysisProgress: '',
  explainText: null,
  explainLoading: false,
  explainRequestId: null as string | null,
  chatLoading: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  expandedClusters: new Set<string>(),
  focusedNode: null as string | null,
  searchQuery: '',
  searchMatches: [] as string[],
}

function nodeMatchesQuery(node: AstNode, lowerQuery: string): boolean {
  if (node.name.toLowerCase().includes(lowerQuery)) return true
  return node.children.some((child) => nodeMatchesQuery(child, lowerQuery))
}

function getSearchMatches(graph: RepoGraph | null, query: string): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed || !graph) return []

  return graph.files
    .filter((file: FileNode) => {
      const normalizedPath = file.filePath.replace(/\\/g, '/').toLowerCase()
      const name = normalizedPath.split('/').pop() ?? normalizedPath
      return (
        normalizedPath.includes(trimmed) ||
        name.includes(trimmed) ||
        file.declarations.some((node) => nodeMatchesQuery(node, trimmed))
      )
    })
    .map((file) => file.filePath)
}

function isSameCodeEntity(a: CodeEntity | null, b: CodeEntity | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind || a.filePath !== b.filePath) return false
  if (a.kind === 'file' || b.kind === 'file') return true
  return a.symbolId === b.symbolId
}

function selectionState(entity: CodeEntity | null) {
  return {
    selectedEntity: entity,
    selectedFile: entity?.filePath ?? null,
    selectedNode: entity?.kind === 'symbol' ? entity.symbolId : null,
  }
}

function clearSelectionScopedState() {
  return {
    impactSummary: null,
    impactLoading: false,
    impactError: null,
    explainText: null,
    explainLoading: false,
    explainRequestId: null,
  }
}

export const useAstStore = create<AstStore>((set) => ({
  ...initialState,

  setScope: (scope) => set({ scope }),

  setRepoGraph: (repoGraph) =>
    set((s) => ({
      repoGraph,
      searchMatches: getSearchMatches(repoGraph, s.searchQuery),
    })),

  setArchAnalysis: (archAnalysis) => set({ archAnalysis }),

  setFileAst: (fileAst) => set({ fileAst }),

  selectFile: (selectedFile) =>
    set((s) => {
      const selectedEntity = selectedFile ? { kind: 'file' as const, filePath: selectedFile } : null
      return {
        ...selectionState(selectedEntity),
        ...(isSameCodeEntity(s.selectedEntity, selectedEntity) ? {} : clearSelectionScopedState()),
      }
    }),

  setSelectedEntity: (selectedEntity) =>
    set((s) => {
      return {
        ...selectionState(selectedEntity),
        ...(isSameCodeEntity(s.selectedEntity, selectedEntity) ? {} : clearSelectionScopedState()),
      }
    }),

  setImpactIndex: (impactIndex) => set({ impactIndex }),

  setImpact: (impactSummary) =>
    set({
      impactSummary,
      impactLoading: false,
      impactError: null,
    }),

  setImpactLoading: (impactLoading) =>
    set(impactLoading ? { impactLoading, impactError: null } : { impactLoading }),

  setImpactError: (impactError) =>
    set({
      impactError,
      impactLoading: false,
    }),

  setAnalysisFreshness: (analysisFreshness) => set({ analysisFreshness }),

  setEntitySearchResults: (entitySearchResults) => set({ entitySearchResults }),

  drillFile: (drilledFile) =>
    set((s) => {
      const selectedEntity = drilledFile ? { kind: 'file' as const, filePath: drilledFile } : null
      return {
        drilledFile,
        ...selectionState(selectedEntity),
        ...(isSameCodeEntity(s.selectedEntity, selectedEntity) ? {} : clearSelectionScopedState()),
      }
    }),

  selectNode: (selectedNode) => set({ selectedNode }),

  setHoveredNode: (hoveredNode) => set({ hoveredNode }),

  toggleOverlay: (overlay) =>
    set((s) => {
      const next = new Set(s.activeOverlays)
      if (next.has(overlay)) next.delete(overlay)
      else next.add(overlay)
      return { activeOverlays: next }
    }),

  addChatMessage: (message) => set((s) => ({ chatMessages: [...s.chatMessages, message] })),

  setAnalysisStatus: (analysisStatus, progress) =>
    set((s) => ({
      analysisStatus,
      analysisProgress: progress ?? s.analysisProgress,
    })),

  setExplain: (explainText, explainLoading, explainRequestId) =>
    set((s) => ({
      explainText,
      explainLoading,
      explainRequestId: explainRequestId === undefined ? s.explainRequestId : explainRequestId,
    })),

  setChatLoading: (chatLoading) => set({ chatLoading }),

  setZoom: (zoom) => set({ zoom }),

  setPan: (panX, panY) => set({ panX, panY }),

  toggleCluster: (clusterId) =>
    set((s) => {
      const next = new Set(s.expandedClusters)
      if (next.has(clusterId)) next.delete(clusterId)
      else next.add(clusterId)
      return { expandedClusters: next }
    }),

  setFocusedNode: (focusedNode) => set({ focusedNode }),

  setSearchQuery: (query) =>
    set((s) => {
      return { searchQuery: query, searchMatches: getSearchMatches(s.repoGraph, query) }
    }),

  reset: () =>
    set({
      ...initialState,
      activeOverlays: new Set<AstOverlay>(),
      expandedClusters: new Set<string>(),
    }),
}))
