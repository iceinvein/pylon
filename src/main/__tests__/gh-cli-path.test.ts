import { describe, expect, test } from 'bun:test'
import { augmentExecutablePath, findKnownGhBinary } from '../gh-cli-path'

describe('gh-cli-path', () => {
  test('prepends common Homebrew directories to PATH', () => {
    expect(augmentExecutablePath('/usr/bin:/bin')).toBe(
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    )
  })

  test('keeps existing entries without duplicates', () => {
    expect(augmentExecutablePath('/usr/local/bin:/custom/bin')).toBe(
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/custom/bin',
    )
  })

  test('finds the first known gh binary that exists', () => {
    const found = findKnownGhBinary((candidate) => candidate === '/usr/local/bin/gh')
    expect(found).toBe('/usr/local/bin/gh')
  })

  test('returns null when no known gh binary exists', () => {
    expect(findKnownGhBinary(() => false)).toBeNull()
  })
})
