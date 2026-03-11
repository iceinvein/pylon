import { create } from 'zustand'
import { log } from '../../../shared/logger'
import type { PrRaiseDescription, PrRaiseInfo, PrRaiseResult } from '../../../shared/types'

const logger = log.child('pr-raise-store')

type PrRaiseOverlay = {
  sessionId: string
  info: PrRaiseInfo | null
  description: PrRaiseDescription | null
  loading: boolean
  creating: boolean
  result: PrRaiseResult | null
  error: string | null
}

type PrRaiseStore = {
  overlay: PrRaiseOverlay | null

  openOverlay: (sessionId: string) => void
  closeOverlay: () => void
  setInfo: (info: PrRaiseInfo) => void
  setDescription: (desc: PrRaiseDescription) => void
  setResult: (result: PrRaiseResult) => void
  setCreating: (creating: boolean) => void
  setError: (error: string) => void

  // Async actions that call IPC
  fetchInfo: (sessionId: string) => Promise<void>
  fetchDescription: (sessionId: string) => Promise<void>
  createPr: (args: {
    sessionId: string
    title: string
    body: string
    baseBranch: string
    squash: boolean
  }) => Promise<void>
}

export const usePrRaiseStore = create<PrRaiseStore>((set, get) => ({
  overlay: null,

  openOverlay: (sessionId) => {
    set({
      overlay: {
        sessionId,
        info: null,
        description: null,
        loading: true,
        creating: false,
        result: null,
        error: null,
      },
    })
  },

  closeOverlay: () => set({ overlay: null }),

  setInfo: (info) => {
    set((s) => {
      if (!s.overlay) return s
      return { overlay: { ...s.overlay, info, loading: false } }
    })
  },

  setDescription: (description) => {
    set((s) => {
      if (!s.overlay) return s
      return { overlay: { ...s.overlay, description } }
    })
  },

  setResult: (result) => {
    set((s) => {
      if (!s.overlay) return s
      return { overlay: { ...s.overlay, result, creating: false } }
    })
  },

  setCreating: (creating) => {
    set((s) => {
      if (!s.overlay) return s
      return { overlay: { ...s.overlay, creating } }
    })
  },

  setError: (error) => {
    set((s) => {
      if (!s.overlay) return s
      return { overlay: { ...s.overlay, error, loading: false, creating: false } }
    })
  },

  fetchInfo: async (sessionId) => {
    try {
      const info = await window.api.getRaisePrInfo(sessionId)
      get().setInfo(info)
    } catch (err) {
      logger.error('fetchInfo failed:', err)
      get().setError(err instanceof Error ? err.message : 'Failed to load PR info')
    }
  },

  fetchDescription: async (sessionId) => {
    try {
      const desc = await window.api.generatePrDescription(sessionId)
      get().setDescription(desc)
    } catch (err) {
      logger.error('fetchDescription failed:', err)
      // Non-fatal: user can still write their own description
    }
  },

  createPr: async (args) => {
    get().setCreating(true)
    try {
      const result = await window.api.raisePr(args)
      get().setResult(result)
      // On success, append a synthetic message to show PR card in chat
      if (result.success && result.prUrl && result.prNumber) {
        const { useSessionStore } = await import('./session-store')
        const overlay = get().overlay
        if (overlay) {
          useSessionStore.getState().appendMessage(args.sessionId, {
            type: 'assistant',
            content: [
              {
                type: 'text',
                text: `__PR_CREATED__${JSON.stringify({
                  prNumber: result.prNumber,
                  title: args.title,
                  url: result.prUrl,
                  baseBranch: args.baseBranch,
                  headBranch: overlay.info?.headBranch ?? '',
                  stats: overlay.info?.stats,
                })}`,
              },
            ],
          })
        }
      }
    } catch (err) {
      logger.error('createPr failed:', err)
      get().setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create PR',
      })
    }
  },
}))
