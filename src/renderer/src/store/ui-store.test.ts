import { beforeEach, describe, expect, test } from 'bun:test'
import { useUiStore } from './ui-store'

function resetStore() {
  useUiStore.setState({
    commandPaletteOpen: false,
    settingsOpen: false,
    activeMode: 'sessions',
    activeSessionId: null,
    recentSessionIds: [],
    draftText: null,
  })
}

describe('ui-store', () => {
  beforeEach(resetStore)

  test('initial state', () => {
    const state = useUiStore.getState()
    expect(state.commandPaletteOpen).toBe(false)
    expect(state.settingsOpen).toBe(false)
    expect(state.activeMode).toBe('sessions')
    expect(state.activeSessionId).toBeNull()
    expect(state.recentSessionIds).toEqual([])
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

  test('setActiveMode changes mode', () => {
    useUiStore.getState().setActiveMode('pr-review')
    expect(useUiStore.getState().activeMode).toBe('pr-review')
    useUiStore.getState().setActiveMode('code')
    expect(useUiStore.getState().activeMode).toBe('code')
  })

  test('setActiveSession sets active and pushes previous to recents', () => {
    useUiStore.getState().setActiveSession('session-1')
    expect(useUiStore.getState().activeSessionId).toBe('session-1')
    expect(useUiStore.getState().recentSessionIds).toEqual([])

    useUiStore.getState().setActiveSession('session-2')
    expect(useUiStore.getState().activeSessionId).toBe('session-2')
    expect(useUiStore.getState().recentSessionIds).toEqual(['session-1'])

    useUiStore.getState().setActiveSession('session-3')
    expect(useUiStore.getState().activeSessionId).toBe('session-3')
    expect(useUiStore.getState().recentSessionIds).toEqual(['session-2', 'session-1'])
  })

  test('setActiveSession caps recents at 3', () => {
    useUiStore.getState().setActiveSession('s1')
    useUiStore.getState().setActiveSession('s2')
    useUiStore.getState().setActiveSession('s3')
    useUiStore.getState().setActiveSession('s4')
    useUiStore.getState().setActiveSession('s5')
    expect(useUiStore.getState().activeSessionId).toBe('s5')
    expect(useUiStore.getState().recentSessionIds).toEqual(['s4', 's3', 's2'])
  })

  test('setActiveSession promotes from recents', () => {
    useUiStore.getState().setActiveSession('s1')
    useUiStore.getState().setActiveSession('s2')
    useUiStore.getState().setActiveSession('s3')
    // Now: active=s3, recents=[s2, s1]
    useUiStore.getState().setActiveSession('s1')
    // s1 promoted from recents to active, s3 pushed to recents
    expect(useUiStore.getState().activeSessionId).toBe('s1')
    expect(useUiStore.getState().recentSessionIds).toEqual(['s3', 's2'])
  })

  test('deselectSession clears activeSessionId', () => {
    useUiStore.getState().setActiveSession('session-1')
    useUiStore.getState().deselectSession()
    expect(useUiStore.getState().activeSessionId).toBeNull()
  })

  test('setDraftText sets and clears draft', () => {
    useUiStore.getState().setDraftText('hello world')
    expect(useUiStore.getState().draftText).toBe('hello world')
    useUiStore.getState().setDraftText(null)
    expect(useUiStore.getState().draftText).toBeNull()
  })
})
