import { describe, expect, test } from 'bun:test'
import { formatCost, formatTokens, timeAgo } from './utils'

describe('formatTokens', () => {
  test('returns raw number below 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1)).toBe('1')
    expect(formatTokens(999)).toBe('999')
  })

  test('formats thousands with K suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0K')
    expect(formatTokens(1_500)).toBe('1.5K')
    expect(formatTokens(999_999)).toBe('1000.0K')
  })

  test('formats millions with M suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
    expect(formatTokens(10_000_000)).toBe('10.0M')
  })
})

describe('formatCost', () => {
  test('formats zero', () => {
    expect(formatCost(0)).toBe('$0.0000')
  })

  test('formats small amounts with 4 decimal places', () => {
    expect(formatCost(0.0001)).toBe('$0.0001')
    expect(formatCost(0.0123)).toBe('$0.0123')
  })

  test('formats larger amounts', () => {
    expect(formatCost(1.5)).toBe('$1.5000')
    expect(formatCost(99.99)).toBe('$99.9900')
  })
})

describe('timeAgo', () => {
  test('returns "just now" for recent timestamps', () => {
    expect(timeAgo(Date.now())).toBe('just now')
    expect(timeAgo(Date.now() - 30_000)).toBe('just now')
  })

  test('returns minutes ago', () => {
    expect(timeAgo(Date.now() - 60_000)).toBe('1m ago')
    expect(timeAgo(Date.now() - 5 * 60_000)).toBe('5m ago')
    expect(timeAgo(Date.now() - 59 * 60_000)).toBe('59m ago')
  })

  test('returns hours ago', () => {
    expect(timeAgo(Date.now() - 3_600_000)).toBe('1h ago')
    expect(timeAgo(Date.now() - 12 * 3_600_000)).toBe('12h ago')
    expect(timeAgo(Date.now() - 23 * 3_600_000)).toBe('23h ago')
  })

  test('returns days ago', () => {
    expect(timeAgo(Date.now() - 86_400_000)).toBe('1d ago')
    expect(timeAgo(Date.now() - 7 * 86_400_000)).toBe('7d ago')
    expect(timeAgo(Date.now() - 30 * 86_400_000)).toBe('30d ago')
  })
})
