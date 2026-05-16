import { describe, expect, test } from 'bun:test'
import type { PeerReviewSummaryItem } from '../../../../shared/types'
import {
  buildSummaryHeader,
  groupSummaryItems,
} from './SecondOpinionSummary'

const item = (kind: PeerReviewSummaryItem['kind'], title: string): PeerReviewSummaryItem => ({
  kind,
  findingId: `id-${title}`,
  findingTitle: title,
  reason: `because ${title}`,
})

describe('buildSummaryHeader', () => {
  test('renders updates and additions when both non-zero', () => {
    expect(buildSummaryHeader({ updates: 5, additions: 3, items: [] }, 'Codex')).toBe(
      'Codex second opinion - updated 5 findings, added 3 new findings',
    )
  })

  test('singularises counts of 1', () => {
    expect(buildSummaryHeader({ updates: 1, additions: 1, items: [] }, 'Codex')).toBe(
      'Codex second opinion - updated 1 finding, added 1 new finding',
    )
  })

  test('omits the side that is zero', () => {
    expect(buildSummaryHeader({ updates: 2, additions: 0, items: [] }, 'Codex')).toBe(
      'Codex second opinion - updated 2 findings',
    )
    expect(buildSummaryHeader({ updates: 0, additions: 4, items: [] }, 'Claude Code')).toBe(
      'Claude Code second opinion - added 4 new findings',
    )
  })
})

describe('groupSummaryItems', () => {
  test('splits items by kind preserving order', () => {
    const grouped = groupSummaryItems([
      item('update', 'a'),
      item('add', 'b'),
      item('update', 'c'),
    ])
    expect(grouped.updates.map((i) => i.findingTitle)).toEqual(['a', 'c'])
    expect(grouped.additions.map((i) => i.findingTitle)).toEqual(['b'])
  })
})
