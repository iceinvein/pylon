// src/renderer/src/lib/activity-format.test.ts
import { describe, expect, test } from 'bun:test'
import { formatActivityEntry } from './activity-format'

describe('formatActivityEntry', () => {
  test('formats browser_navigate', () => {
    const result = formatActivityEntry({
      type: 'tool_use',
      id: 'tu1',
      name: 'mcp__playwright__browser_navigate',
      input: { url: 'http://localhost:3000/login' },
    })
    expect(result).toEqual({
      id: 'tu1',
      toolName: 'browser_navigate',
      summary: 'Navigate → /login',
      highlight: null,
    })
  })

  test('formats browser_click', () => {
    const result = formatActivityEntry({
      type: 'tool_use',
      id: 'tu2',
      name: 'mcp__playwright__browser_click',
      input: { element: 'Submit button', ref: 'ref1' },
    })
    expect(result).toEqual({
      id: 'tu2',
      toolName: 'browser_click',
      summary: 'Click → "Submit button"',
      highlight: null,
    })
  })

  test('formats browser_snapshot', () => {
    const result = formatActivityEntry({
      type: 'tool_use',
      id: 'tu3',
      name: 'mcp__playwright__browser_snapshot',
      input: {},
    })
    expect(result).toEqual({
      id: 'tu3',
      toolName: 'browser_snapshot',
      summary: 'Snapshot',
      highlight: null,
    })
  })

  test('formats report_finding with finding highlight', () => {
    const result = formatActivityEntry({
      type: 'tool_use',
      id: 'tu4',
      name: 'mcp__pylon-testing__report_finding',
      input: { title: 'Empty password accepted', severity: 'high' },
    })
    expect(result).toEqual({
      id: 'tu4',
      toolName: 'report_finding',
      summary: 'Finding: Empty password accepted',
      highlight: 'finding',
    })
  })

  test('formats save_playwright_test with test highlight', () => {
    const result = formatActivityEntry({
      type: 'tool_use',
      id: 'tu5',
      name: 'mcp__pylon-testing__save_playwright_test',
      input: { filename: 'auth-login.spec.ts' },
    })
    expect(result).toEqual({
      id: 'tu5',
      toolName: 'save_playwright_test',
      summary: 'Test saved: auth-login.spec.ts',
      highlight: 'test',
    })
  })

  test('formats unknown tool generically', () => {
    const result = formatActivityEntry({
      type: 'tool_use',
      id: 'tu6',
      name: 'some_unknown_tool',
      input: { foo: 'bar' },
    })
    expect(result).toEqual({
      id: 'tu6',
      toolName: 'some_unknown_tool',
      summary: 'some_unknown_tool',
      highlight: null,
    })
  })

  test('returns null for non-tool_use messages', () => {
    const result = formatActivityEntry({ type: 'text', text: 'hello' })
    expect(result).toBeNull()
  })
})
