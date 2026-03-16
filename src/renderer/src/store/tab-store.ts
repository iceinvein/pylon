import { create } from 'zustand'
import type { Tab } from '../../../shared/types'
import { randomUUID } from '../lib/utils'

type TabStore = {
  tabs: Tab[]
  activeTabId: string | null
  addTab: (cwd: string, label?: string, sessionId?: string, useWorktree?: boolean) => string
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  restoreTabs: (tabs: Tab[], activeTabId: string | null) => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (cwd, label, sessionId, useWorktree) => {
    const id = randomUUID()
    const tab: Tab = {
      id,
      sessionId: sessionId ?? null,
      cwd,
      label: label ?? cwd.split('/').pop() ?? cwd,
      useWorktree,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }))
    return id
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    const newTabs = tabs.filter((t) => t.id !== tabId)
    let newActiveId = activeTabId
    if (activeTabId === tabId) {
      if (newTabs.length === 0) {
        newActiveId = null
      } else {
        newActiveId = newTabs[Math.max(0, idx - 1)].id
      }
    }
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId })
  },

  updateTab: (tabId, updates) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
    }))
  },

  restoreTabs: (tabs, activeTabId) => {
    set({ tabs, activeTabId })
  },
}))

// ── Debounced persist to SQLite via IPC ──

let saveTimer: ReturnType<typeof setTimeout> | null = null

useTabStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const payload = JSON.stringify({
      version: 1,
      tabs: state.tabs,
      activeTabId: state.activeTabId,
    })
    // window.api may not exist during tests or before preload
    if (typeof window !== 'undefined' && window.api?.updateSettings) {
      window.api.updateSettings('open_tabs', payload)
    }
  }, 300)
})
