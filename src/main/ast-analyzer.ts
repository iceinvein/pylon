/**
 * AST analyzer module — uses the language registry and parser interface to parse source files,
 * extract declarations, and build import graphs across a project directory.
 *
 * The TypeScript-specific parsing logic has been extracted into ast-parsers/ts-parser.ts.
 * This module orchestrates file collection, caching, and import resolution.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AstNode, FileNode, ImportEdge, RepoGraph } from '../shared/types'
import { typescriptResolver } from './ast-parsers/import-resolvers/typescript'
import { getParseableExtensions, registerParser, registerResolver } from './ast-parsers/registry'
import { getLanguage, tsParser } from './ast-parsers/ts-parser'

// ── Register the TypeScript parser and resolver at module init ──

registerParser('typescript', tsParser)
registerResolver('typescript', typescriptResolver)

// ── Directories to skip when walking the file tree ──

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '.turbo'])

// ── Public API ──

/**
 * Parse a single file and return its FileNode with declarations and imports.
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
 * Parse a single file and return just the AstNode[] declarations (for drill-down view).
 */
export function parseFileAst(filePath: string): AstNode[] {
  return parseFile(filePath).declarations
}

// ── Caching ──

const fileCache = new Map<string, { mtime: number; result: FileNode }>()

/**
 * Parse a file with mtime-based caching to avoid re-parsing unchanged files.
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

// ── Recursive file collection ──

function collectFiles(dir: string): string[] {
  const parseableExtensions = getParseableExtensions()
  const results: string[] = []

  function walk(currentDir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(path.join(currentDir, entry.name))
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (parseableExtensions.has(ext)) {
          results.push(path.join(currentDir, entry.name))
        }
      }
    }
  }

  walk(dir)
  return results
}

/**
 * Recursively collect all parseable files in a directory, parse each, resolve relative
 * imports to absolute paths, and build a RepoGraph with FileNode[] and ImportEdge[].
 */
export function buildImportGraph(dir: string): RepoGraph {
  const filePaths = collectFiles(dir)
  const allFilesSet = new Set(filePaths)
  const files: FileNode[] = []
  const allEdges: ImportEdge[] = []

  for (const filePath of filePaths) {
    const fileNode = parseFileCached(filePath)
    files.push(fileNode)

    for (const imp of fileNode.imports) {
      const resolved = typescriptResolver.resolve(imp.target, filePath, allFilesSet)
      if (resolved) {
        allEdges.push({
          source: imp.source,
          target: resolved,
          specifiers: imp.specifiers,
        })
      }
      // Non-relative imports (node_modules, etc.) are excluded from edges
    }
  }

  return { files, edges: allEdges }
}

/**
 * Convenience wrapper that calls buildImportGraph.
 */
export function analyzeScope(dir: string): RepoGraph {
  return buildImportGraph(dir)
}
