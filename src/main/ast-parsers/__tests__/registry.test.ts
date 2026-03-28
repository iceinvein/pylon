import { describe, expect, test } from 'bun:test'
import type { LanguageParser } from '../types'
import {
  getLanguageEntry,
  getLanguageName,
  getParseableExtensions,
  getParser,
  getResolver,
  getTreeSitterLang,
  registerParser,
  registerResolver,
} from '../registry'

// ── Helpers ──

const dummyParser: LanguageParser = {
  parseFile(_filePath: string, _content: string) {
    return { declarations: [], imports: [] }
  },
}

// We register once for the whole suite since the registry is module-level state
registerParser('typescript', dummyParser)

// ── getParser ──

describe('getParser', () => {
  test('returns registered parser for .ts', () => {
    expect(getParser('.ts')).toBe(dummyParser)
  })

  test('returns registered parser for .tsx', () => {
    expect(getParser('.tsx')).toBe(dummyParser)
  })

  test('returns registered parser for .js', () => {
    expect(getParser('.js')).toBe(dummyParser)
  })

  test('returns registered parser for .jsx', () => {
    expect(getParser('.jsx')).toBe(dummyParser)
  })

  test('returns null for unknown extension', () => {
    expect(getParser('.unknown')).toBeNull()
  })

  test('returns null for unregistered parser type (.rs without tree-sitter)', () => {
    // tree-sitter parser type is not registered, so .rs should return null
    expect(getParser('.rs')).toBeNull()
  })
})

// ── getParseableExtensions ──

describe('getParseableExtensions', () => {
  test('includes TS/JS extensions when typescript parser is registered', () => {
    const exts = getParseableExtensions()
    expect(exts.has('.ts')).toBe(true)
    expect(exts.has('.tsx')).toBe(true)
    expect(exts.has('.js')).toBe(true)
    expect(exts.has('.jsx')).toBe(true)
  })

  test('does not include tree-sitter-only extensions when tree-sitter is not registered', () => {
    const exts = getParseableExtensions()
    expect(exts.has('.rs')).toBe(false)
    expect(exts.has('.py')).toBe(false)
    expect(exts.has('.go')).toBe(false)
  })

  test('includes tree-sitter extensions after registering tree-sitter parser', () => {
    registerParser('tree-sitter', dummyParser)
    const exts = getParseableExtensions()
    expect(exts.has('.rs')).toBe(true)
    expect(exts.has('.py')).toBe(true)
    expect(exts.has('.go')).toBe(true)
    expect(exts.has('.c')).toBe(true)
    expect(exts.has('.java')).toBe(true)
    expect(exts.has('.rb')).toBe(true)
    expect(exts.has('.swift')).toBe(true)
    expect(exts.has('.kt')).toBe(true)
  })
})

// ── getLanguageName ──

describe('getLanguageName', () => {
  test('maps .ts to typescript', () => {
    expect(getLanguageName('.ts')).toBe('typescript')
  })

  test('maps .tsx to typescript', () => {
    expect(getLanguageName('.tsx')).toBe('typescript')
  })

  test('maps .js to typescript', () => {
    expect(getLanguageName('.js')).toBe('typescript')
  })

  test('maps .rs to rust', () => {
    expect(getLanguageName('.rs')).toBe('rust')
  })

  test('maps .py to python', () => {
    expect(getLanguageName('.py')).toBe('python')
  })

  test('maps .go to go', () => {
    expect(getLanguageName('.go')).toBe('go')
  })

  test('returns null for unknown extension', () => {
    expect(getLanguageName('.xyz')).toBeNull()
  })
})

// ── getLanguageEntry ──

describe('getLanguageEntry', () => {
  test('returns correct entry for .ts', () => {
    const entry = getLanguageEntry('.ts')
    expect(entry).not.toBeNull()
    expect(entry?.name).toBe('typescript')
    expect(entry?.parserType).toBe('typescript')
    expect(entry?.tier).toBe(1)
  })

  test('returns correct entry for .rs', () => {
    const entry = getLanguageEntry('.rs')
    expect(entry).not.toBeNull()
    expect(entry?.name).toBe('rust')
    expect(entry?.parserType).toBe('tree-sitter')
    expect(entry?.treeSitterLang).toBe('rust')
    expect(entry?.tier).toBe(1)
  })

  test('returns null for unknown extension', () => {
    expect(getLanguageEntry('.xyz')).toBeNull()
  })
})

// ── getTreeSitterLang ──

describe('getTreeSitterLang', () => {
  test('returns language name for tree-sitter languages', () => {
    expect(getTreeSitterLang('.rs')).toBe('rust')
    expect(getTreeSitterLang('.py')).toBe('python')
    expect(getTreeSitterLang('.go')).toBe('go')
    expect(getTreeSitterLang('.c')).toBe('c')
    expect(getTreeSitterLang('.java')).toBe('java')
  })

  test('returns null for non-tree-sitter languages', () => {
    expect(getTreeSitterLang('.ts')).toBeNull()
  })

  test('returns null for unknown extension', () => {
    expect(getTreeSitterLang('.xyz')).toBeNull()
  })
})

// ── getResolver ──

describe('getResolver', () => {
  test('returns fallback resolver for unknown extension', () => {
    const resolver = getResolver('.xyz')
    expect(resolver.resolve('foo', 'bar.xyz', new Set())).toBeNull()
  })

  test('returns fallback resolver when no resolver registered for language', () => {
    const resolver = getResolver('.ts')
    expect(resolver.resolve('./foo', '/src/bar.ts', new Set())).toBeNull()
  })

  test('returns registered resolver after registration', () => {
    const customResolver = {
      resolve(_specifier: string, _fromFile: string, _allFiles: Set<string>) {
        return '/resolved'
      },
    }
    registerResolver('typescript', customResolver)
    const resolver = getResolver('.ts')
    expect(resolver.resolve('./foo', '/src/bar.ts', new Set())).toBe('/resolved')
  })
})
