import { create } from 'zustand'
import type { CommitGroup, CommitPlan, FileStatus } from '../../../shared/git-types'
import { log } from '../../../shared/logger'

const logger = log.child('git-commit-store')

type GitCommitStore = {
  workingTree: FileStatus[]
  commitPlan: CommitPlan | null
  analyzing: boolean
  error: string | null

  fetchStatus: (cwd: string) => Promise<void>
  analyzePlan: (cwd: string, sessionId: string) => Promise<void>
  executeGroup: (cwd: string, group: CommitGroup) => Promise<void>
  generateMessage: (cwd: string, sessionId: string) => Promise<string | null>
  stageFiles: (cwd: string, paths: string[]) => Promise<void>
  unstageFiles: (cwd: string, paths: string[]) => Promise<void>
  setCommitPlan: (plan: CommitPlan | null) => void
  reset: () => void
}

export const useGitCommitStore = create<GitCommitStore>((set) => ({
  workingTree: [],
  commitPlan: null,
  analyzing: false,
  error: null,

  fetchStatus: async (cwd) => {
    try {
      const statuses = await window.api.gitCommitGetStatus(cwd)
      set({ workingTree: statuses, error: null })
    } catch (err) {
      logger.error('Failed to fetch working tree status:', err)
      set({ error: 'Failed to load file statuses' })
    }
  },

  analyzePlan: async (cwd, sessionId) => {
    set({ analyzing: true, error: null })
    try {
      const plan = await window.api.gitCommitAnalyze(cwd, sessionId)
      set({ commitPlan: plan, analyzing: false })
    } catch (err) {
      logger.error('Failed to analyze commit plan:', err)
      set({ error: 'Failed to generate commit plan', analyzing: false })
    }
  },

  executeGroup: async (cwd, group) => {
    try {
      await window.api.gitCommitExecute(cwd, group)
    } catch (err) {
      logger.error('Failed to execute commit group:', err)
      set({ error: 'Commit failed' })
    }
  },

  generateMessage: async (cwd, sessionId) => {
    try {
      return await window.api.gitCommitGenerateMsg(cwd, sessionId)
    } catch (err) {
      logger.error('Failed to generate commit message:', err)
      set({ error: 'Failed to generate message' })
      return null
    }
  },

  stageFiles: async (cwd, paths) => {
    await window.api.gitCommitStage(cwd, paths)
  },

  unstageFiles: async (cwd, paths) => {
    await window.api.gitCommitUnstage(cwd, paths)
  },

  setCommitPlan: (plan) => set({ commitPlan: plan }),

  reset: () => set({ workingTree: [], commitPlan: null, analyzing: false, error: null }),
}))
