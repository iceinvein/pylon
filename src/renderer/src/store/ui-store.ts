import { create } from 'zustand'

type SidebarView = 'home' | 'history' | 'settings'

type UiStore = {
  commandPaletteOpen: boolean
  settingsOpen: boolean
  sidebarView: SidebarView

  toggleCommandPalette: () => void
  setSettingsOpen: (open: boolean) => void
  setSidebarView: (view: SidebarView) => void
}

export const useUiStore = create<UiStore>((set) => ({
  commandPaletteOpen: false,
  settingsOpen: false,
  sidebarView: 'home',

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setSidebarView: (view) => set({ sidebarView: view }),
}))
