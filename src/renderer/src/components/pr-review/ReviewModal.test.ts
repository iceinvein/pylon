import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_REVIEW_AGENT_EFFORT,
  DEFAULT_REVIEW_AGENT_MODEL,
  DEFAULT_REVIEW_FOCUS,
} from './ReviewModal'

describe('ReviewModal defaults', () => {
  test('selects architecture by default and leaves style opt-in', () => {
    expect(DEFAULT_REVIEW_FOCUS).toContain('architecture')
    expect(DEFAULT_REVIEW_FOCUS).not.toContain('style')
  })

  test('defaults to Claude Code for review agents', () => {
    expect(DEFAULT_REVIEW_AGENT_MODEL).toBe('claude-opus-4-7')
  })

  test('defaults PR review effort to high', () => {
    expect(DEFAULT_REVIEW_AGENT_EFFORT).toBe('high')
  })
})
