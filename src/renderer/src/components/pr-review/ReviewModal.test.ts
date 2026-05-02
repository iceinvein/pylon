import { describe, expect, test } from 'bun:test'
import { DEFAULT_REVIEW_FOCUS } from './ReviewModal'

describe('ReviewModal defaults', () => {
  test('selects architecture by default and leaves style opt-in', () => {
    expect(DEFAULT_REVIEW_FOCUS).toContain('architecture')
    expect(DEFAULT_REVIEW_FOCUS).not.toContain('style')
  })
})
