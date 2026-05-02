import { describe, expect, test } from 'bun:test'
import type { ReviewFinding } from '../../../shared/types'
import {
  defaultVisibleFindings,
  reviewFindingQualityScore,
  shouldShowFindingByDefault,
  splitFindingsForReview,
} from './pr-review-presentation'

const finding = (overrides: Partial<ReviewFinding>): ReviewFinding => ({
  id: overrides.id ?? 'f1',
  file: overrides.file ?? 'src/app.ts',
  line: overrides.line ?? 10,
  severity: overrides.severity ?? 'medium',
  risk: overrides.risk ?? {
    impact: 'medium',
    likelihood: 'possible',
    confidence: 'medium',
    action: 'consider',
  },
  title: overrides.title ?? 'Finding',
  description:
    overrides.description ?? 'Observation: Something changed.\n\nWhy it matters: It breaks.',
  domain: overrides.domain ?? 'bugs',
  posted: overrides.posted ?? false,
  postUrl: overrides.postUrl ?? null,
  threadId: overrides.threadId ?? null,
  statusInRun: overrides.statusInRun ?? 'new',
  carriedForward: overrides.carriedForward ?? false,
  sourceReviewId: overrides.sourceReviewId ?? null,
  suggestion: overrides.suggestion,
  mergedFrom: overrides.mergedFrom,
})

describe('PR review presentation', () => {
  test('shows high confidence should-fix findings by default', () => {
    const f = finding({
      severity: 'medium',
      risk: {
        impact: 'medium',
        likelihood: 'possible',
        confidence: 'high',
        action: 'should-fix',
      },
    })

    expect(shouldShowFindingByDefault(f)).toBe(true)
  })

  test('hides optional and low-confidence findings by default', () => {
    expect(
      shouldShowFindingByDefault(
        finding({
          severity: 'high',
          risk: {
            impact: 'high',
            likelihood: 'possible',
            confidence: 'low',
            action: 'should-fix',
          },
        }),
      ),
    ).toBe(false)

    expect(
      shouldShowFindingByDefault(
        finding({
          severity: 'medium',
          risk: {
            impact: 'medium',
            likelihood: 'possible',
            confidence: 'high',
            action: 'optional',
          },
        }),
      ),
    ).toBe(false)
  })

  test('hides low-value language by default', () => {
    const f = finding({
      severity: 'high',
      risk: {
        impact: 'high',
        likelihood: 'likely',
        confidence: 'high',
        action: 'should-fix',
      },
      description: 'Observation: This is harmless.\n\nWhy it matters: No action needed.',
    })

    expect(shouldShowFindingByDefault(f)).toBe(false)
  })

  test('keeps only the strongest finding on a repeated anchor in the default list', () => {
    const strong = finding({
      id: 'strong',
      severity: 'high',
      risk: {
        impact: 'high',
        likelihood: 'likely',
        confidence: 'high',
        action: 'should-fix',
      },
      title: 'Actual crash',
    })
    const duplicate = finding({
      id: 'duplicate',
      severity: 'medium',
      risk: {
        impact: 'medium',
        likelihood: 'possible',
        confidence: 'high',
        action: 'should-fix',
      },
      title: 'Related maintainability note',
    })

    const split = splitFindingsForReview([duplicate, strong])

    expect(split.actionable.map((entry) => entry.finding.id)).toEqual(['strong'])
    expect(split.suggestions.map((entry) => entry.finding.id)).toEqual(['duplicate'])
  })

  test('sorts by quality score before display', () => {
    const low = finding({ id: 'low', severity: 'low' })
    const high = finding({
      id: 'high',
      severity: 'high',
      risk: {
        impact: 'high',
        likelihood: 'likely',
        confidence: 'high',
        action: 'should-fix',
      },
    })

    expect(reviewFindingQualityScore(high)).toBeGreaterThan(reviewFindingQualityScore(low))
    expect(defaultVisibleFindings([low, high]).map((f) => f.id)).toEqual(['high'])
  })
})
