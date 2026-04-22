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
    expect(files[0].touchedRanges.length).toBeGreaterThan(0)
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
