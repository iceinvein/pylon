import { describe, expect, test } from 'bun:test'
import type { ReviewFinding } from '../../shared/types'
import { deduplicateFindings, diceCoefficient, tokenize } from '../pr-review-dedupe'

const riskFor = (severity: ReviewFinding['severity']): ReviewFinding['risk'] => {
  switch (severity) {
    case 'blocker':
      return { impact: 'critical', likelihood: 'likely', confidence: 'high', action: 'must-fix' }
    case 'high':
      return { impact: 'high', likelihood: 'possible', confidence: 'medium', action: 'should-fix' }
    case 'low':
      return { impact: 'low', likelihood: 'unknown', confidence: 'medium', action: 'optional' }
    default:
      return { impact: 'medium', likelihood: 'possible', confidence: 'medium', action: 'consider' }
  }
}

const f = (overrides: Partial<ReviewFinding>): ReviewFinding => ({
  id: overrides.id ?? 'id',
  file: overrides.file ?? 'src/x.ts',
  line: overrides.line ?? 10,
  severity: overrides.severity ?? 'medium',
  risk: overrides.risk ?? riskFor(overrides.severity ?? 'medium'),
  title: overrides.title ?? 'Title',
  description: overrides.description ?? 'Description',
  domain: overrides.domain ?? null,
  posted: overrides.posted ?? false,
  postUrl: overrides.postUrl ?? null,
  threadId: overrides.threadId ?? null,
  statusInRun: overrides.statusInRun ?? 'new',
  carriedForward: overrides.carriedForward ?? false,
  sourceReviewId: overrides.sourceReviewId ?? null,
  suggestion: overrides.suggestion,
})

describe('tokenize', () => {
  test('lowercases, drops short tokens, drops stopwords', () => {
    const tokens = tokenize('SQL Injection in the user query')
    expect(tokens).toEqual(new Set(['sql', 'injection', 'user', 'query']))
  })

  test('strips punctuation', () => {
    const tokens = tokenize('Missing null-check on `userId`!')
    expect(tokens.has('missing')).toBe(true)
    expect(tokens.has('null')).toBe(true)
    expect(tokens.has('check')).toBe(true)
    expect(tokens.has('userid')).toBe(true)
  })
})

describe('diceCoefficient', () => {
  test('identical sets return 1', () => {
    const a = new Set(['x', 'y'])
    const b = new Set(['x', 'y'])
    expect(diceCoefficient(a, b)).toBe(1)
  })

  test('disjoint sets return 0', () => {
    expect(diceCoefficient(new Set(['x']), new Set(['y']))).toBe(0)
  })

  test('partial overlap', () => {
    const a = new Set(['sql', 'injection', 'query'])
    const b = new Set(['sql', 'injection', 'vulnerability'])
    // 2 * 2 / (3 + 3) = 0.667
    expect(diceCoefficient(a, b)).toBeCloseTo(2 / 3, 3)
  })

  test('two empty sets return 1', () => {
    expect(diceCoefficient(new Set(), new Set())).toBe(1)
  })

  test('one empty set returns 0', () => {
    expect(diceCoefficient(new Set(['x']), new Set())).toBe(0)
  })
})

