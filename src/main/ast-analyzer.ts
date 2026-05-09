/**
 * AST analyzer module — uses the language registry and parser interface to parse source files,
 * extract declarations, and build import graphs across a project directory.
 *
 * Supports both synchronous TypeScript parsing (via ts-parser) and async tree-sitter
 * parsing for Rust, Python, Go, C, C++, Java, Ruby, Swift, Kotlin.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AstNode, FileNode, ImportEdge, RepoGraph } from '../shared/types'
import { fallbackResolver } from './ast-parsers/import-resolvers/fallback'
import { createGoResolver } from './ast-parsers/import-resolvers/go'
import { createPythonResolver } from './ast-parsers/import-resolvers/python'
import { createRustResolver } from './ast-parsers/import-resolvers/rust'
import { typescriptResolver } from './ast-parsers/import-resolvers/typescript'
import {
  getLanguageEntry,
  getParseableExtensions,
  getResolver,
  getTreeSitterLang,
  registerParser,
  registerResolver,
} from './ast-parsers/registry'
import { parseFileAsync } from './ast-parsers/tree-sitter-parser'
import { getLanguage, tsParser } from './ast-parsers/ts-parser'

// ── Register the TypeScript parser and resolver at module init ──

registerParser('typescript', tsParser)
registerResolver('typescript', typescriptResolver)

// ── Directories to skip when walking the file tree ──

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.cache',
  '.turbo',
  '.vite',
  '.output',
  '.parcel-cache',
  'coverage',
  '__pycache__',
  '.mypy_cache',
  'target', // Rust build output
  'vendor', // Go vendor
])

// ── Public API ──

/**
 * Parse a single TypeScript/JavaScript file and return its FileNode with declarations and imports.
 * This is the synchronous path — only for TS/JS files.
 */
export function parseFile(filePath: string): FileNode {
  const content = fs.readFileSync(filePath, 'utf-8')
  const parsed = tsParser.parseFile(filePath, content)

  const stat = fs.statSync(filePath)

  // Convert ParsedFile imports back to ImportEdge[] format for the FileNode
  const imports: ImportEdge[] = parsed.imports.map((imp) => ({
    source: filePath,
    target: imp.moduleSpecifier,
    specifiers: imp.specifiers,
  }))

  return {
    filePath,
    language: getLanguage(filePath),
    declarations: parsed.declarations,
    imports,
    size: stat.size,
    lastModified: stat.mtimeMs,
  }
}

/**
 * Parse a single file using the appropriate parser (tree-sitter for non-TS/JS, ts-parser for TS/JS).
 * Returns a FileNode. Async because tree-sitter parsing is async.
 */
export async function parseFileMulti(filePath: string): Promise<FileNode> {
  const ext = path.extname(filePath).toLowerCase()
  const entry = getLanguageEntry(ext)

  // Default to TS parser for TS/JS files
  if (!entry || entry.parserType === 'typescript') {
    return parseFile(filePath)
  }

  // Tree-sitter path
  const treeSitterLang = getTreeSitterLang(ext)
  if (!treeSitterLang) {
    // Shouldn't happen if registry is consistent, but fall back to empty
    return parseFile(filePath)
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const parsed = await parseFileAsync(treeSitterLang, filePath, content)
  const stat = fs.statSync(filePath)

  const imports: ImportEdge[] = parsed.imports.map((imp) => ({
    source: filePath,
    target: imp.moduleSpecifier,
    specifiers: imp.specifiers,
  }))

  return {
    filePath,
    language: entry.name,
    declarations: parsed.declarations,
    imports,
    size: stat.size,
    lastModified: stat.mtimeMs,
  }
}

/**
 * Parse a single file and return just the AstNode[] declarations (for drill-down view).
 */
export function parseFileAst(filePath: string): AstNode[] {
  return parseFile(filePath).declarations
}

export async function parseFileAstMulti(filePath: string): Promise<AstNode[]> {
  const parsed = await parseFileMulti(filePath)
  return parsed.declarations
}

// ── Caching ──

const fileCache = new Map<string, { mtime: number; result: FileNode }>()

/**
 * Parse a file with mtime-based caching to avoid re-parsing unchanged files.
 * Synchronous — only for TS/JS files.
 */
export function parseFileCached(filePath: string): FileNode {
  const stat = fs.statSync(filePath)
  const cached = fileCache.get(filePath)

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.result
  }

  const result = parseFile(filePath)
  fileCache.set(filePath, { mtime: stat.mtimeMs, result })
  return result
}

/**
 * Parse a file with mtime-based caching. Async — supports all languages.
 */
async function parseFileCachedMulti(filePath: string): Promise<FileNode> {
  const stat = fs.statSync(filePath)
  const cached = fileCache.get(filePath)

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.result
  }

  const result = await parseFileMulti(filePath)
  fileCache.set(filePath, { mtime: stat.mtimeMs, result })
  return result
}

// ── File filtering ──

type GitignoreRule = {
  pattern: string
  negated: boolean
  directoryOnly: boolean
  anchored: boolean
  hasSlash: boolean
}

