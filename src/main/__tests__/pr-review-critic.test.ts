import { describe, expect, test } from 'bun:test'
import type { ReviewFinding } from '../../shared/types'
import {
  applyCriticVerdicts,
  buildCriticPrompt,
  parseCriticVerdicts,
  partitionForCritic,
} from '../pr-review-critic'

const finding = (overrides: Partial<ReviewFinding> & { id: string }): ReviewFinding => ({
  id: overrides.id,
  file: overrides.file ?? 'src/x.ts',
  line: overrides.line === undefined ? 10 : overrides.line,
  severity: overrides.severity ?? 'medium',
  risk: overrides.risk ?? {
    impact: 'medium',
    likelihood: 'possible',
    confidence: 'medium',
    action: 'consider',
  },
  title: overrides.title ?? 'Title',
  description: overrides.description ?? 'Description',
  domain: overrides.domain ?? 'bugs',
  posted: overrides.posted ?? false,
  postUrl: overrides.postUrl ?? null,
  threadId: overrides.threadId ?? null,
  statusInRun: overrides.statusInRun ?? 'new',
  carriedForward: overrides.carriedForward ?? false,
  sourceReviewId: overrides.sourceReviewId ?? null,
  suggestion: overrides.suggestion,
})

describe('partitionForCritic', () => {
  test('auto-keeps blocker + must-fix + anchored findings', () => {
    const f = finding({
      id: 'auto-keep',
      severity: 'blocker',
      line: 42,
      risk: { impact: 'critical', likelihood: 'likely', confidence: 'high', action: 'must-fix' },
    })
    const { autoKept, candidates } = partitionForCritic([f])
    expect(autoKept).toHaveLength(1)
    expect(autoKept[0].id).toBe('auto-keep')
    expect(candidates).toHaveLength(0)
  })

  test('auto-keeps high + should-fix + anchored', () => {
    const f = finding({
      id: 'high-anchored',
      severity: 'high',
      line: 5,
      risk: { impact: 'high', likelihood: 'possible', confidence: 'medium', action: 'should-fix' },
    })
    expect(partitionForCritic([f]).autoKept).toHaveLength(1)
  })

  test('does not auto-keep when severity is medium', () => {
    const f = finding({
      id: 'medium',
      severity: 'medium',
      line: 5,
      risk: { impact: 'medium', likelihood: 'likely', confidence: 'high', action: 'should-fix' },
    })
    const { autoKept, candidates } = partitionForCritic([f])
    expect(autoKept).toHaveLength(0)
    expect(candidates).toHaveLength(1)
  })

  test('does not auto-keep when action is consider', () => {
    const f = finding({
      id: 'consider',
      severity: 'high',
      line: 5,
      risk: { impact: 'high', likelihood: 'possible', confidence: 'high', action: 'consider' },
    })
    expect(partitionForCritic([f]).candidates).toHaveLength(1)
  })

  test('does not auto-keep when line is null', () => {
    const f = finding({
      id: 'unanchored',
      severity: 'blocker',
      line: null,
      risk: { impact: 'critical', likelihood: 'likely', confidence: 'high', action: 'must-fix' },
    })
    expect(partitionForCritic([f]).candidates).toHaveLength(1)
  })

  test('partitions a mixed batch correctly', () => {
    const findings = [
      finding({
        id: 'a',
        severity: 'blocker',
        line: 1,
        risk: { impact: 'critical', likelihood: 'likely', confidence: 'high', action: 'must-fix' },
      }),
      finding({ id: 'b', severity: 'medium', line: 2 }),
      finding({ id: 'c', severity: 'low', line: 3 }),
      finding({
        id: 'd',
        severity: 'high',
        line: 4,
        risk: {
          impact: 'high',
          likelihood: 'possible',
          confidence: 'medium',
          action: 'should-fix',
        },
      }),
    ]
    const { autoKept, candidates } = partitionForCritic(findings)
    expect(autoKept.map((f) => f.id).sort()).toEqual(['a', 'd'])
    expect(candidates.map((f) => f.id).sort()).toEqual(['b', 'c'])
  })
})

