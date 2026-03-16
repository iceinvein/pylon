/**
 * Known context window sizes per model.
 *
 * These serve as a **floor** — the SDK's reported `contextWindow` may lag behind
 * actual API capabilities (e.g. Opus 1M announced but SDK still reports 200K).
 * Consumers should use `Math.max(sdkReported, KNOWN_CONTEXT_WINDOWS[model])`.
 */
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 1_000_000,
  'claude-opus-4-20250514': 1_000_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-3-20250307': 200_000,
}

const DEFAULT_CONTEXT_WINDOW = 200_000

/**
 * Returns the best-known context window for a model, taking the max of:
 *   1. SDK-reported value (may be stale/low)
 *   2. Our hardcoded known value (based on announcements/docs)
 *
 * This ensures the context indicator and token budgeting are never lower
 * than the actual capability, even when the SDK metadata lags.
 */
export function resolveContextWindow(model: string, sdkReported?: number): number {
  const known = KNOWN_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW
  if (!sdkReported || sdkReported <= 0) return known
  return Math.max(sdkReported, known)
}
