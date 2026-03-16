import { create } from 'zustand'
import type { CommandEntry, ConflictResolution, GitCommandPlan } from '../../../shared/git-types'
import { log } from '../../../shared/logger'

const logger = log.child('git-ops-store')

type GitOpsStore = {
  commandHistory: CommandEntry[]
  pendingPlan: GitCommandPlan | null
  conflicts: ConflictResolution[]
  error: string | null

  submitCommand: (cwd: string, sessionId: string, text: string) => Promise<void>
  confirmPlan: (cwd: string, planId: string) => Promise<void>
  cancelPlan: () => void
  applyResolutions: (cwd: string, resolutions: ConflictResolution[]) => Promise<void>
  setConflicts: (conflicts: ConflictResolution[]) => void
  reset: () => void
}

export const useGitOpsStore = create<GitOpsStore>((set) => ({
  commandHistory: [],
  pendingPlan: null,
  conflicts: [],
  error: null,

  submitCommand: async (cwd, sessionId, text) => {
    const entry: CommandEntry = {
      id: crypto.randomUUID(),
      request: text,
      plan: null,
      status: 'pending',
      timestamp: Date.now(),
    }
    set((s) => ({ commandHistory: [...s.commandHistory, entry], error: null }))

    try {
      const plan = await window.api.gitOpsExecuteNl(cwd, sessionId, text)
      set((s) => ({
        pendingPlan: plan,
        commandHistory: s.commandHistory.map((e) =>
          e.id === entry.id ? { ...e, plan, status: 'planned' as const } : e,
        ),
      }))
    } catch (err) {
      logger.error('Failed to interpret command:', err)
      set((s) => ({
        error: 'Failed to interpret command',
        commandHistory: s.commandHistory.map((e) =>
          e.id === entry.id ? { ...e, status: 'failed' as const, error: String(err) } : e,
        ),
      }))
    }
  },

  confirmPlan: async (cwd, planId) => {
    set((s) => ({
      commandHistory: s.commandHistory.map((e) =>
        e.plan?.id === planId ? { ...e, status: 'executing' as const } : e,
      ),
    }))
    try {
      const result = await window.api.gitOpsConfirm(cwd, planId)
      set((s) => ({
        pendingPlan: null,
        commandHistory: s.commandHistory.map((e) =>
          e.plan?.id === planId
            ? {
                ...e,
                status: result.success ? ('completed' as const) : ('failed' as const),
                result: result.result,
              }
            : e,
        ),
      }))
    } catch (err) {
      logger.error('Failed to execute plan:', err)
      set((s) => ({
        error: 'Command execution failed',
        commandHistory: s.commandHistory.map((e) =>
          e.plan?.id === planId ? { ...e, status: 'failed' as const, error: String(err) } : e,
        ),
      }))
    }
  },

  cancelPlan: () =>
    set((s) => ({
      pendingPlan: null,
      commandHistory: s.commandHistory.map((e) =>
        e.status === 'planned' ? { ...e, status: 'cancelled' as const } : e,
      ),
    })),

  applyResolutions: async (cwd, resolutions) => {
    try {
      await window.api.gitOpsApplyResolution(cwd, resolutions)
      set({ conflicts: [] })
    } catch (err) {
      logger.error('Failed to apply resolutions:', err)
      set({ error: 'Failed to apply conflict resolutions' })
    }
  },

  setConflicts: (conflicts) => set({ conflicts }),

  reset: () => set({ commandHistory: [], pendingPlan: null, conflicts: [], error: null }),
}))
