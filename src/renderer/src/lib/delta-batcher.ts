/**
 * delta-batcher.ts
 *
 * Accumulates streaming text_delta events outside React and flushes them in a
 * single Zustand setState call at ~60fps via requestAnimationFrame.
 *
 * Keys prefixed with "subagent:" are routed to subagentStreaming.
 * All other keys are routed to streamingText.
 *
 * This is a pure module with no React dependencies.
 */

import { useSessionStore } from '../store/session-store'

const SUBAGENT_PREFIX = 'subagent:'

type StreamingState = {
  streamingText: Map<string, string>
  subagentStreaming: Map<string, string>
}

type StreamingUpdate = Partial<StreamingState>

export type DeltaBatcherDeps = {
  getState: () => StreamingState
  setState: (update: StreamingUpdate) => void
  scheduleFlush: (callback: () => void) => void
}

export class DeltaBatcher {
  private pendingDeltas: Map<string, string> = new Map()
  private rafScheduled = false
  private deps: DeltaBatcherDeps

  constructor(deps: DeltaBatcherDeps) {
    this.deps = deps
  }

  /**
   * Appends `text` to the pending accumulator for `key` and schedules a
   * flush if one is not already queued.
   */
  accumulate(key: string, text: string): void {
    const current = this.pendingDeltas.get(key) ?? ''
    this.pendingDeltas.set(key, current + text)

    if (!this.rafScheduled) {
      this.rafScheduled = true
      this.deps.scheduleFlush(() => this.rafFlush())
    }
  }

  /**
   * Immediately flushes all pending deltas into the store.
   *
   * Call this before clearing streaming text (e.g. clearStreamingText /
   * clearSubagentStream) so that no accumulated deltas are lost.
   */
  flush(): void {
    if (this.pendingDeltas.size === 0) return
    this.applyPendingDeltas()
    this.rafScheduled = false
  }

  /** Scheduled flush callback — runs at ~60fps in production. */
  private rafFlush(): void {
    this.rafScheduled = false
    this.applyPendingDeltas()
  }

  /**
   * Reads the current store state, merges all pending deltas into the
   * appropriate Maps, then commits a single setState. Clears pendingDeltas
   * afterwards.
   */
  private applyPendingDeltas(): void {
    if (this.pendingDeltas.size === 0) return

    const state = this.deps.getState()

    let nextStreamingText: Map<string, string> | null = null
    let nextSubagentStreaming: Map<string, string> | null = null

    for (const [key, delta] of this.pendingDeltas) {
      if (key.startsWith(SUBAGENT_PREFIX)) {
        const agentKey = key.slice(SUBAGENT_PREFIX.length)

        if (nextSubagentStreaming === null) {
          nextSubagentStreaming = new Map(state.subagentStreaming)
        }

        const current = nextSubagentStreaming.get(agentKey) ?? ''
        nextSubagentStreaming.set(agentKey, current + delta)
      } else {
        if (nextStreamingText === null) {
          nextStreamingText = new Map(state.streamingText)
        }

        const current = nextStreamingText.get(key) ?? ''
        nextStreamingText.set(key, current + delta)
      }
    }

    this.pendingDeltas.clear()

    const update: StreamingUpdate = {}
    if (nextStreamingText !== null) update.streamingText = nextStreamingText
    if (nextSubagentStreaming !== null) update.subagentStreaming = nextSubagentStreaming

    if (Object.keys(update).length > 0) {
      this.deps.setState(update)
    }
  }
}

// ---------------------------------------------------------------------------
// Default instance wired to the real store + requestAnimationFrame
// ---------------------------------------------------------------------------

const defaultBatcher = new DeltaBatcher({
  getState: () => useSessionStore.getState(),
  setState: (update) => useSessionStore.setState(update),
  scheduleFlush: (cb) => requestAnimationFrame(cb),
})

export function accumulateDelta(key: string, text: string): void {
  defaultBatcher.accumulate(key, text)
}

export function flushPendingDeltas(): void {
  defaultBatcher.flush()
}
