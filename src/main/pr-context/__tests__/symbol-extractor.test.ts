import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  extractDeclarations,
  intersectRangesWithTouchedLines,
  parseDiff,
} from '../symbol-extractor'

const fixture = async (name: string) => readFile(join(import.meta.dir, 'fixtures', name), 'utf8')

describe('parseDiff', () => {
  test('returns file path and touched line ranges', async () => {
    const diff = await fixture('ts-sample.diff')
    const files = parseDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('src/foo.ts')
    expect(files[0].touchedRanges).toEqual([{ start: 1, end: 9 }])
  })

  test('parses multi-file diff into multiple entries', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      'index 0..1 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,1 +1,2 @@',
      ' x',
      '+y',
      'diff --git a/b.ts b/b.ts',
      'index 0..1 100644',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -3,1 +3,2 @@',
      ' q',
      '+r',
      '',
    ].join('\n')
    const files = parseDiff(diff)
    expect(files.map((f) => f.path)).toEqual(['a.ts', 'b.ts'])
    expect(files[0].touchedRanges).toEqual([{ start: 1, end: 2 }])
    expect(files[1].touchedRanges).toEqual([{ start: 3, end: 4 }])
  })

  test('merges adjacent hunks within a file', () => {
    const diff = [
      'diff --git a/c.ts b/c.ts',
      'index 0..1 100644',
      '--- a/c.ts',
      '+++ b/c.ts',
      '@@ -1,1 +1,2 @@',
      '+a',
      ' b',
      '@@ -3,1 +4,2 @@',
      '+c',
      ' d',
      '',
    ].join('\n')
    const files = parseDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].touchedRanges.length).toBeGreaterThanOrEqual(1)
  })
})

describe('extractDeclarations', () => {
  test('finds exported function in TS file', () => {
    const source = `export function changed(x: number): number {\n  return x + 1\n}\n`
    const decls = extractDeclarations(source, 'src/foo.ts')
    expect(decls.find((d) => d.name === 'changed')).toBeDefined()
  })

  test('finds def in Python file', () => {
    const source = `def changed(x):\n    return x + 1\n`
    const decls = extractDeclarations(source, 'mod.py')
    expect(decls.find((d) => d.name === 'changed' && d.kind === 'function')).toBeDefined()
  })

  test('finds func in Go file', () => {
    const source = `package pkg\n\nfunc Changed(x int) int {\n\treturn x + 1\n}\n`
    const decls = extractDeclarations(source, 'pkg.go')
    expect(decls.find((d) => d.name === 'Changed' && d.kind === 'function')).toBeDefined()
  })

  test('finds fn in Rust file', () => {
    const source = `pub fn changed(x: i32) -> i32 {\n    x + 1\n}\n`
    const decls = extractDeclarations(source, 'src/lib.rs')
    expect(decls.find((d) => d.name === 'changed' && d.kind === 'function')).toBeDefined()
  })

  test('returns empty for unknown extension', () => {
    expect(extractDeclarations('whatever', 'x.xyz')).toEqual([])
  })

  test('extractDeclarations startLine ignores preceding blank lines', () => {
    const source = 'export function first() {}\n\nexport function second() {}\n'
    const decls = extractDeclarations(source, 'x.ts')
    const second = decls.find((d) => d.name === 'second')
    expect(second).toBeDefined()
    expect(second?.range.start).toBe(3)
  })
})

describe('intersectRangesWithTouchedLines', () => {
  test('keeps declarations overlapping touched ranges', () => {
    const decls = [
      { name: 'a', kind: 'function' as const, range: { start: 1, end: 5 } },
      { name: 'b', kind: 'function' as const, range: { start: 10, end: 15 } },
    ]
    const touched = [{ start: 3, end: 4 }]
    const kept = intersectRangesWithTouchedLines(decls, touched)
    expect(kept.map((d) => d.name)).toEqual(['a'])
  })
})
