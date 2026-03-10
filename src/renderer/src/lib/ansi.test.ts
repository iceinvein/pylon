import { describe, expect, test } from 'bun:test'
import { ansiToHtml, hasAnsiCodes } from './ansi'

describe('hasAnsiCodes', () => {
  test('returns true for text with ANSI escape codes', () => {
    expect(hasAnsiCodes('\x1b[31mred text\x1b[0m')).toBe(true)
    expect(hasAnsiCodes('\x1b[1mbold\x1b[0m')).toBe(true)
    expect(hasAnsiCodes('prefix \x1b[32mgreen\x1b[0m suffix')).toBe(true)
  })

  test('returns false for plain text', () => {
    expect(hasAnsiCodes('hello world')).toBe(false)
    expect(hasAnsiCodes('')).toBe(false)
    expect(hasAnsiCodes('no colors here')).toBe(false)
  })

  test('returns false for text with escaped brackets but no ANSI', () => {
    expect(hasAnsiCodes('[31m not really ansi')).toBe(false)
  })
})

describe('ansiToHtml', () => {
  test('converts ANSI color codes to HTML spans', () => {
    const result = ansiToHtml('\x1b[31mred\x1b[0m')
    expect(result).toContain('red')
    expect(result).toContain('<span')
  })

  test('passes through plain text unchanged', () => {
    expect(ansiToHtml('hello world')).toBe('hello world')
  })

  test('escapes HTML entities (XSS protection)', () => {
    const result = ansiToHtml('<script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })

  test('handles multiple color codes', () => {
    const result = ansiToHtml('\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m')
    expect(result).toContain('red')
    expect(result).toContain('green')
  })

  test('converts newlines to <br/>', () => {
    const result = ansiToHtml('line1\nline2')
    expect(result).toContain('<br/>')
  })
})
