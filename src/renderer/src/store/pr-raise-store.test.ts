import { beforeEach, describe, expect, test } from 'bun:test'
import { usePrRaiseStore } from './pr-raise-store'

describe('pr-raise-store', () => {
  beforeEach(() => {
    usePrRaiseStore.setState({ overlay: null })
  })

  test('initial state has null overlay', () => {
    expect(usePrRaiseStore.getState().overlay).toBeNull()
  })

  test('openOverlay sets sessionId and loading state', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    const state = usePrRaiseStore.getState()
    expect(state.overlay).not.toBeNull()
    expect(state.overlay?.sessionId).toBe('session-123')
    expect(state.overlay?.loading).toBe(true)
  })

  test('closeOverlay resets state', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    usePrRaiseStore.getState().closeOverlay()
    expect(usePrRaiseStore.getState().overlay).toBeNull()
  })

  test('setInfo updates overlay info', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    const info = {
      diff: 'diff content',
      files: [{ path: 'test.ts', status: 'modified', insertions: 5, deletions: 2 }],
      commits: [{ hash: 'abc123', message: 'test', timestamp: '2026-01-01' }],
      stats: { insertions: 5, deletions: 2, filesChanged: 1 },
      headBranch: 'claude/test',
      baseBranch: 'main',
      remote: 'origin',
      repoFullName: 'user/repo',
    }
    usePrRaiseStore.getState().setInfo(info)
    expect(usePrRaiseStore.getState().overlay?.info).toEqual(info)
    expect(usePrRaiseStore.getState().overlay?.loading).toBe(false)
  })

  test('setDescription updates overlay description', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    usePrRaiseStore.getState().setDescription({ title: 'feat: test', body: '## Summary' })
    expect(usePrRaiseStore.getState().overlay?.description?.title).toBe('feat: test')
  })

  test('setResult updates overlay result', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    usePrRaiseStore
      .getState()
      .setResult({ success: true, prUrl: 'https://github.com/pr/1', prNumber: 1 })
    expect(usePrRaiseStore.getState().overlay?.result?.success).toBe(true)
  })

  test('setError updates overlay error', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    usePrRaiseStore.getState().setError('Something went wrong')
    expect(usePrRaiseStore.getState().overlay?.error).toBe('Something went wrong')
    expect(usePrRaiseStore.getState().overlay?.loading).toBe(false)
  })

  test('setCreating updates overlay creating flag', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    expect(usePrRaiseStore.getState().overlay?.creating).toBe(false)
    usePrRaiseStore.getState().setCreating(true)
    expect(usePrRaiseStore.getState().overlay?.creating).toBe(true)
    usePrRaiseStore.getState().setCreating(false)
    expect(usePrRaiseStore.getState().overlay?.creating).toBe(false)
  })

  test('setCreating is a no-op when overlay is null', () => {
    usePrRaiseStore.getState().setCreating(true)
    expect(usePrRaiseStore.getState().overlay).toBeNull()
  })

  test('setError clears both loading and creating', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    usePrRaiseStore.getState().setCreating(true)
    usePrRaiseStore.getState().setError('oops')
    const overlay = usePrRaiseStore.getState().overlay
    expect(overlay?.error).toBe('oops')
    expect(overlay?.loading).toBe(false)
    expect(overlay?.creating).toBe(false)
  })

  test('setResult clears creating flag', () => {
    usePrRaiseStore.getState().openOverlay('session-123')
    usePrRaiseStore.getState().setCreating(true)
    usePrRaiseStore.getState().setResult({ success: false, error: 'failed' })
    expect(usePrRaiseStore.getState().overlay?.creating).toBe(false)
  })

  test('setters are no-ops when overlay is null', () => {
    usePrRaiseStore.getState().setInfo({} as unknown as import('../../../shared/types').PrRaiseInfo)
    expect(usePrRaiseStore.getState().overlay).toBeNull()

    usePrRaiseStore.getState().setDescription({ title: 'x', body: 'y' })
    expect(usePrRaiseStore.getState().overlay).toBeNull()

    usePrRaiseStore.getState().setResult({ success: true, prUrl: 'u', prNumber: 1 })
    expect(usePrRaiseStore.getState().overlay).toBeNull()

    usePrRaiseStore.getState().setError('err')
    expect(usePrRaiseStore.getState().overlay).toBeNull()
  })
})
