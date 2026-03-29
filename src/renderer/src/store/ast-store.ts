import { create } from 'zustand'
import type {
  ArchAnalysis,
  AstChatMessage,
  AstNode,
  AstOverlay,
  RepoGraph,
} from '../../../shared/types'

type AnalysisStatus = 'idle' | 'parsing' | 'analyzing' | 'ready' | 'error'

type AstStore = {
  scope: string
  repoGraph: RepoGraph | null
  archAnalysis: ArchAnalysis | null
  fileAst: AstNode[] | null
  selectedFile: string | null
  selectedNode: string | null
  hoveredNode: string | null
  activeOverlays: Set<AstOverlay>
  chatMessages: AstChatMessage[]
  analysisStatus: AnalysisStatus
  analysisProgress: string
  explainText: string | null
  explainLoading: boolean
  chatLoading: boolean
  zoom: number
  panX: number
  panY: number

  setScope: (scope: string) => void
  setRepoGraph: (graph: RepoGraph) => void
  setArchAnalysis: (analysis: ArchAnalysis) => void
  setFileAst: (nodes: AstNode[] | null) => void
  selectFile: (filePath: string | null) => void
  selectNode: (nodeId: string | null) => void
  setHoveredNode: (nodeId: string | null) => void
  toggleOverlay: (overlay: AstOverlay) => void
  addChatMessage: (message: AstChatMessage) => void
  setAnalysisStatus: (status: AnalysisStatus, progress?: string) => void
  setExplain: (text: string | null, loading: boolean) => void
  setChatLoading: (loading: boolean) => void
  setZoom: (zoom: number) => void
  setPan: (panX: number, panY: number) => void
  reset: () => void
}

const initialState = {
  scope: '',
  repoGraph: null,
  archAnalysis: null,
  fileAst: null,
  selectedFile: null,
  selectedNode: null,
  hoveredNode: null,
  activeOverlays: new Set<AstOverlay>(),
  chatMessages: [],
  analysisStatus: 'idle' as AnalysisStatus,
  analysisProgress: '',
  explainText: null,
  explainLoading: false,
  chatLoading: false,
  zoom: 1,
  panX: 0,
  panY: 0,
}

export const useAstStore = create<AstStore>((set) => ({
  ...initialState,

  setScope: (scope) => set({ scope }),

  setRepoGraph: (repoGraph) => set({ repoGraph }),

  setArchAnalysis: (archAnalysis) => set({ archAnalysis }),

  setFileAst: (fileAst) => set({ fileAst }),

  selectFile: (selectedFile) => set({ selectedFile, selectedNode: null }),

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

  setExplain: (explainText, explainLoading) => set({ explainText, explainLoading }),

  setChatLoading: (chatLoading) => set({ chatLoading }),

  setZoom: (zoom) => set({ zoom }),

  setPan: (panX, panY) => set({ panX, panY }),

  reset: () =>
    set({
      ...initialState,
      activeOverlays: new Set<AstOverlay>(),
    }),
}))
