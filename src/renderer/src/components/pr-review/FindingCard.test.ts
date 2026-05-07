import { describe, expect, test } from 'bun:test'
import type { ReviewFinding } from '../../../../shared/types'
import { getSecondOpinionNotes } from './FindingCard'

const finding = (mergedFrom?: ReviewFinding['mergedFrom']): ReviewFinding => ({
  id: 'f1',
  file: 'src/app.ts',
  line: 10,
  severity: 'medium',
  risk: {
    impact: 'medium',
    likelihood: 'possible',
    confidence: 'medium',
    action: 'consider',
  },
  title: 'Finding',
  description: 'Observation: Something changed.',
  domain: 'bugs',
  posted: false,
  postUrl: null,
  threadId: null,
  statusInRun: 'new',
  carriedForward: false,
  sourceReviewId: null,
  mergedFrom,
})

describe('FindingCard second opinion notes', () => {
  test('extracts peer-review reasons for human review', () => {
    expect(
      getSecondOpinionNotes(
        finding([
          { domain: 'peer-review', title: 'anchor should point to the write' },
          { domain: 'bugs', title: 'duplicate from bug reviewer' },
        ]),
      ),
    ).toEqual(['anchor should point to the write'])
  })

  test('ignores empty peer-review reasons', () => {
    expect(getSecondOpinionNotes(finding([{ domain: 'peer-review', title: ' ' }]))).toEqual([])
  })
})
