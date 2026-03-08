import { test, expect, describe, beforeEach } from 'bun:test'
import { useTabStore } from './tab-store'

function resetStore() {
  useTabStore.setState({ tabs: [], activeTabId: null })
}

describe('tab-store', () => {
  beforeEach(resetStore)

  test('addTab creates a tab and sets it active', () => {
    const id = useTabStore.getState().addTab('/home/user/project')
    const state = useTabStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(id)
    expect(state.tabs[0].cwd).toBe('/home/user/project')
    expect(state.tabs[0].label).toBe('project') // last segment of cwd
  })

  test('addTab uses custom label when provided', () => {
    useTabStore.getState().addTab('/tmp', 'My Tab')
    expect(useTabStore.getState().tabs[0].label).toBe('My Tab')
  })

  test('addTab uses custom sessionId when provided', () => {
    useTabStore.getState().addTab('/tmp', undefined, 'custom-session')
    expect(useTabStore.getState().tabs[0].sessionId).toBe('custom-session')
  })

  test('addTab defaults sessionId to null', () => {
    useTabStore.getState().addTab('/tmp')
    expect(useTabStore.getState().tabs[0].sessionId).toBeNull()
  })

  test('closeTab removes the tab', () => {
    const id = useTabStore.getState().addTab('/tmp')
    useTabStore.getState().closeTab(id)
    expect(useTabStore.getState().tabs).toHaveLength(0)
    expect(useTabStore.getState().activeTabId).toBeNull()
  })

  test('closeTab activates previous tab when closing active tab', () => {
    useTabStore.getState().addTab('/a')
    const id2 = useTabStore.getState().addTab('/b')
    const id3 = useTabStore.getState().addTab('/c')

    // id3 is active (most recently added)
    useTabStore.getState().closeTab(id3)
    expect(useTabStore.getState().activeTabId).toBe(id2)
  })

  test('closeTab activates first tab when closing first of multiple', () => {
    const id1 = useTabStore.getState().addTab('/a')
    useTabStore.getState().addTab('/b')

    useTabStore.getState().setActiveTab(id1)
    useTabStore.getState().closeTab(id1)
    // idx was 0, max(0, 0-1) = 0, so first remaining tab
    const remaining = useTabStore.getState().tabs[0]
    expect(useTabStore.getState().activeTabId).toBe(remaining.id)
  })

  test('closeTab does not change activeTabId when closing non-active tab', () => {
    const id1 = useTabStore.getState().addTab('/a')
    const id2 = useTabStore.getState().addTab('/b')

    // id2 is active
    useTabStore.getState().closeTab(id1)
    expect(useTabStore.getState().activeTabId).toBe(id2)
  })

  test('setActiveTab changes the active tab', () => {
    const id1 = useTabStore.getState().addTab('/a')
    useTabStore.getState().addTab('/b')

    useTabStore.getState().setActiveTab(id1)
    expect(useTabStore.getState().activeTabId).toBe(id1)
  })

  test('updateTab merges partial updates', () => {
    const id = useTabStore.getState().addTab('/tmp', 'Old Label')
    useTabStore.getState().updateTab(id, { label: 'New Label' })
    expect(useTabStore.getState().tabs[0].label).toBe('New Label')
    expect(useTabStore.getState().tabs[0].cwd).toBe('/tmp') // unchanged
  })

  test('updateTab only affects the targeted tab', () => {
    const id1 = useTabStore.getState().addTab('/a', 'Tab A')
    useTabStore.getState().addTab('/b', 'Tab B')

    useTabStore.getState().updateTab(id1, { label: 'Updated A' })
    expect(useTabStore.getState().tabs[0].label).toBe('Updated A')
    expect(useTabStore.getState().tabs[1].label).toBe('Tab B')
  })
})
