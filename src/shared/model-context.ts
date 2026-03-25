/**
 * Known context window sizes per model.
 *
 * These serve as a **floor** — the SDK's reported `contextWindow` may lag behind
 * actual API capabilities (e.g. Opus 1M announced but SDK still reports 200K).
 * Consumers should use `Math.max(sdkReported, KNOWN_CONTEXT_WINDOWS[model])`.
 */
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  // Claude
  'claude-opus-4-6': 1_000_000,
  'claude-opus-4-20250514': 1_000_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-3-20250307': 200_000,
  // Codex / OpenAI
  'gpt-5.4': 1_000_000,
  'gpt-5.4-mini': 400_000,
  'gpt-5.3-codex': 200_000,
  'gpt-5.3-codex-spark': 200_000,
}

/**
 * Known max output token limits per model.
 *
 * Same floor strategy as KNOWN_CONTEXT_WINDOWS — the SDK's reported
 * `maxOutputTokens` may lag behind actual capability.
 */
export const KNOWN_MAX_OUTPUT_TOKENS: Record<string, number> = {
  // Claude — 128K max output on all current models
  'claude-opus-4-6': 128_000,
  'claude-opus-4-20250514': 128_000,
  'claude-sonnet-4-6': 64_000,
  'claude-sonnet-4-20250514': 64_000,
  'claude-haiku-4-5': 64_000,
  'claude-haiku-3-20250307': 64_000,
  // Codex / OpenAI
  'gpt-5.4': 128_000,
  'gpt-5.4-mini': 64_000,
  'gpt-5.3-codex': 64_000,
  'gpt-5.3-codex-spark': 32_000,
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

/**
 * Returns the best-known max output tokens for a model, taking the max of:
 *   1. SDK-reported value
 *   2. Our hardcoded known value
 *
 * Returns 0 if neither source has a value (unknown model, no SDK data yet).
 */
export function resolveMaxOutputTokens(model: string, sdkReported?: number): number {
  const known = KNOWN_MAX_OUTPUT_TOKENS[model] ?? 0
  if (!sdkReported || sdkReported <= 0) return known
  return Math.max(sdkReported, known)
}
