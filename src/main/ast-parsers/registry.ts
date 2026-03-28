/**
 * Language registry — maps file extensions to language metadata and parsers.
 * Provides extension-based lookup for parsers, resolvers, and language info.
 */
import type { ImportResolver, LanguageParser } from './types'

export type LanguageEntry = {
  extensions: string[]
  name: string
  parserType: 'typescript' | 'tree-sitter'
  treeSitterLang?: string
  tier: 1 | 2
}

// ── Language definitions ──

const LANGUAGES: LanguageEntry[] = [
  {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    name: 'typescript',
    parserType: 'typescript',
    tier: 1,
  },
  {
    extensions: ['.rs'],
    name: 'rust',
    parserType: 'tree-sitter',
    treeSitterLang: 'rust',
    tier: 1,
  },
  {
    extensions: ['.py'],
    name: 'python',
    parserType: 'tree-sitter',
    treeSitterLang: 'python',
    tier: 1,
  },
  {
    extensions: ['.go'],
    name: 'go',
    parserType: 'tree-sitter',
    treeSitterLang: 'go',
    tier: 1,
  },
  {
    extensions: ['.c', '.h'],
    name: 'c',
    parserType: 'tree-sitter',
    treeSitterLang: 'c',
    tier: 2,
  },
  {
    extensions: ['.cpp', '.hpp', '.cc', '.cxx'],
    name: 'cpp',
    parserType: 'tree-sitter',
    treeSitterLang: 'cpp',
    tier: 2,
  },
  {
    extensions: ['.java'],
    name: 'java',
    parserType: 'tree-sitter',
    treeSitterLang: 'java',
    tier: 2,
  },
  {
    extensions: ['.rb'],
    name: 'ruby',
    parserType: 'tree-sitter',
    treeSitterLang: 'ruby',
    tier: 2,
  },
  {
    extensions: ['.swift'],
    name: 'swift',
    parserType: 'tree-sitter',
    treeSitterLang: 'swift',
    tier: 2,
  },
  {
    extensions: ['.kt'],
    name: 'kotlin',
    parserType: 'tree-sitter',
    treeSitterLang: 'kotlin',
    tier: 2,
  },
]

// ── Extension → LanguageEntry map ──

const extMap = new Map<string, LanguageEntry>()

for (const lang of LANGUAGES) {
  for (const ext of lang.extensions) {
    extMap.set(ext, lang)
  }
}

// ── Parser registry ──

const parserRegistry = new Map<string, LanguageParser>()

export function registerParser(parserType: string, parser: LanguageParser): void {
  parserRegistry.set(parserType, parser)
}

export function getParser(ext: string): LanguageParser | null {
  const entry = extMap.get(ext)
  if (!entry) return null
  return parserRegistry.get(entry.parserType) ?? null
}

// ── Resolver registry ──

const resolverRegistry = new Map<string, ImportResolver>()

const fallbackResolver: ImportResolver = {
  resolve(_specifier: string, _fromFile: string, _allFiles: Set<string>): string | null {
    return null
  },
}

export function registerResolver(langName: string, resolver: ImportResolver): void {
  resolverRegistry.set(langName, resolver)
}

export function getResolver(ext: string): ImportResolver {
  const entry = extMap.get(ext)
  if (!entry) return fallbackResolver
  return resolverRegistry.get(entry.name) ?? fallbackResolver
}

// ── Query helpers ──

export function getLanguageEntry(ext: string): LanguageEntry | null {
  return extMap.get(ext) ?? null
}

export function getLanguageName(ext: string): string | null {
  return extMap.get(ext)?.name ?? null
}

export function getParseableExtensions(): Set<string> {
  const exts = new Set<string>()
  for (const lang of LANGUAGES) {
    for (const ext of lang.extensions) {
      exts.add(ext)
    }
  }
  return exts
}

export function getTreeSitterLang(ext: string): string | null {
  return extMap.get(ext)?.treeSitterLang ?? null
}
