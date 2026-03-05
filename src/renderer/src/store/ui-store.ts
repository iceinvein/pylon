import { create } from 'zustand'

type SidebarView = 'home' | 'files' | 'settings'

type SubagentDrawerState = {
  open: boolean
  sessionId: string | null
  agentType: string | null
}

type UiStore = {
  commandPaletteOpen: boolean
  subagentDrawer: SubagentDrawerState
  sidebarView: SidebarView

  toggleCommandPalette: () => void
  openSubagentDrawer: (sessionId: string, agentType: string) => void
  closeSubagentDrawer: () => void
  setSidebarView: (view: SidebarView) => void
}

export const useUiStore = create<UiStore>((set) => ({
  commandPaletteOpen: false,
  subagentDrawer: { open: false, sessionId: null, agentType: null },
  sidebarView: 'home',

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  openSubagentDrawer: (sessionId, agentType) =>
    set({ subagentDrawer: { open: true, sessionId, agentType } }),

  closeSubagentDrawer: () =>
    set({ subagentDrawer: { open: false, sessionId: null, agentType: null } }),

  setSidebarView: (view) => set({ sidebarView: view }),
}))
