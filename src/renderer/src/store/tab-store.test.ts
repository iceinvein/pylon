import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { useTabStore } from './tab-store'

function resetStore() {
  useTabStore.setState({ tabs: [], activeTabId: null })
}

describe('tab-store', () => {
  beforeEach(resetStore)
  afterEach(resetStore)

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

describe('restoreTabs', () => {
  afterEach(resetStore)

  test('sets tabs and activeTabId from persisted state', () => {
    const tabs = [
      { id: 'tab-1', sessionId: 'sess-1', cwd: '/project', label: 'project', hydrated: true },
      { id: 'tab-2', sessionId: null, cwd: '/other', label: 'other' },
    ]

    useTabStore.getState().restoreTabs(tabs, 'tab-1')

    const state = useTabStore.getState()
    expect(state.tabs).toEqual(tabs)
    expect(state.activeTabId).toBe('tab-1')
  })

  test('handles empty tabs array', () => {
    useTabStore.getState().restoreTabs([], null)

    const state = useTabStore.getState()
    expect(state.tabs).toEqual([])
    expect(state.activeTabId).toBeNull()
  })

  test('preserves tab IDs as-is (no regeneration)', () => {
    const tabs = [{ id: 'original-uuid-123', sessionId: null, cwd: '/foo', label: 'foo' }]

    useTabStore.getState().restoreTabs(tabs, 'original-uuid-123')

    expect(useTabStore.getState().tabs[0].id).toBe('original-uuid-123')
  })

  test('handles activeTabId not matching any tab', () => {
    const tabs = [{ id: 'tab-1', sessionId: null, cwd: '/foo', label: 'foo' }]

    useTabStore.getState().restoreTabs(tabs, 'nonexistent-tab-id')

    const state = useTabStore.getState()
    expect(state.tabs).toEqual(tabs)
    expect(state.activeTabId).toBe('nonexistent-tab-id')
  })
})

describe('debounced save', () => {
  afterEach(resetStore)

  test('save payload has correct shape with version field', () => {
    useTabStore.getState().addTab('/test', 'test-label')

    const state = useTabStore.getState()
    const payload = JSON.parse(
      JSON.stringify({
        version: 1,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    )

    expect(payload.version).toBe(1)
    expect(payload.tabs).toHaveLength(1)
    expect(payload.tabs[0].cwd).toBe('/test')
    expect(payload.tabs[0].label).toBe('test-label')
    expect(typeof payload.activeTabId).toBe('string')
  })

  test('JSON round-trip preserves tab data', () => {
    const originalTabs = [
      { id: 'tab-1', sessionId: 'sess-1', cwd: '/project', label: 'project' },
      { id: 'tab-2', sessionId: null, cwd: '/other', label: 'other', useWorktree: true },
    ]
    const originalActiveId = 'tab-1'

    const serialized = JSON.stringify({
      version: 1,
      tabs: originalTabs,
      activeTabId: originalActiveId,
    })
    const parsed = JSON.parse(serialized)

    useTabStore.getState().restoreTabs(parsed.tabs, parsed.activeTabId)

    const state = useTabStore.getState()
    expect(state.tabs).toEqual(originalTabs)
    expect(state.activeTabId).toBe(originalActiveId)
  })
})
