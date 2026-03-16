import { formatTokens } from './utils'

export function getContextUsagePercent(inputTokens: number, contextWindow: number): number {
  if (contextWindow <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((inputTokens / contextWindow) * 100)))
}

type ContextColor = { bar: string; text: string }

export function getContextUsageColor(percent: number): ContextColor {
  if (percent >= 95) return { bar: 'bg-red-600', text: 'text-red-400' }
  if (percent >= 80) return { bar: 'bg-orange-600', text: 'text-orange-400' }
  if (percent >= 60) return { bar: 'bg-yellow-600', text: 'text-yellow-500' }
  return { bar: 'bg-stone-600', text: 'text-stone-500' }
}

export function formatContextUsage(inputTokens: number, contextWindow: number): string {
  return `${formatTokens(inputTokens)} / ${formatTokens(contextWindow)}`
}
