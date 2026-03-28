/**
 * TypeScript/JavaScript parser — implements LanguageParser using the TypeScript compiler API.
 * Extracts declarations (functions, classes, types, variables) and imports from TS/JS/TSX/JSX files.
 */
import * as path from 'node:path'
import ts from 'typescript'
import type { AstNode, AstNodeType, ImportEdge } from '../../shared/types'
import type { LanguageParser, ParsedFile } from './types'

// ── ID generator ──

let idCounter = 0

export function resetIdCounter(): void {
  idCounter = 0
}

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

// ── Max child recursion depth ──

const MAX_CHILD_DEPTH = 6

// ── Helpers ──

export function getScriptKind(filePath: string): ts.ScriptKind {
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

export function getLanguage(filePath: string): string {
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

export function getLineSpan(
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

export function extractDeclarations(sourceFile: ts.SourceFile, filePath: string): AstNode[] {
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

export function extractImports(sourceFile: ts.SourceFile, filePath: string): ImportEdge[] {
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

// ── LanguageParser implementation ──

export const tsParser: LanguageParser = {
  parseFile(filePath: string, content: string): ParsedFile {
    resetIdCounter()
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
    return {
      declarations,
      imports: imports.map((i) => ({ moduleSpecifier: i.target, specifiers: i.specifiers })),
    }
  },
}