describe('buildCriticPrompt', () => {
  test('emits compact candidates with required fields', () => {
    const f = finding({ id: 'cand-1', title: 'Foo', description: 'Bar', file: 'x.ts', line: 7 })
    const { userPrompt, systemPrompt } = buildCriticPrompt([f])

    expect(systemPrompt).toContain('senior code reviewer')
    expect(userPrompt).toContain('cand-1')
    expect(userPrompt).toContain('"file": "x.ts"')
    expect(userPrompt).toContain('"line": 7')
    expect(userPrompt).toContain('review-critic')
    expect(userPrompt).toContain('verdict')
  })

  test('does not include the original suggestion body to keep the prompt small', () => {
    const f = finding({
      id: 'cand-2',
      suggestion: { body: 'long replacement code goes here', startLine: 1, endLine: 1 },
    })
    const { userPrompt } = buildCriticPrompt([f])
    expect(userPrompt).not.toContain('long replacement code')
    expect(userPrompt).toContain('"hasSuggestion": true')
  })
})

describe('parseCriticVerdicts', () => {
  test('parses a fenced review-critic block', () => {
    const text = `Some preamble.

\`\`\`review-critic
[
  { "id": "a", "verdict": "keep", "reason": "concrete defect" },
  { "id": "b", "verdict": "drop", "reason": "stylistic" }
]
\`\`\`

trailing prose ignored.`
    const out = parseCriticVerdicts(text, new Set(['a', 'b']))
    expect(out.get('a')).toBe('keep')
    expect(out.get('b')).toBe('drop')
  })

  test('ignores ids not in the candidate set', () => {
    const text = `\`\`\`review-critic
[ { "id": "ghost", "verdict": "keep" } ]
\`\`\``
    const out = parseCriticVerdicts(text, new Set(['real']))
    expect(out.size).toBe(0)
  })

  test('ignores entries with malformed verdict', () => {
    const text = `\`\`\`review-critic
[ { "id": "a", "verdict": "maybe" }, { "id": "b", "verdict": "DROP" } ]
\`\`\``
    const out = parseCriticVerdicts(text, new Set(['a', 'b']))
    expect(out.has('a')).toBe(false)
    expect(out.get('b')).toBe('drop')
  })

  test('returns empty map on missing block', () => {
    expect(parseCriticVerdicts('no block here', new Set(['a'])).size).toBe(0)
  })

  test('returns empty map on broken JSON', () => {
    const text = '```review-critic\n[ not json ]\n```'
    expect(parseCriticVerdicts(text, new Set(['a'])).size).toBe(0)
  })

  test('falls back to bare JSON array when fence is missing', () => {
    const text = 'critic forgot the fence: [ { "id": "a", "verdict": "drop" } ] trailing'
    const out = parseCriticVerdicts(text, new Set(['a']))
    expect(out.get('a')).toBe('drop')
  })
})

describe('applyCriticVerdicts', () => {
  test('keeps auto-kept findings unconditionally', () => {
    const partition = {
      autoKept: [finding({ id: 'auto' })],
      candidates: [finding({ id: 'cand' })],
    }
    const verdicts = new Map<string, 'keep' | 'drop'>([['cand', 'drop']])
    const out = applyCriticVerdicts(partition, verdicts)
    expect(out.map((f) => f.id)).toEqual(['auto'])
  })

  test('drops candidates marked drop, keeps the rest', () => {
    const partition = {
      autoKept: [],
      candidates: [finding({ id: 'a' }), finding({ id: 'b' }), finding({ id: 'c' })],
    }
    const verdicts = new Map<string, 'keep' | 'drop'>([
      ['a', 'keep'],
      ['b', 'drop'],
    ])
    const out = applyCriticVerdicts(partition, verdicts)
    // c is missing from verdicts and defaults to keep so we never silently lose
    // findings on a transient parse failure.
    expect(out.map((f) => f.id).sort()).toEqual(['a', 'c'])
  })

  test('returns auto-kept findings unchanged when there are no candidates', () => {
    const partition = {
      autoKept: [finding({ id: 'a' }), finding({ id: 'b' })],
      candidates: [],
    }
    const out = applyCriticVerdicts(partition, new Map())
    expect(out.map((f) => f.id).sort()).toEqual(['a', 'b'])
  })
})
