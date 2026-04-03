// src/renderer/src/lib/comparison.test.ts
import { describe, expect, test } from 'bun:test'
import type { TestFinding } from '../../../shared/types'
import { diffFindings } from './comparison'

const makeFinding = (overrides: Partial<TestFinding> & { title: string }): TestFinding => ({
  id: crypto.randomUUID(),
  explorationId: 'exp-1',
  description: 'desc',
  severity: 'medium',
  url: 'http://localhost:3000',
  screenshotPath: null,
  reproductionSteps: [],
  createdAt: Date.now(),
  ...overrides,
})

describe('diffFindings', () => {
  test('identifies new findings (in target only)', () => {
    const baseline: TestFinding[] = []
    const target = [makeFinding({ title: 'Bug A' })]
    const result = diffFindings(baseline, target)
    expect(result.new).toHaveLength(1)
    expect(result.new[0].title).toBe('Bug A')
    expect(result.resolved).toHaveLength(0)
    expect(result.unchanged).toHaveLength(0)
  })

  test('identifies resolved findings (in baseline only)', () => {
    const baseline = [makeFinding({ title: 'Bug A' })]
    const target: TestFinding[] = []
    const result = diffFindings(baseline, target)
    expect(result.resolved).toHaveLength(1)
    expect(result.resolved[0].title).toBe('Bug A')
    expect(result.new).toHaveLength(0)
  })

  test('identifies unchanged findings (in both)', () => {
    const baseline = [makeFinding({ title: 'Bug A' })]
    const target = [makeFinding({ title: 'Bug A' })]
    const result = diffFindings(baseline, target)
    expect(result.unchanged).toHaveLength(1)
    expect(result.unchanged[0].baseline.title).toBe('Bug A')
    expect(result.unchanged[0].target.title).toBe('Bug A')
    expect(result.new).toHaveLength(0)
    expect(result.resolved).toHaveLength(0)
  })

  test('matching is case-insensitive', () => {
    const baseline = [makeFinding({ title: 'Bug A' })]
    const target = [makeFinding({ title: 'bug a' })]
    const result = diffFindings(baseline, target)
    expect(result.unchanged).toHaveLength(1)
    expect(result.new).toHaveLength(0)
    expect(result.resolved).toHaveLength(0)
  })

  test('handles mixed scenario', () => {
    const baseline = [makeFinding({ title: 'Fixed bug' }), makeFinding({ title: 'Persistent bug' })]
    const target = [
      makeFinding({ title: 'Persistent bug' }),
      makeFinding({ title: 'New regression' }),
    ]
    const result = diffFindings(baseline, target)
    expect(result.resolved).toHaveLength(1)
    expect(result.resolved[0].title).toBe('Fixed bug')
    expect(result.unchanged).toHaveLength(1)
    expect(result.unchanged[0].baseline.title).toBe('Persistent bug')
    expect(result.new).toHaveLength(1)
    expect(result.new[0].title).toBe('New regression')
  })

  test('handles empty inputs', () => {
    const result = diffFindings([], [])
    expect(result.new).toHaveLength(0)
    expect(result.resolved).toHaveLength(0)
    expect(result.unchanged).toHaveLength(0)
  })
})
