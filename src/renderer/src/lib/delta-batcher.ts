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

/** Module-level accumulator — invisible to React between flushes. */
const pendingDeltas: Map<string, string> = new Map()

/** Whether a rAF flush has already been scheduled. */
let rafScheduled = false

/**
 * Appends `text` to the pending accumulator for `key` and schedules a
 * requestAnimationFrame flush if one is not already queued.
 */
export function accumulateDelta(key: string, text: string): void {
  const current = pendingDeltas.get(key) ?? ''
  pendingDeltas.set(key, current + text)

  if (!rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(rafFlush)
  }
}

/**
 * Immediately flushes all pending deltas into the Zustand store.
 *
 * Call this before clearing streaming text (e.g. clearStreamingText /
 * clearSubagentStream) so that no accumulated deltas are lost.
 */
export function flushPendingDeltas(): void {
  if (pendingDeltas.size === 0) return

  applyPendingDeltas()

  // Cancel a scheduled rAF flush — there is nothing left to flush.
  rafScheduled = false
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** rAF callback — runs at ~60fps. */
function rafFlush(): void {
  rafScheduled = false
  applyPendingDeltas()
}

/**
 * Reads the current store state, merges all pending deltas into the
 * appropriate Maps, then commits a single setState. Clears pendingDeltas
 * afterwards.
 */
function applyPendingDeltas(): void {
  if (pendingDeltas.size === 0) return

  const state = useSessionStore.getState()

  let nextStreamingText: Map<string, string> | null = null
  let nextSubagentStreaming: Map<string, string> | null = null

  for (const [key, delta] of pendingDeltas) {
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

  pendingDeltas.clear()

  // Build a partial update containing only the Maps that actually changed.
  const update: Partial<{
    streamingText: Map<string, string>
    subagentStreaming: Map<string, string>
  }> = {}

  if (nextStreamingText !== null) update.streamingText = nextStreamingText
  if (nextSubagentStreaming !== null) update.subagentStreaming = nextSubagentStreaming

  if (Object.keys(update).length > 0) {
    useSessionStore.setState(update)
  }
}
