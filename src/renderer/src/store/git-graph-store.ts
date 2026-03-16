import { create } from 'zustand'
import type { BranchInfo, GraphCommit } from '../../../shared/git-types'
import { log } from '../../../shared/logger'

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
    // On fresh fetch (no cursor), clear stale data immediately so a previous repo's
    // graph doesn't flash while the new one loads.
    if (afterHash) {
      set({ loading: true, error: null })
    } else {
      set({ commits: [], loading: true, error: null, selectedCommit: null })
    }
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
