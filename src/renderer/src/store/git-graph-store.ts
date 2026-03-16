import { create } from 'zustand'
import { log } from '../../../shared/logger'
import type { BranchInfo, GraphCommit } from '../../../shared/git-types'

const logger = log.child('git-graph-store')

type GitGraphStore = {
  commits: GraphCommit[]
  branches: BranchInfo[]
  loading: boolean
  error: string | null
  selectedCommit: string | null
  hasMore: boolean

  fetchGraph: (cwd: string, afterHash?: string) => Promise<void>
  fetchBranches: (cwd: string) => Promise<void>
  selectCommit: (hash: string | null) => void
  reset: () => void
}

export const useGitGraphStore = create<GitGraphStore>((set) => ({
  commits: [],
  branches: [],
  loading: false,
  error: null,
  selectedCommit: null,
  hasMore: true,

  fetchGraph: async (cwd, afterHash) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.gitGraphGetLog(cwd, afterHash)
      set((s) => ({
        commits: afterHash ? [...s.commits, ...result] : result,
        hasMore: result.length >= 100,
        loading: false,
      }))
    } catch (err) {
      logger.error('Failed to fetch graph:', err)
      set({ error: 'Failed to load commit graph', loading: false })
    }
  },

  fetchBranches: async (cwd) => {
    try {
      const branches = await window.api.gitGraphGetBranches(cwd)
      set({ branches })
    } catch (err) {
      logger.error('Failed to fetch branches:', err)
    }
  },

  selectCommit: (hash) => set({ selectedCommit: hash }),

  reset: () =>
    set({
      commits: [],
      branches: [],
      loading: false,
      error: null,
      selectedCommit: null,
      hasMore: true,
    }),
}))
