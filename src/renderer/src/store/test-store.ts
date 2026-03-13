import { create } from 'zustand'
import type {
  E2ePathResolution,
  ExplorationMode,
  ExplorationUpdate,
  TestExploration,
  TestFinding,
} from '../../../shared/types'

type TestStore = {
  activeExploration: TestExploration | null
  explorationStreamingText: string
  explorationFindings: TestFinding[]
  generatedTests: string[]
  explorations: TestExploration[]

  startExploration: (
    cwd: string,
    config: {
      url: string
      goal: string
      mode: ExplorationMode
      requirements?: string
      e2eOutputPath: string
      e2ePathReason?: string
    },
  ) => Promise<void>
  stopExploration: (id: string) => Promise<void>
  loadExplorations: (cwd: string) => Promise<void>
  loadExploration: (id: string) => Promise<void>
  deleteExploration: (id: string) => Promise<void>
  resolveE2ePath: (cwd: string) => Promise<E2ePathResolution>
  readGeneratedTest: (cwd: string, path: string) => Promise<string | null>
  handleExplorationUpdate: (data: ExplorationUpdate) => void
}

export const useTestStore = create<TestStore>((set) => ({
  activeExploration: null,
  explorationStreamingText: '',
  explorationFindings: [],
  generatedTests: [],
  explorations: [],

  startExploration: async (cwd, config) => {
    try {
      const exploration = await window.api.startExploration({ cwd, ...config })
      set({
        activeExploration: exploration,
        explorationStreamingText: '',
        explorationFindings: [],
        generatedTests: [],
      })
    } catch (err) {
      console.error('startExploration failed:', err)
    }
  },

  stopExploration: async (id) => {
    try {
      await window.api.stopExploration(id)
    } catch (err) {
      console.error('stopExploration failed:', err)
    }
  },

  loadExplorations: async (cwd) => {
    try {
      const explorations = await window.api.listExplorations(cwd)
      set({ explorations })
    } catch (err) {
      console.error('loadExplorations failed:', err)
    }
  },

  loadExploration: async (id) => {
    try {
      const result = await window.api.getExploration(id)
      if (!result) return
      set({
        activeExploration: result,
        explorationFindings: result.findings,
        generatedTests: result.generatedTestPaths,
        explorationStreamingText: '',
      })
    } catch (err) {
      console.error('loadExploration failed:', err)
    }
  },

  deleteExploration: async (id) => {
    try {
      await window.api.deleteExploration(id)
      set((s) => ({
        explorations: s.explorations.filter((e) => e.id !== id),
        activeExploration: s.activeExploration?.id === id ? null : s.activeExploration,
        explorationFindings: s.activeExploration?.id === id ? [] : s.explorationFindings,
        generatedTests: s.activeExploration?.id === id ? [] : s.generatedTests,
        explorationStreamingText: s.activeExploration?.id === id ? '' : s.explorationStreamingText,
      }))
    } catch (err) {
      console.error('deleteExploration failed:', err)
    }
  },

  resolveE2ePath: async (cwd) => {
    return window.api.resolveE2ePath(cwd)
  },

  readGeneratedTest: async (cwd, path) => {
    return window.api.readGeneratedTest(cwd, path)
  },

  handleExplorationUpdate: (data) => {
    set((s) => {
      // Only update if this is for the active exploration
      if (s.activeExploration?.id !== data.explorationId) return s

      const updates: Partial<TestStore> = {}

      // Update exploration status and counts
      const updatedExploration = { ...s.activeExploration }
      if (data.status) updatedExploration.status = data.status
      if (data.findingsCount !== undefined) updatedExploration.findingsCount = data.findingsCount
      if (data.testsGenerated !== undefined) updatedExploration.testsGenerated = data.testsGenerated
      if (data.inputTokens !== undefined) updatedExploration.inputTokens = data.inputTokens
      if (data.outputTokens !== undefined) updatedExploration.outputTokens = data.outputTokens
      if (data.totalCostUsd !== undefined) updatedExploration.totalCostUsd = data.totalCostUsd
      if (data.error) updatedExploration.errorMessage = data.error
      updates.activeExploration = updatedExploration

      // Update streaming text
      if (data.streamingText !== undefined) {
        updates.explorationStreamingText = data.streamingText
      }

      // Append new findings (don't replace — findings arrive incrementally)
      if (data.findings && data.findings.length > 0) {
        const existingIds = new Set(s.explorationFindings.map((f) => f.id))
        const newFindings = data.findings.filter((f) => !existingIds.has(f.id))
        if (newFindings.length > 0) {
          updates.explorationFindings = [...s.explorationFindings, ...newFindings]
        }
      }

      // Append new generated test paths
      if (data.generatedTests && data.generatedTests.length > 0) {
        const existingPaths = new Set(s.generatedTests)
        const newPaths = data.generatedTests.filter((p) => !existingPaths.has(p))
        if (newPaths.length > 0) {
          updates.generatedTests = [...s.generatedTests, ...newPaths]
        }
      }

      // On terminal status, update the explorations list too
      if (data.status === 'done' || data.status === 'stopped' || data.status === 'error') {
        updates.explorations = s.explorations.map((e) =>
          e.id === data.explorationId ? { ...e, ...updatedExploration } : e,
        )
      }

      return updates
    })
  },
}))
