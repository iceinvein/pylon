import { create } from 'zustand'
import type {
  E2ePathResolution,
  ExplorationAgentMessage,
  ExplorationMode,
  ExplorationUpdate,
  FindingSeverity,
  GoalSuggestionUpdate,
  ProjectScan,
  SuggestedGoal,
  TestExploration,
  TestFinding,
} from '../../../shared/types'

type BatchConfig = {
  goals: string[]
  agentCount: number
  mode: ExplorationMode
  requirements?: string
  e2eOutputPath: string
  e2ePathReason?: string
  autoStartServer: boolean
  projectScan?: ProjectScan
}

type TestViewMode = 'setup' | 'monitoring' | 'comparison'

type ExplorationConfig = {
  url: string
  goal: string
  mode: ExplorationMode
  requirements?: string
  e2eOutputPath: string
  e2ePathReason?: string
  projectScan?: ProjectScan
}

type TestStore = {
  // Project context
  selectedProject: string | null
  projects: Array<{ path: string; lastUsed: number }>

  // Project scan
  projectScan: ProjectScan | null
  scanLoading: boolean

  // Goal suggestions
  suggestedGoals: SuggestedGoal[]
  goalsLoading: boolean
  customGoals: string[]

  // Server override
  customUrl: string | null

  // Concurrency
  agentCount: number
  autoStartServer: boolean

  // Multi-exploration
  selectedExplorationId: string | null
  explorations: TestExploration[]
  streamingTexts: Record<string, string>
  findingsByExploration: Record<string, TestFinding[]>
  testsByExploration: Record<string, string[]>
  agentMessagesByExploration: Record<string, ExplorationAgentMessage[]>

  // View mode
  viewMode: TestViewMode
  setupStep: 1 | 2 | 3

  // Filters
  severityFilter: FindingSeverity[] | null
  agentFilter: string | null

  // Comparison
  comparisonBaselineId: string | null
  comparisonTargetId: string | null

  // Batch tracking
  lastBatchId: string | null

  // Actions
  loadProjects: () => Promise<void>
  selectProject: (cwd: string) => void
  scanProject: (cwd: string) => Promise<void>
  suggestGoals: (cwd: string) => Promise<void>
  toggleGoal: (goalId: string) => void
  addCustomGoal: (goal: string) => void
  removeCustomGoal: (index: number) => void
  setCustomUrl: (url: string | null) => void
  setAgentCount: (count: number) => void
  setAutoStartServer: (enabled: boolean) => void
  startBatch: (cwd: string, config: BatchConfig) => Promise<void>
  startExploration: (cwd: string, config: ExplorationConfig) => Promise<void>
  stopExploration: (id: string) => Promise<void>
  selectExploration: (id: string) => void
  loadExplorations: (cwd: string) => Promise<void>
  loadExploration: (id: string) => Promise<void>
  deleteExploration: (id: string) => Promise<void>
  resolveE2ePath: (cwd: string) => Promise<E2ePathResolution>
  readGeneratedTest: (cwd: string, path: string) => Promise<string | null>
  handleExplorationUpdate: (data: ExplorationUpdate) => void
  getBatchFindings: (batchId: string) => Array<TestFinding & { goalText: string }>
  handleGoalSuggestion: (data: GoalSuggestionUpdate) => void
  setViewMode: (mode: TestViewMode) => void
  setSetupStep: (step: 1 | 2 | 3) => void
  setSeverityFilter: (severity: FindingSeverity) => void
  clearSeverityFilter: () => void
  setAgentFilter: (id: string | null) => void
  enterComparison: (baselineId: string, targetId: string) => void
  exitComparison: () => void
}

