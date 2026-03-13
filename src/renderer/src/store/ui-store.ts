import { create } from 'zustand'

type SidebarView = 'home' | 'history' | 'pr-review' | 'testing' | 'settings'

type UiStore = {
  commandPaletteOpen: boolean
  settingsOpen: boolean
  sidebarView: SidebarView
  draftText: string | null
  reviewPanelPlan: { sessionId: string; filePath: string } | null
  newTabPopoverOpen: boolean
  gitPanelOpen: boolean

  toggleCommandPalette: () => void
  setSettingsOpen: (open: boolean) => void
  setSidebarView: (view: SidebarView) => void
  setDraftText: (text: string | null) => void
  openReviewPanel: (sessionId: string, filePath: string) => void
  closeReviewPanel: () => void
  setNewTabPopoverOpen: (open: boolean) => void
  toggleGitPanel: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  commandPaletteOpen: false,
  settingsOpen: false,
  sidebarView: 'home',
  draftText: null,
  reviewPanelPlan: null,
  newTabPopoverOpen: false,
  gitPanelOpen: false,

  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setSidebarView: (view) => set({ sidebarView: view }),

  setDraftText: (text) => set({ draftText: text }),

  openReviewPanel: (sessionId, filePath) => set({ reviewPanelPlan: { sessionId, filePath } }),
  closeReviewPanel: () => set({ reviewPanelPlan: null }),

  setNewTabPopoverOpen: (open) => set({ newTabPopoverOpen: open }),

  toggleGitPanel: () => set((state) => ({ gitPanelOpen: !state.gitPanelOpen })),
}))