describe('deduplicateFindings', () => {
  test('singleton groups pass through unchanged', () => {
    const input = [
      f({ id: '1', file: 'a.ts', line: 1, title: 'Foo' }),
      f({ id: '2', file: 'b.ts', line: 1, title: 'Bar' }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
    expect(result.map((r) => r.id).sort()).toEqual(['1', '2'])
  })

  test('findings on different lines are never compared', () => {
    const input = [
      f({ id: '1', file: 'a.ts', line: 10, title: 'SQL injection in query' }),
      f({ id: '2', file: 'a.ts', line: 20, title: 'SQL injection in query' }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
  })

  test('two similar titles on same file:line merge', () => {
    const input = [
      f({
        id: '1',
        file: 'a.ts',
        line: 5,
        title: 'SQL injection in query',
        domain: 'security',
        severity: 'blocker',
      }),
      f({
        id: '2',
        file: 'a.ts',
        line: 5,
        title: 'SQL injection vulnerability',
        domain: 'bugs',
        severity: 'high',
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('blocker')
    expect(result[0].id).toBe('1')
    expect(result[0].mergedFrom).toEqual([{ domain: 'bugs', title: 'SQL injection vulnerability' }])
    expect(result[0].description).toContain('Also flagged by: bugs')
  })

  test('different titles on same line stay separate', () => {
    const input = [
      f({ id: '1', file: 'a.ts', line: 5, title: 'Missing input validation' }),
      f({ id: '2', file: 'a.ts', line: 5, title: 'Inefficient string concatenation' }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
  })

  test('single shared word is not enough to merge', () => {
    // Only the word "handler" overlaps; min-overlap rule keeps them separate
    const input = [
      f({ id: '1', file: 'a.ts', line: 5, title: 'Type mismatch on handler' }),
      f({ id: '2', file: 'a.ts', line: 5, title: 'Race condition near handler' }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
  })

  test('three findings cluster into similar pair plus standalone', () => {
    const input = [
      f({ id: '1', file: 'a.ts', line: 5, title: 'XSS via unescaped HTML', domain: 'security' }),
      f({ id: '2', file: 'a.ts', line: 5, title: 'Unescaped HTML XSS risk', domain: 'bugs' }),
      f({
        id: '3',
        file: 'a.ts',
        line: 5,
        title: 'Inefficient regex compile',
        domain: 'performance',
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
    const merged = result.find((r) => r.mergedFrom)
    const standalone = result.find((r) => !r.mergedFrom)
    expect(merged).toBeDefined()
    expect(standalone?.id).toBe('3')
  })

  test('higher severity wins as primary', () => {
    const input = [
      f({
        id: 'low',
        file: 'a.ts',
        line: 5,
        title: 'Race condition in handler',
        severity: 'low',
      }),
      f({
        id: 'block',
        file: 'a.ts',
        line: 5,
        title: 'Race condition in handler',
        severity: 'blocker',
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('block')
    expect(result[0].severity).toBe('blocker')
  })

  test('suggestion is inherited from any clustered finding', () => {
    const input = [
      f({
        id: '1',
        file: 'a.ts',
        line: 5,
        title: 'Null pointer dereference',
        severity: 'blocker',
        suggestion: undefined,
      }),
      f({
        id: '2',
        file: 'a.ts',
        line: 5,
        title: 'Null pointer error',
        severity: 'high',
        suggestion: { body: 'Add null check', startLine: 5, endLine: 5 },
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(1)
    expect(result[0].suggestion?.body).toBe('Add null check')
  })

  test('same-domain merges do not list domain in mergedFrom', () => {
    const input = [
      f({
        id: '1',
        file: 'a.ts',
        line: 5,
        title: 'SQL injection in query',
        domain: 'security',
        severity: 'blocker',
      }),
      f({
        id: '2',
        file: 'a.ts',
        line: 5,
        title: 'SQL injection vulnerability',
        domain: 'security',
        severity: 'high',
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(1)
    expect(result[0].mergedFrom).toBeUndefined()
    expect(result[0].description).not.toContain('Also flagged by')
  })

  test('file-level findings (line=null) cluster on shared file', () => {
    const input = [
      f({ id: '1', file: 'a.ts', line: null, title: 'Missing error handling everywhere' }),
      f({ id: '2', file: 'a.ts', line: null, title: 'Lacks error handling throughout' }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(1)
  })

  test('near-line duplicates within ±3 with similar titles merge across anchors', () => {
    const input = [
      f({
        id: 'block',
        file: 'a.ts',
        line: 100,
        title: 'TOCTOU race condition between read and write',
        domain: 'security',
        severity: 'blocker',
      }),
      f({
        id: 'high',
        file: 'a.ts',
        line: 102,
        title: 'TOCTOU race between read and write',
        domain: 'bugs',
        severity: 'high',
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('block')
    expect(result[0].mergedFrom?.[0]?.domain).toBe('bugs')
  })

  test('near-line findings with unrelated titles do not merge', () => {
    const input = [
      f({ id: '1', file: 'a.ts', line: 100, title: 'TOCTOU race in lock acquire' }),
      f({ id: '2', file: 'a.ts', line: 102, title: 'Inefficient regex compile each call' }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
  })

  test('near-line findings outside the ±3 radius do not merge', () => {
    const input = [
      f({
        id: '1',
        file: 'a.ts',
        line: 100,
        title: 'TOCTOU race in lock acquire',
      }),
      f({
        id: '2',
        file: 'a.ts',
        line: 110,
        title: 'TOCTOU race in lock acquire',
      }),
    ]
    const result = deduplicateFindings(input)
    expect(result.length).toBe(2)
  })
})