export const useTestStore = create<TestStore>((set, get) => ({
  // Initial state
  selectedProject: null,
  projects: [],
  projectScan: null,
  scanLoading: false,
  suggestedGoals: [],
  goalsLoading: false,
  customGoals: [],
  customUrl: null,
  agentCount: 1,
  autoStartServer: true,
  selectedExplorationId: null,
  explorations: [],
  streamingTexts: {},
  findingsByExploration: {},
  testsByExploration: {},
  agentMessagesByExploration: {},
  viewMode: 'setup' as TestViewMode,
  setupStep: 1 as 1 | 2 | 3,
  severityFilter: null,
  agentFilter: null,
  comparisonBaselineId: null,
  comparisonTargetId: null,
  lastBatchId: null,

  loadProjects: async () => {
    try {
      const projects = await window.api.listProjects()
      set({ projects })
    } catch (err) {
      console.error('loadProjects failed:', err)
    }
  },

  selectProject: (cwd) => {
    set({
      selectedProject: cwd,
      projectScan: null,
      scanLoading: false,
      suggestedGoals: [],
      goalsLoading: false,
      customGoals: [],
      customUrl: null,
      selectedExplorationId: null,
      agentMessagesByExploration: {},
    })
    // Trigger async operations
    get().scanProject(cwd)
    get().suggestGoals(cwd)
    get().loadExplorations(cwd)
  },

  scanProject: async (cwd) => {
    set({ scanLoading: true })
    try {
      const scan = await window.api.scanProject(cwd)
      // Only apply if still same project
      if (get().selectedProject === cwd) {
        set({ projectScan: scan, scanLoading: false })
      }
    } catch (err) {
      console.error('scanProject failed:', err)
      if (get().selectedProject === cwd) {
        set({ scanLoading: false })
      }
    }
  },

  suggestGoals: async (cwd) => {
    set({ goalsLoading: true })
    try {
      await window.api.suggestGoals(cwd)
      // Results arrive via handleGoalSuggestion
    } catch (err) {
      console.error('suggestGoals failed:', err)
      if (get().selectedProject === cwd) {
        set({ goalsLoading: false })
      }
    }
  },

  toggleGoal: (goalId) => {
    set((s) => ({
      suggestedGoals: s.suggestedGoals.map((g) =>
        g.id === goalId ? { ...g, selected: !g.selected } : g,
      ),
    }))
  },

  addCustomGoal: (goal) => {
    set((s) => ({ customGoals: [...s.customGoals, goal] }))
  },

  removeCustomGoal: (index) => {
    set((s) => ({ customGoals: s.customGoals.filter((_, i) => i !== index) }))
  },

  setCustomUrl: (url) => set({ customUrl: url }),

  setAgentCount: (count) => set({ agentCount: Math.max(1, Math.min(5, count)) }),

  setAutoStartServer: (enabled) => set({ autoStartServer: enabled }),

  startBatch: async (cwd, config) => {
    try {
      const explorations = await window.api.startBatch({
        cwd,
        goals: config.goals,
        agentCount: config.agentCount,
        mode: config.mode,
        requirements: config.requirements,
        e2eOutputPath: config.e2eOutputPath,
        e2ePathReason: config.e2ePathReason,
        autoStartServer: config.autoStartServer,
        projectScan: config.projectScan,
      })

      set((s) => {
        const newStreamingTexts = { ...s.streamingTexts }
        const newFindings = { ...s.findingsByExploration }
        const newTests = { ...s.testsByExploration }
        const newAgentMessages = { ...s.agentMessagesByExploration }

        for (const exp of explorations) {
          newStreamingTexts[exp.id] = ''
          newFindings[exp.id] = []
          newTests[exp.id] = []
          newAgentMessages[exp.id] = []
        }

        return {
          explorations: [...explorations, ...s.explorations],
          selectedExplorationId: explorations[0]?.id ?? s.selectedExplorationId,
          streamingTexts: newStreamingTexts,
          findingsByExploration: newFindings,
          testsByExploration: newTests,
          agentMessagesByExploration: newAgentMessages,
          viewMode: 'monitoring' as TestViewMode,
          lastBatchId: explorations[0]?.batchId ?? null,
          agentFilter: null,
          severityFilter: null,
        }
      })
    } catch (err) {
      console.error('startBatch failed:', err)
    }
  },

  startExploration: async (cwd, config) => {
    try {
      const exploration = await window.api.startExploration({ cwd, ...config })
      set((s) => ({
        explorations: [exploration, ...s.explorations],
        selectedExplorationId: exploration.id,
        streamingTexts: { ...s.streamingTexts, [exploration.id]: '' },
        findingsByExploration: { ...s.findingsByExploration, [exploration.id]: [] },
        testsByExploration: { ...s.testsByExploration, [exploration.id]: [] },
        agentMessagesByExploration: { ...s.agentMessagesByExploration, [exploration.id]: [] },
      }))
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

  selectExploration: (id) => {
    set({ selectedExplorationId: id })
    // Load full data if not already in Records
    const state = get()
    if (!state.findingsByExploration[id]) {
      get().loadExploration(id)
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
      set((s) => ({
        selectedExplorationId: id,
        findingsByExploration: { ...s.findingsByExploration, [id]: result.findings },
        testsByExploration: { ...s.testsByExploration, [id]: result.generatedTestPaths },
        streamingTexts: { ...s.streamingTexts, [id]: '' },
        // Update the exploration in the list if it exists
        explorations: s.explorations.map((e) => (e.id === id ? { ...e, ...result } : e)),
      }))
    } catch (err) {
      console.error('loadExploration failed:', err)
    }
  },

  deleteExploration: async (id) => {
    try {
      // Stop if running
      const exploration = get().explorations.find((e) => e.id === id)
      if (exploration?.status === 'running') {
        await get().stopExploration(id)
      }

      await window.api.deleteExploration(id)
      set((s) => {
        const { [id]: _st, ...restStreaming } = s.streamingTexts
        const { [id]: _fi, ...restFindings } = s.findingsByExploration
        const { [id]: _te, ...restTests } = s.testsByExploration
        const { [id]: _am, ...restAgentMessages } = s.agentMessagesByExploration
        return {
          explorations: s.explorations.filter((e) => e.id !== id),
          selectedExplorationId: s.selectedExplorationId === id ? null : s.selectedExplorationId,
          streamingTexts: restStreaming,
          findingsByExploration: restFindings,
          testsByExploration: restTests,
          agentMessagesByExploration: restAgentMessages,
        }
      })
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

  getBatchFindings: (batchId: string) => {
    const state = get()
    const batchExplorations = state.explorations.filter((e) => e.batchId === batchId)
    const allFindings: Array<TestFinding & { goalText: string }> = []

    for (const exp of batchExplorations) {
      const findings = state.findingsByExploration[exp.id] ?? []
      for (const f of findings) {
        allFindings.push({
          ...f,
          goalText: exp.goal.length > 50 ? `${exp.goal.slice(0, 50)}...` : exp.goal,
        })
      }
    }

    return allFindings
  },

  handleExplorationUpdate: (data) => {
    set((s) => {
      const id = data.explorationId
      const updates: Partial<TestStore> = {}

      // Update streaming text
      if (data.streamingText !== undefined) {
        updates.streamingTexts = { ...s.streamingTexts, [id]: data.streamingText }
      }

      // Append new findings
      if (data.findings && data.findings.length > 0) {
        const existing = s.findingsByExploration[id] ?? []
        const existingIds = new Set(existing.map((f) => f.id))
        const newFindings = data.findings.filter((f) => !existingIds.has(f.id))
        if (newFindings.length > 0) {
          updates.findingsByExploration = {
            ...s.findingsByExploration,
            [id]: [...existing, ...newFindings],
          }
        }
      }

      // Append new test paths
      if (data.generatedTests && data.generatedTests.length > 0) {
        const existing = s.testsByExploration[id] ?? []
        const existingSet = new Set(existing)
        const newPaths = data.generatedTests.filter((p) => !existingSet.has(p))
        if (newPaths.length > 0) {
          updates.testsByExploration = {
            ...s.testsByExploration,
            [id]: [...existing, ...newPaths],
          }
        }
      }

      // Append new agent messages
      if (data.agentMessages && data.agentMessages.length > 0) {
        const existing = s.agentMessagesByExploration[id] ?? []
        updates.agentMessagesByExploration = {
          ...s.agentMessagesByExploration,
          [id]: [...existing, ...data.agentMessages],
        }
      }

      // Update exploration in the list
      updates.explorations = s.explorations.map((e) => {
        if (e.id !== id) return e
        const updated = { ...e }
        if (data.status) updated.status = data.status
        if (data.findingsCount !== undefined) updated.findingsCount = data.findingsCount
        if (data.testsGenerated !== undefined) updated.testsGenerated = data.testsGenerated
        if (data.inputTokens !== undefined) updated.inputTokens = data.inputTokens
        if (data.outputTokens !== undefined) updated.outputTokens = data.outputTokens
        if (data.totalCostUsd !== undefined) updated.totalCostUsd = data.totalCostUsd
        if (data.error) updated.errorMessage = data.error
        return updated
      })

      return updates
    })
  },

  handleGoalSuggestion: (data) => {
    set((s) => {
      // Guard against stale updates from a different project
      if (s.selectedProject !== data.cwd) return s

      if (data.status === 'loading') {
        return { goalsLoading: true }
      }

      if (data.status === 'error') {
        return { goalsLoading: false }
      }

      // status === 'done'
      const goals: SuggestedGoal[] = data.goals.map((g) => ({
        ...g,
        selected: true, // default all selected
      }))

      // Merge with any existing goals (in case tool was called multiple times)
      const existingIds = new Set(s.suggestedGoals.map((g) => g.id))
      const newGoals = goals.filter((g) => !existingIds.has(g.id))

      return {
        goalsLoading: false,
        suggestedGoals: newGoals.length > 0 ? [...s.suggestedGoals, ...newGoals] : s.suggestedGoals,
      }
    })
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  setSetupStep: (step) => set({ setupStep: step }),

  setSeverityFilter: (severity) => {
    set((s) => {
      if (!s.severityFilter) {
        return { severityFilter: [severity] }
      }
      const exists = s.severityFilter.includes(severity)
      if (exists) {
        const next = s.severityFilter.filter((sv) => sv !== severity)
        return { severityFilter: next.length === 0 ? null : next }
      }
      return { severityFilter: [...s.severityFilter, severity] }
    })
  },

  clearSeverityFilter: () => set({ severityFilter: null }),

  setAgentFilter: (id) => set({ agentFilter: id }),

  enterComparison: (baselineId, targetId) => {
    set({
      viewMode: 'comparison',
      comparisonBaselineId: baselineId,
      comparisonTargetId: targetId,
    })
    const state = get()
    if (!state.findingsByExploration[baselineId]) {
      state.loadExploration(baselineId)
    }
    if (!state.findingsByExploration[targetId]) {
      state.loadExploration(targetId)
    }
  },

  exitComparison: () => {
    set({
      viewMode: 'monitoring',
      comparisonBaselineId: null,
      comparisonTargetId: null,
    })
  },
}))

export type { TestViewMode }
