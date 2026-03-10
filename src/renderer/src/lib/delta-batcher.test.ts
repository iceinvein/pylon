import { beforeEach, describe, expect, test } from 'bun:test'
import { DeltaBatcher, type DeltaBatcherDeps } from './delta-batcher'

function createTestDeps() {
  const state = {
    streamingText: new Map<string, string>(),
    subagentStreaming: new Map<string, string>(),
  }
  const updates: Array<Partial<typeof state>> = []
  let scheduledCallbacks: Array<() => void> = []

  const deps: DeltaBatcherDeps = {
    getState: () => state,
    setState: (update) => {
      updates.push(update)
      if (update.streamingText) state.streamingText = update.streamingText
      if (update.subagentStreaming) state.subagentStreaming = update.subagentStreaming
    },
    scheduleFlush: (cb) => scheduledCallbacks.push(cb),
  }

  return {
    deps,
    state,
    updates,
    /** Simulate a rAF tick */
    tick: () => {
      const cbs = scheduledCallbacks
      scheduledCallbacks = []
      for (const cb of cbs) cb()
    },
    get scheduledCount() {
      return scheduledCallbacks.length
    },
  }
}

describe('DeltaBatcher', () => {
  let env: ReturnType<typeof createTestDeps>
  let batcher: DeltaBatcher

  beforeEach(() => {
    env = createTestDeps()
    batcher = new DeltaBatcher(env.deps)
  })

  test('schedules a flush on first accumulate', () => {
    batcher.accumulate('session-1', 'hello')
    expect(env.scheduledCount).toBe(1)
  })

  test('batches multiple deltas into a single scheduled flush', () => {
    batcher.accumulate('session-1', 'hello ')
    batcher.accumulate('session-1', 'world')
    expect(env.scheduledCount).toBe(1)
  })

  test('flushes accumulated deltas to store on tick', () => {
    batcher.accumulate('session-1', 'hello ')
    batcher.accumulate('session-1', 'world')

    env.tick()

    expect(env.updates).toHaveLength(1)
    expect(env.state.streamingText.get('session-1')).toBe('hello world')
  })

  test('routes subagent: prefixed keys to subagentStreaming', () => {
    batcher.accumulate('subagent:agent-1', 'agent text')

    env.tick()

    expect(env.state.subagentStreaming.get('agent-1')).toBe('agent text')
    expect(env.state.streamingText.has('agent-1')).toBe(false)
  })

  test('flush() writes immediately without waiting for tick', () => {
    batcher.accumulate('session-1', 'immediate')
    batcher.flush()

    expect(env.updates).toHaveLength(1)
    expect(env.state.streamingText.get('session-1')).toBe('immediate')
  })

  test('flush() is a no-op when nothing is pending', () => {
    batcher.flush()
    expect(env.updates).toHaveLength(0)
  })

  test('handles mixed regular and subagent deltas in one batch', () => {
    batcher.accumulate('session-1', 'regular')
    batcher.accumulate('subagent:agent-1', 'agent')

    env.tick()

    expect(env.state.streamingText.get('session-1')).toBe('regular')
    expect(env.state.subagentStreaming.get('agent-1')).toBe('agent')
  })

  test('appends to existing store values', () => {
    env.state.streamingText.set('session-1', 'existing ')

    batcher.accumulate('session-1', 'new')
    env.tick()

    expect(env.state.streamingText.get('session-1')).toBe('existing new')
  })

  test('handles multiple keys independently', () => {
    batcher.accumulate('session-1', 'first')
    batcher.accumulate('session-2', 'second')

    env.tick()

    expect(env.state.streamingText.get('session-1')).toBe('first')
    expect(env.state.streamingText.get('session-2')).toBe('second')
  })

  test('subsequent accumulate after tick schedules a new flush', () => {
    batcher.accumulate('session-1', 'batch1')
    env.tick()

    batcher.accumulate('session-1', ' batch2')
    expect(env.scheduledCount).toBe(1)

    env.tick()
    // The second tick should merge with the existing value from the first flush
    expect(env.state.streamingText.get('session-1')).toBe('batch1 batch2')
  })

  test('flush() cancels pending scheduled flush', () => {
    batcher.accumulate('session-1', 'data')
    expect(env.scheduledCount).toBe(1)

    batcher.flush()
    // The scheduled callback still exists but running it should be a no-op
    env.tick()

    // Only one setState call (from flush), not two
    expect(env.updates).toHaveLength(1)
  })
})
