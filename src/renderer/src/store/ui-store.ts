// src/renderer/src/store/ui-store.ts
import { create } from 'zustand'

export type AppMode = 'sessions' | 'pr-review' | 'testing' | 'code'

const MAX_RECENT_SESSIONS = 3

type UiStore = {
  // ── Mode ──
  activeMode: AppMode
  setActiveMode: (mode: AppMode) => void

  // ── Session navigation (replaces tab-store) ──
  activeSessionId: string | null
  recentSessionIds: string[]
  setActiveSession: (id: string) => void
  deselectSession: () => void

  // ── Existing UI state ──
  commandPaletteOpen: boolean
  settingsOpen: boolean
  shortcutsOpen: boolean
  draftText: string | null
  reviewPanelPlan: { sessionId: string; filePath: string } | null
  newSessionPopoverOpen: boolean

  toggleCommandPalette: () => void
  setSettingsOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setDraftText: (text: string | null) => void
  openReviewPanel: (sessionId: string, filePath: string) => void
  closeReviewPanel: () => void
  setNewSessionPopoverOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  // ── Mode ──
  activeMode: 'sessions',
  setActiveMode: (mode) => set({ activeMode: mode }),

  // ── Session navigation ──
  activeSessionId: null,
  recentSessionIds: [],

  setActiveSession: (id) => {
    const { activeSessionId, recentSessionIds } = get()
    if (id === activeSessionId) return

    let newRecent = [...recentSessionIds]
    // Remove the target from recents if it's already there (promoting it to active)
    newRecent = newRecent.filter((rid) => rid !== id)
    // Push the previously active session into recents
    if (activeSessionId) {
      newRecent = [activeSessionId, ...newRecent].slice(0, MAX_RECENT_SESSIONS)
    }

    set({
      activeSessionId: id,
      recentSessionIds: newRecent,
    })
  },

  deselectSession: () => {
    set({ activeSessionId: null })
  },

  // ── Existing UI state ──
  commandPaletteOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  draftText: null,
  reviewPanelPlan: null,
  newSessionPopoverOpen: false,

  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setDraftText: (text) => set({ draftText: text }),
  openReviewPanel: (sessionId, filePath) => set({ reviewPanelPlan: { sessionId, filePath } }),
  closeReviewPanel: () => set({ reviewPanelPlan: null }),
  setNewSessionPopoverOpen: (open) => set({ newSessionPopoverOpen: open }),
}))

// ── Debounced persist to SQLite via IPC ──

let saveTimer: ReturnType<typeof setTimeout> | null = null

useUiStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const payload = JSON.stringify({
      version: 2,
      activeSessionId: state.activeSessionId,
      recentSessionIds: state.recentSessionIds,
    })
    if (typeof window !== 'undefined' && window.api?.updateSettings) {
      window.api.updateSettings('active_session', payload)
    }
  }, 300)
})
