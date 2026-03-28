/**
 * AST analyzer module — uses the TypeScript compiler API to parse TS/JS/TSX/JSX files,
 * extract declarations, and build import graphs across a project directory.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
import type { AstNode, AstNodeType, FileNode, ImportEdge, RepoGraph } from '../shared/types'

// ── ID generator ──

let idCounter = 0

function resetIdCounter(): void {
  idCounter = 0
}

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

// ── Directories to skip when walking the file tree ──

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '.turbo'])

// ── File extensions we parse ──

const PARSEABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

// ── Import resolution extensions to try ──

const RESOLVE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
]

// ── Max child recursion depth ──

const MAX_CHILD_DEPTH = 6

// ── Helpers ──

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.js':
    case '.jsx':
      return 'javascript'
    default:
      return 'unknown'
  }
}

function getLineSpan(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { startLine: number; endLine: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
  return {
    startLine: start.line + 1,
    endLine: end.line + 1,
  }
}

// ── Structurally significant child detection ──

function isStructurallySignificant(node: ts.Node): boolean {
  return (
    ts.isBlock(node) ||
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isReturnStatement(node) ||
    ts.isCallExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isPropertyDeclaration(node)
  )
}

function nodeTypeForChild(node: ts.Node): AstNodeType {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return 'function'
  }
  if (
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return 'class'
  }
  if (ts.isBlock(node)) {
    return 'block'
  }
  if (ts.isCallExpression(node)) {
    return 'expression'
  }
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isReturnStatement(node)
  ) {
    return 'statement'
  }
  return 'other'
}

function nameForChild(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text
  }
  if (ts.isMethodDeclaration(node) && node.name) {
    return node.name.getText(sourceFile)
  }
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor'
  }
  if (ts.isPropertyDeclaration(node) && node.name) {
    return node.name.getText(sourceFile)
  }
  if (ts.isClassDeclaration(node) && node.name) {
    return node.name.text
  }
  if (ts.isCallExpression(node)) {
    return node.expression.getText(sourceFile).slice(0, 40)
  }
  if (ts.isIfStatement(node)) return 'if'
  if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node))
    return 'for'
  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) return 'while'
  if (ts.isSwitchStatement(node)) return 'switch'
  if (ts.isTryStatement(node)) return 'try'
  if (ts.isReturnStatement(node)) return 'return'
  if (ts.isBlock(node)) return 'block'
  return 'unknown'
}

function collectChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string,
  depth: number,
): AstNode[] {
  if (depth >= MAX_CHILD_DEPTH) return []

  const children: AstNode[] = []

  function walk(child: ts.Node): void {
    if (isStructurallySignificant(child)) {
      const span = getLineSpan(sourceFile, child)
      const childNode: AstNode = {
        id: nextId(nodeTypeForChild(child)),
        type: nodeTypeForChild(child),
        name: nameForChild(child, sourceFile),
        startLine: span.startLine,
        endLine: span.endLine,
        children: collectChildren(child, sourceFile, filePath, depth + 1),
        filePath,
      }
      children.push(childNode)
    } else {
      ts.forEachChild(child, walk)
    }
  }

  ts.forEachChild(node, walk)
  return children
}

// ── Extract declarations from a source file ──

function extractDeclarations(sourceFile: ts.SourceFile, filePath: string): AstNode[] {
  const declarations: AstNode[] = []

  function visit(node: ts.Node): void {
    // Function declarations (including exported)
    if (ts.isFunctionDeclaration(node) && node.name) {
      const span = getLineSpan(sourceFile, node)
      declarations.push({
        id: nextId('function'),
        type: 'function',
        name: node.name.text,
        startLine: span.startLine,
        endLine: span.endLine,
        children: collectChildren(node, sourceFile, filePath, 0),
        filePath,
      })
      return
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const span = getLineSpan(sourceFile, node)
      declarations.push({
        id: nextId('class'),
        type: 'class',
        name: node.name.text,
        startLine: span.startLine,
        endLine: span.endLine,
        children: collectChildren(node, sourceFile, filePath, 0),
        filePath,
      })
      return
    }

    // Type aliases
    if (ts.isTypeAliasDeclaration(node)) {
      const span = getLineSpan(sourceFile, node)
      declarations.push({
        id: nextId('type'),
        type: 'type',
        name: node.name.text,
        startLine: span.startLine,
        endLine: span.endLine,
        children: [],
        filePath,
      })
      return
    }

    // Interfaces
    if (ts.isInterfaceDeclaration(node)) {
      const span = getLineSpan(sourceFile, node)
      declarations.push({
        id: nextId('type'),
        type: 'type',
        name: node.name.text,
        startLine: span.startLine,
        endLine: span.endLine,
        children: [],
        filePath,
      })
      return
    }

    // Enums
    if (ts.isEnumDeclaration(node)) {
      const span = getLineSpan(sourceFile, node)
      declarations.push({
        id: nextId('type'),
        type: 'type',
        name: node.name.text,
        startLine: span.startLine,
        endLine: span.endLine,
        children: [],
        filePath,
      })
      return
    }

    // Variable statements (const/let/var)
    if (ts.isVariableStatement(node)) {
      const span = getLineSpan(sourceFile, node)
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          declarations.push({
            id: nextId('variable'),
            type: 'variable',
            name: decl.name.text,
            startLine: span.startLine,
            endLine: span.endLine,
            children: collectChildren(decl, sourceFile, filePath, 0),
            filePath,
          })
        }
      }
      return
    }

    // Export declarations wrapping other declarations (e.g., `export function ...`)
    if (ts.isExportDeclaration(node)) {
      return
    }

    // For export default or export assignment, skip
    if (ts.isExportAssignment(node)) {
      return
    }
  }

  ts.forEachChild(sourceFile, visit)
  return declarations
}

// ── Extract import edges from a source file ──

function extractImports(sourceFile: ts.SourceFile, filePath: string): ImportEdge[] {
  const imports: ImportEdge[] = []

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node)) return
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return

    const target = node.moduleSpecifier.text
    const specifiers: string[] = []

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        specifiers.push('default')
      }

      const bindings = node.importClause.namedBindings
      if (bindings) {
        if (ts.isNamespaceImport(bindings)) {
          specifiers.push(`* as ${bindings.name.text}`)
        } else if (ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            specifiers.push(el.name.text)
          }
        }
      }
    }

    imports.push({
      source: filePath,
      target,
      specifiers,
    })
  })

  return imports
}

// ── Public API ──

/**
 * Parse a single file and return its FileNode with declarations and imports.
 */
