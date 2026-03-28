import { useEffect } from 'react'
import type { ArchAnalysis, RepoGraph } from '../../../shared/types'
import { useAstStore } from '../store/ast-store'

export function useAstBridge() {
  useEffect(() => {
    const unsub = window.api.onAstAnalysisProgress((data) => {
      const d = data as { status: string; message?: string }
      useAstStore
        .getState()
        .setAnalysisStatus(
          d.status as 'idle' | 'parsing' | 'analyzing' | 'ready' | 'error',
          d.message,
        )
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.onAstRepoGraph((data) => {
      const graph = data as RepoGraph
      useAstStore.getState().setRepoGraph(graph)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.onAstArchAnalysis((data) => {
      const analysis = data as ArchAnalysis
      useAstStore.getState().setArchAnalysis(analysis)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.onAstExplainResult((data) => {
      const d = data as { text: string; done: boolean }
      useAstStore.getState().setExplain(d.text, !d.done)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = window.api.onAstChatResult((data) => {
      const d = data as { text: string; done: boolean }
      if (d.done) {
        useAstStore.getState().addChatMessage({ role: 'assistant', content: d.text })
        useAstStore.getState().setChatLoading(false)
      }
    })
    return unsub
  }, [])
}
