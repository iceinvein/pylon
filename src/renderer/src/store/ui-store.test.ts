import { test, expect, describe, beforeEach } from 'bun:test'
import { useUiStore } from './ui-store'

function resetStore() {
  useUiStore.setState({
    commandPaletteOpen: false,
    settingsOpen: false,
    sidebarView: 'home',
    draftText: null,
  })
}

describe('ui-store', () => {
  beforeEach(resetStore)

  test('initial state', () => {
    const state = useUiStore.getState()
    expect(state.commandPaletteOpen).toBe(false)
    expect(state.settingsOpen).toBe(false)
    expect(state.sidebarView).toBe('home')
    expect(state.draftText).toBeNull()
  })

  test('toggleCommandPalette flips the boolean', () => {
    useUiStore.getState().toggleCommandPalette()
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
    useUiStore.getState().toggleCommandPalette()
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
  })

  test('setSettingsOpen sets the value', () => {
    useUiStore.getState().setSettingsOpen(true)
    expect(useUiStore.getState().settingsOpen).toBe(true)
    useUiStore.getState().setSettingsOpen(false)
    expect(useUiStore.getState().settingsOpen).toBe(false)
  })

  test('setSidebarView changes view', () => {
    useUiStore.getState().setSidebarView('history')
    expect(useUiStore.getState().sidebarView).toBe('history')
    useUiStore.getState().setSidebarView('settings')
    expect(useUiStore.getState().sidebarView).toBe('settings')
  })

  test('setDraftText sets and clears draft', () => {
    useUiStore.getState().setDraftText('hello world')
    expect(useUiStore.getState().draftText).toBe('hello world')
    useUiStore.getState().setDraftText(null)
    expect(useUiStore.getState().draftText).toBeNull()
  })
})