export function parseFile(filePath: string): FileNode {
  resetIdCounter()
  const content = fs.readFileSync(filePath, 'utf-8')
  const scriptKind = getScriptKind(filePath)
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )

  const declarations = extractDeclarations(sourceFile, filePath)
  const imports = extractImports(sourceFile, filePath)

  const stat = fs.statSync(filePath)

  return {
    filePath,
    language: getLanguage(filePath),
    declarations,
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

// ── Import resolution ──

function resolveImportTarget(importTarget: string, sourceDir: string): string | null {
  // Only resolve relative imports
  if (!importTarget.startsWith('.')) {
    return null
  }

  const basePath = path.resolve(sourceDir, importTarget)

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = basePath + ext
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }

  return null
}

// ── Recursive file collection ──

function collectFiles(dir: string): string[] {
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
        if (PARSEABLE_EXTENSIONS.has(ext)) {
          results.push(path.join(currentDir, entry.name))
        }
      }
    }
  }

  walk(dir)
  return results
}

/**
 * Recursively collect all TS/JS files in a directory, parse each, resolve relative
 * imports to absolute paths, and build a RepoGraph with FileNode[] and ImportEdge[].
 */
export function buildImportGraph(dir: string): RepoGraph {
  const filePaths = collectFiles(dir)
  const files: FileNode[] = []
  const allEdges: ImportEdge[] = []

  for (const filePath of filePaths) {
    const fileNode = parseFileCached(filePath)
    files.push(fileNode)

    const sourceDir = path.dirname(filePath)
    for (const imp of fileNode.imports) {
      const resolved = resolveImportTarget(imp.target, sourceDir)
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
