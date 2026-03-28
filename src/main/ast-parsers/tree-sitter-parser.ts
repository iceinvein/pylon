/**
 * Tree-sitter parser — implements async file parsing using web-tree-sitter
 * with S-expression query-based extraction for Rust, Python, Go, C, C++, Java, Ruby.
 */

import { log } from '../../shared/logger'
import type { AstNode, AstNodeType } from '../../shared/types'
import { getParserInstance, initTreeSitter, loadGrammarCached } from './grammar-manager'
import { QUERIES } from './language-queries'
import type { ParsedFile } from './types'

const plog = log.child('tree-sitter-parser')

// web-tree-sitter types are declared as `any` because the WASM module's
// runtime shape doesn't always match the TypeScript declarations.
// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter interop
type TSNode = any
// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter interop
type TSLanguage = any

// ── ID generator ──

let idCounter = 0

function resetIdCounter(): void {
  idCounter = 0
}

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

// ── Max child recursion depth ──

const MAX_CHILD_DEPTH = 6

// ── Capture name → AstNodeType mapping ──

function captureNameToNodeType(name: string): AstNodeType {
  switch (name) {
    case 'function':
      return 'function'
    case 'class':
      return 'class'
    case 'type':
      return 'type'
    case 'variable':
      return 'variable'
    case 'import':
      return 'import'
    case 'expression':
      return 'expression'
    case 'statement':
      return 'statement'
    default:
      return 'other'
  }
}

// ── Extract children (control flow) from a tree-sitter node ──

function extractControlFlow(
  node: TSNode,
  language: TSLanguage,
  lang: string,
  filePath: string,
  depth: number,
): AstNode[] {
  if (depth >= MAX_CHILD_DEPTH) return []

  const queries = QUERIES[lang]
  if (!queries?.controlFlow) return []

  try {
    const query = language.query(queries.controlFlow)
    const matches = query.matches(node)
    const children: AstNode[] = []

    for (const match of matches) {
      let nameText = ''
      let declNode: TSNode = null
      let nodeType: AstNodeType = 'other'

      for (const capture of match.captures) {
        if (capture.name === 'name') {
          nameText = capture.node.text?.slice(0, 60) || ''
        } else {
          declNode = capture.node
          nodeType = captureNameToNodeType(capture.name)
        }
      }

      if (!declNode) continue

      // Avoid duplicates: only include nodes that are direct descendants
      // of the given node (not deeply nested ones)
      if (declNode.parent?.id !== node.id) {
        // Check one more level for blocks
        const grandparent = declNode.parent?.parent
        if (!grandparent || grandparent.id !== node.id) continue
      }

      if (!nameText && nodeType === 'statement') {
        nameText = declNode.type?.replace(/_/g, ' ') || 'unknown'
      }

      children.push({
        id: nextId(nodeType),
        type: nodeType,
        name: nameText || 'unknown',
        startLine: (declNode.startPosition?.row ?? 0) + 1,
        endLine: (declNode.endPosition?.row ?? 0) + 1,
        children: extractControlFlow(declNode, language, lang, filePath, depth + 1),
        filePath,
      })
    }

    return children
  } catch (err) {
    plog.warn(`controlFlow query failed for ${lang}:`, err)
    return []
  }
}

// ── Parse a file asynchronously ──

type ProgressCallback = (progress: number) => void

export async function parseFileAsync(
  lang: string,
  filePath: string,
  content: string,
  onProgress?: ProgressCallback,
): Promise<ParsedFile> {
  const emptyResult: ParsedFile = { declarations: [], imports: [] }

  const queries = QUERIES[lang]
  if (!queries) {
    plog.warn(`no queries defined for language: ${lang}`)
    return emptyResult
  }

  // Initialize tree-sitter if needed
  try {
    await initTreeSitter()
  } catch (err) {
    plog.error('failed to initialize tree-sitter:', err)
    return emptyResult
  }

  // Load grammar
  const language = await loadGrammarCached(lang, onProgress)
  if (!language) {
    plog.warn(`grammar not available for ${lang}`)
    return emptyResult
  }

  // Parse source code
  const parser = getParserInstance()
  parser.setLanguage(language)
  const tree = parser.parse(content)
  if (!tree) {
    plog.warn(`parse returned null for ${filePath}`)
    return emptyResult
  }

  resetIdCounter()

  // ── Extract declarations ──
  const declarations: AstNode[] = []

  try {
    const declQuery = language.query(queries.declarations)
    const matches = declQuery.matches(tree.rootNode)

    for (const match of matches) {
      let nameText = ''
      let declNode: TSNode = null
      let nodeType: AstNodeType = 'other'

      for (const capture of match.captures) {
        if (capture.name === 'name') {
          nameText = capture.node.text || ''
        } else {
          declNode = capture.node
          nodeType = captureNameToNodeType(capture.name)
        }
      }

      if (!declNode || !nameText) continue

      declarations.push({
        id: nextId(nodeType),
        type: nodeType,
        name: nameText,
        startLine: (declNode.startPosition?.row ?? 0) + 1,
        endLine: (declNode.endPosition?.row ?? 0) + 1,
        children: extractControlFlow(declNode, language, lang, filePath, 0),
        filePath,
      })
    }
  } catch (err) {
    plog.warn(`declarations query failed for ${lang}:`, err)
  }

  // ── Extract imports ──
  const imports: Array<{ moduleSpecifier: string; specifiers: string[] }> = []

  try {
    const importQuery = language.query(queries.imports)
    const matches = importQuery.matches(tree.rootNode)

    for (const match of matches) {
      let pathText = ''

      for (const capture of match.captures) {
        if (capture.name === 'path') {
          pathText = capture.node.text || ''
        }
      }

      if (!pathText) continue

      // Strip surrounding quotes if present
      const cleaned = pathText.replace(/^["']|["']$/g, '')

      imports.push({
        moduleSpecifier: cleaned,
        specifiers: [],
      })
    }
  } catch (err) {
    plog.warn(`imports query failed for ${lang}:`, err)
  }

  tree.delete()

  return { declarations, imports }
}