/** Skip minified, bundled, generated, and declaration files */
function isMinifiedOrGenerated(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.bundle.js') ||
    lower.endsWith('.chunk.js') ||
    lower.endsWith('.d.ts') ||
    lower.endsWith('.d.mts') ||
    lower.endsWith('.map') ||
    lower.startsWith('chunk-') ||
    lower.startsWith('vendor-') ||
    lower.startsWith('polyfill')
  )
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function globToRegExp(pattern: string): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const next = pattern[i + 1]

    if (char === '*') {
      if (next === '*') {
        source += '.*'
        i++
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`)
}

function parseGitignore(content: string): GitignoreRule[] {
  const rules: GitignoreRule[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line.startsWith('\\#') || line.startsWith('\\!')) {
      line = line.slice(1)
    }

    const negated = line.startsWith('!')
    if (negated) line = line.slice(1)
    if (!line) continue

    const anchored = line.startsWith('/')
    if (anchored) line = line.slice(1)

    const directoryOnly = line.endsWith('/')
    if (directoryOnly) line = line.slice(0, -1)
    if (!line) continue

    rules.push({
      pattern: line,
      negated,
      directoryOnly,
      anchored,
      hasSlash: line.includes('/'),
    })
  }

  return rules
}

function loadGitignoreRules(rootDir: string): GitignoreRule[] {
  const gitignorePath = path.join(rootDir, '.gitignore')
  try {
    return parseGitignore(fs.readFileSync(gitignorePath, 'utf-8'))
  } catch {
    return []
  }
}

function matchesGitignoreRule(
  rule: GitignoreRule,
  relativePath: string,
  isDirectory: boolean,
): boolean {
  if (rule.directoryOnly && !isDirectory && !relativePath.startsWith(`${rule.pattern}/`)) {
    return false
  }

  const patternRe = globToRegExp(rule.pattern)

  if (rule.anchored || rule.hasSlash) {
    return patternRe.test(relativePath) || relativePath.startsWith(`${rule.pattern}/`)
  }

  const segments = relativePath.split('/')
  return segments.some((segment, index) => {
    if (!patternRe.test(segment)) return false
    return isDirectory || index === segments.length - 1 || rule.directoryOnly
  })
}

function isGitignored(
  rootDir: string,
  filePath: string,
  isDirectory: boolean,
  rules: GitignoreRule[],
): boolean {
  if (rules.length === 0) return false

  const relativePath = toPosixPath(path.relative(rootDir, filePath))
  if (!relativePath || relativePath.startsWith('..')) return false

  let ignored = false
  for (const rule of rules) {
    if (matchesGitignoreRule(rule, relativePath, isDirectory)) {
      ignored = !rule.negated
    }
  }
  return ignored
}

// ── Recursive file collection ──

function collectFiles(dir: string): string[] {
  const parseableExtensions = getParseableExtensions()
  const gitignoreRules = loadGitignoreRules(dir)
  const results: string[] = []

  function walk(currentDir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        // Skip ignored dirs and hidden dirs (e.g., .vite, .parcel-cache)
        if (
          !IGNORED_DIRS.has(entry.name) &&
          !entry.name.startsWith('.') &&
          !isGitignored(dir, fullPath, true, gitignoreRules)
        ) {
          walk(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (
          parseableExtensions.has(ext) &&
          !isMinifiedOrGenerated(entry.name) &&
          !isGitignored(dir, fullPath, false, gitignoreRules)
        ) {
          results.push(fullPath)
        }
      }
    }
  }

  walk(dir)
  return results
}

// ── Detect project type and register resolvers ──

function registerProjectResolvers(dir: string): void {
  // Detect Rust project
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    registerResolver('rust', createRustResolver(dir))
  }

  // Detect Python project (pyproject.toml, setup.py, or any .py files)
  if (
    fs.existsSync(path.join(dir, 'pyproject.toml')) ||
    fs.existsSync(path.join(dir, 'setup.py')) ||
    fs.existsSync(path.join(dir, 'setup.cfg'))
  ) {
    registerResolver('python', createPythonResolver(dir))
  } else {
    // Even without a manifest, register a Python resolver from project root
    registerResolver('python', createPythonResolver(dir))
  }

  // Detect Go project
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    registerResolver('go', createGoResolver(dir))
  }

  // Register fallback for languages without a dedicated resolver
  for (const langName of ['c', 'cpp', 'java', 'ruby', 'swift', 'kotlin']) {
    registerResolver(langName, fallbackResolver)
  }
}

/**
 * Recursively collect all parseable files in a directory, parse each, resolve
 * imports to absolute paths, and build a RepoGraph with FileNode[] and ImportEdge[].
 * Async to support tree-sitter parsing.
 */
export async function buildImportGraph(dir: string): Promise<RepoGraph> {
  const filePaths = collectFiles(dir)
  const allFilesSet = new Set(filePaths)
  const files: FileNode[] = []
  const allEdges: ImportEdge[] = []

  // Register language-specific resolvers based on project manifests
  registerProjectResolvers(dir)

  // Parse all files (mix of sync TS and async tree-sitter)
  for (const filePath of filePaths) {
    const fileNode = await parseFileCachedMulti(filePath)
    files.push(fileNode)
  }

  // Resolve imports to absolute paths using per-file resolvers
  for (const fileNode of files) {
    const ext = path.extname(fileNode.filePath).toLowerCase()
    const resolver = getResolver(ext)

    for (const imp of fileNode.imports) {
      const resolved = resolver.resolve(imp.target, fileNode.filePath, allFilesSet)
      if (resolved) {
        allEdges.push({
          source: imp.source,
          target: resolved,
          specifiers: imp.specifiers,
        })
      }
      // Unresolvable imports (external packages, stdlib, etc.) are excluded from edges
    }
  }

  return { files, edges: allEdges }
}

/**
 * Convenience wrapper that calls buildImportGraph.
 */
export async function analyzeScope(dir: string): Promise<RepoGraph> {
  return buildImportGraph(dir)
}
