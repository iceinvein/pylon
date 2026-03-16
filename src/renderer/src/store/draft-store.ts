import { create } from 'zustand'
import type { FileAttachment } from '../../../shared/types'

type Draft = {
  text: string
  attachments: FileAttachment[]
}

type DraftStore = {
  drafts: Map<string, Draft>
  getDraft: (tabId: string) => Draft | undefined
  setDraft: (tabId: string, draft: Draft) => void
  clearDraft: (tabId: string) => void
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  drafts: new Map(),

  getDraft: (tabId) => get().drafts.get(tabId),

  setDraft: (tabId, draft) => {
    set((state) => {
      const next = new Map(state.drafts)
      next.set(tabId, draft)
      return { drafts: next }
    })
  },

  clearDraft: (tabId) => {
    set((state) => {
      const next = new Map(state.drafts)
      next.delete(tabId)
      return { drafts: next }
    })
  },
}))
