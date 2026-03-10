import { create } from 'zustand'

type SidebarView = 'home' | 'history' | 'pr-review' | 'settings'

type UiStore = {
  commandPaletteOpen: boolean
  settingsOpen: boolean
  sidebarView: SidebarView
  draftText: string | null

  toggleCommandPalette: () => void
  setSettingsOpen: (open: boolean) => void
  setSidebarView: (view: SidebarView) => void
  setDraftText: (text: string | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  commandPaletteOpen: false,
  settingsOpen: false,
  sidebarView: 'home',
  draftText: null,

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setSidebarView: (view) => set({ sidebarView: view }),

  setDraftText: (text) => set({ draftText: text }),
}))
