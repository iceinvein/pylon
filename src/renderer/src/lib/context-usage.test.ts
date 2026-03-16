import { describe, expect, test } from 'bun:test'
import { formatContextUsage, getContextUsageColor, getContextUsagePercent } from './context-usage'

describe('getContextUsagePercent', () => {
  test('returns 0 when contextWindow is 0', () => {
    expect(getContextUsagePercent(50_000, 0)).toBe(0)
  })

  test('computes percentage correctly', () => {
    expect(getContextUsagePercent(100_000, 200_000)).toBe(50)
  })

  test('caps at 100', () => {
    expect(getContextUsagePercent(250_000, 200_000)).toBe(100)
  })

  test('clamps negative inputTokens to 0', () => {
    expect(getContextUsagePercent(-1, 200_000)).toBe(0)
  })
})

describe('getContextUsageColor', () => {
  test('returns neutral for 0-60%', () => {
    const result = getContextUsageColor(0)
    expect(result.bar).toBe('bg-stone-600')
    expect(result.text).toBe('text-stone-500')
  })

  test('returns neutral at 59%', () => {
    expect(getContextUsageColor(59).bar).toBe('bg-stone-600')
  })

  test('returns yellow for 60-80%', () => {
    expect(getContextUsageColor(60).bar).toBe('bg-yellow-600')
    expect(getContextUsageColor(79).text).toBe('text-yellow-500')
  })

  test('returns orange for 80-95%', () => {
    expect(getContextUsageColor(80).bar).toBe('bg-orange-600')
    expect(getContextUsageColor(94).text).toBe('text-orange-400')
  })

  test('returns red for 95%+', () => {
    expect(getContextUsageColor(95).bar).toBe('bg-red-600')
    expect(getContextUsageColor(100).text).toBe('text-red-400')
  })
})

describe('formatContextUsage', () => {
  test('formats both values with K suffix', () => {
    expect(formatContextUsage(87_000, 200_000)).toBe('87.0K / 200.0K')
  })

  test('formats small values without suffix', () => {
    expect(formatContextUsage(500, 200_000)).toBe('500 / 200.0K')
  })

  test('formats million-scale values', () => {
    expect(formatContextUsage(1_500_000, 2_000_000)).toBe('1.5M / 2.0M')
  })
})
