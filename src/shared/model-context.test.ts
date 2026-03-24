import { describe, expect, test } from 'bun:test'
import { KNOWN_CONTEXT_WINDOWS, resolveContextWindow } from './model-context'

describe('model-context', () => {
  describe('KNOWN_CONTEXT_WINDOWS', () => {
    test('contains expected models', () => {
      expect(KNOWN_CONTEXT_WINDOWS['claude-opus-4-6']).toBe(1_000_000)
      expect(KNOWN_CONTEXT_WINDOWS['claude-sonnet-4-6']).toBe(200_000)
      expect(KNOWN_CONTEXT_WINDOWS['gpt-5.4']).toBe(1_000_000)
    })
  })

  describe('resolveContextWindow', () => {
    test('returns known value when sdkReported is undefined', () => {
      expect(resolveContextWindow('claude-opus-4-6')).toBe(1_000_000)
    })

    test('returns known value when sdkReported is 0', () => {
      expect(resolveContextWindow('claude-opus-4-6', 0)).toBe(1_000_000)
    })

    test('returns known value when sdkReported is negative', () => {
      expect(resolveContextWindow('claude-opus-4-6', -1)).toBe(1_000_000)
    })

    test('returns sdkReported when it exceeds known value', () => {
      expect(resolveContextWindow('claude-sonnet-4-6', 500_000)).toBe(500_000)
    })

    test('returns known value when sdkReported is lower', () => {
      expect(resolveContextWindow('claude-opus-4-6', 200_000)).toBe(1_000_000)
    })

    test('returns default (200K) for unknown model with no sdkReported', () => {
      expect(resolveContextWindow('unknown-model')).toBe(200_000)
    })

    test('returns sdkReported for unknown model when sdkReported exceeds default', () => {
      expect(resolveContextWindow('unknown-model', 500_000)).toBe(500_000)
    })

    test('returns default for unknown model when sdkReported is lower', () => {
      expect(resolveContextWindow('unknown-model', 100_000)).toBe(200_000)
    })
  })
})
