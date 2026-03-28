# Multi-Language AST Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the AST Visualizer to parse any programming language via web-tree-sitter with dynamic grammar loading, while keeping TS/JS on the native TypeScript compiler.

**Architecture:** A `LanguageParser` interface abstracts the two parser backends (TS compiler for JS/TS, tree-sitter for everything else). A grammar manager handles WASM lifecycle — bundled Tier 1 grammars (Rust, Python, Go) and CDN-fetched on-demand grammars cached to `~/.pylon/grammars/`. Import resolvers are language-specific (TS, Rust, Python, Go + fallback). The existing `ast-analyzer.ts` becomes a thin orchestrator that routes to the right parser per file extension.

**Tech Stack:** web-tree-sitter (WASM), tree-sitter-wasms (grammar CDN source), TypeScript compiler API (existing), smol-toml (optional phase)

**Spec:** `docs/plans/2026-03-28-multi-language-ast-design.md`

---

### Task 1: Parser Interface & Registry Skeleton

**Files:**
- Create: `src/main/ast-parsers/types.ts`
- Create: `src/main/ast-parsers/registry.ts`
- Test: `src/main/ast-parsers/__tests__/registry.test.ts`

- [ ] **Step 1: Write test for registry**

```ts
// src/main/ast-parsers/__tests__/registry.test.ts
import { test, expect, describe } from 'bun:test'
import { getParser, getParseableExtensions, getLanguageName } from '../registry'

describe('registry', () => {
  test('returns ts-parser for .ts extension', () => {
    const parser = getParser('.ts')
    expect(parser).not.toBeNull()
  })

  test('returns ts-parser for .tsx extension', () => {
    const parser = getParser('.tsx')
    expect(parser).not.toBeNull()
  })

  test('returns null for unknown extension', () => {
    const parser = getParser('.xyz')
    expect(parser).toBeNull()
  })

  test('getParseableExtensions includes .ts and .rs', () => {
    const exts = getParseableExtensions()
    expect(exts.has('.ts')).toBe(true)
    expect(exts.has('.tsx')).toBe(true)
    expect(exts.has('.js')).toBe(true)
    expect(exts.has('.jsx')).toBe(true)
    expect(exts.has('.rs')).toBe(true)
    expect(exts.has('.py')).toBe(true)
    expect(exts.has('.go')).toBe(true)
  })

  test('getLanguageName maps extensions to names', () => {
    expect(getLanguageName('.ts')).toBe('typescript')
    expect(getLanguageName('.rs')).toBe('rust')
    expect(getLanguageName('.py')).toBe('python')
    expect(getLanguageName('.go')).toBe('go')
    expect(getLanguageName('.xyz')).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/main/ast-parsers/__tests__/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create types.ts**

```ts
// src/main/ast-parsers/types.ts
import type { AstNode, ImportEdge } from '../../shared/types'

export type ParsedFile = {
  declarations: AstNode[]
  imports: Array<{ moduleSpecifier: string; specifiers: string[] }>
}

export type LanguageParser = {
  parseFile(filePath: string, content: string): ParsedFile
}

export type ImportResolver = {
  resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null
}
```

- [ ] **Step 4: Create registry.ts**

```ts
// src/main/ast-parsers/registry.ts
import type { LanguageParser, ImportResolver } from './types'

type LanguageEntry = {
  extensions: string[]
  name: string
  parserType: 'typescript' | 'tree-sitter'
  treeSitterLang?: string
  tier: 1 | 2
}

const LANGUAGES: LanguageEntry[] = [
  { extensions: ['.ts', '.tsx', '.js', '.jsx'], name: 'typescript', parserType: 'typescript', tier: 1 },
  { extensions: ['.rs'], name: 'rust', parserType: 'tree-sitter', treeSitterLang: 'rust', tier: 1 },
  { extensions: ['.py'], name: 'python', parserType: 'tree-sitter', treeSitterLang: 'python', tier: 1 },
  { extensions: ['.go'], name: 'go', parserType: 'tree-sitter', treeSitterLang: 'go', tier: 1 },
  { extensions: ['.c', '.h'], name: 'c', parserType: 'tree-sitter', treeSitterLang: 'c', tier: 2 },
  { extensions: ['.cpp', '.hpp', '.cc', '.cxx'], name: 'cpp', parserType: 'tree-sitter', treeSitterLang: 'cpp', tier: 2 },
  { extensions: ['.java'], name: 'java', parserType: 'tree-sitter', treeSitterLang: 'java', tier: 2 },
  { extensions: ['.rb'], name: 'ruby', parserType: 'tree-sitter', treeSitterLang: 'ruby', tier: 2 },
  { extensions: ['.swift'], name: 'swift', parserType: 'tree-sitter', treeSitterLang: 'swift', tier: 2 },
  { extensions: ['.kt'], name: 'kotlin', parserType: 'tree-sitter', treeSitterLang: 'kotlin', tier: 2 },
]

const extMap = new Map<string, LanguageEntry>()
for (const lang of LANGUAGES) {
  for (const ext of lang.extensions) {
    extMap.set(ext, lang)
  }
}

// Parser instances are registered lazily — populated by Task 2 (ts-parser) and Task 4 (tree-sitter)
const parsers = new Map<string, LanguageParser>()

export function registerParser(parserType: string, parser: LanguageParser): void {
  parsers.set(parserType, parser)
}

export function getParser(ext: string): LanguageParser | null {
  const entry = extMap.get(ext)
  if (!entry) return null
  return parsers.get(entry.parserType) ?? null
}

export function getLanguageEntry(ext: string): LanguageEntry | null {
  return extMap.get(ext) ?? null
}

export function getLanguageName(ext: string): string {
  return extMap.get(ext)?.name ?? 'unknown'
}

export function getParseableExtensions(): Set<string> {
  return new Set(extMap.keys())
}

export function getTreeSitterLang(ext: string): string | null {
  return extMap.get(ext)?.treeSitterLang ?? null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/main/ast-parsers/__tests__/registry.test.ts`
Expected: Most pass. The `getParser('.ts')` test may fail since no parser is registered yet — if so, skip that assertion for now (it will be wired in Task 2).

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/ast-parsers/types.ts src/main/ast-parsers/registry.ts src/main/ast-parsers/__tests__/registry.test.ts
git commit -m "feat(ast): add parser interface, language registry, and extension mapping"
```

---

### Task 2: Extract TypeScript Parser

**Files:**
- Create: `src/main/ast-parsers/ts-parser.ts`
- Create: `src/main/ast-parsers/import-resolvers/typescript.ts`
- Modify: `src/main/ast-analyzer.ts`
- Modify: `src/main/__tests__/ast-analyzer.test.ts`

- [ ] **Step 1: Extract ts-parser.ts from ast-analyzer.ts**

Move all TypeScript-compiler-specific code (parseFile, extractDeclarations, extractImports, helper functions) from `ast-analyzer.ts` into `src/main/ast-parsers/ts-parser.ts`, implementing the `LanguageParser` interface. The key change: the extracted `parseFile` takes `(filePath: string, content: string)` instead of reading the file itself.

Export a singleton `tsParser` that satisfies `LanguageParser`.

- [ ] **Step 2: Extract typescript.ts import resolver**

Move `resolveImportTarget` and `RESOLVE_EXTENSIONS` from `ast-analyzer.ts` into `src/main/ast-parsers/import-resolvers/typescript.ts`, implementing `ImportResolver`.

- [ ] **Step 3: Refactor ast-analyzer.ts to use registry**

`ast-analyzer.ts` becomes a thin orchestrator:
- Import `getParser`, `getParseableExtensions`, `getLanguageName`, `registerParser` from registry
- Import `tsParser` from ts-parser and register it: `registerParser('typescript', tsParser)`
- `collectFiles()` uses `getParseableExtensions()` instead of `PARSEABLE_EXTENSIONS`
- `parseFile()` calls `getParser(ext).parseFile(filePath, content)` where `ext = path.extname(filePath)`
- Import resolution calls the TypeScript resolver (for now — other resolvers come in Task 5)
- `FileNode.language` uses `getLanguageName(ext)`

- [ ] **Step 4: Run existing tests**

Run: `bun test src/main/__tests__/ast-analyzer.test.ts`
Expected: All 20 existing tests PASS — the refactor is purely structural, no behavior change

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ast-parsers/ts-parser.ts src/main/ast-parsers/import-resolvers/typescript.ts src/main/ast-analyzer.ts src/main/__tests__/ast-analyzer.test.ts
git commit -m "refactor(ast): extract TypeScript parser into LanguageParser interface"
```

---

### Task 3: Grammar Manager

**Files:**
- Create: `src/main/ast-parsers/grammar-manager.ts`
- Test: `src/main/ast-parsers/__tests__/grammar-manager.test.ts`

- [ ] **Step 1: Install web-tree-sitter**

Run: `bun add web-tree-sitter`

- [ ] **Step 2: Write tests for grammar manager**

```ts
// src/main/ast-parsers/__tests__/grammar-manager.test.ts
import { test, expect, describe, beforeEach, afterAll } from 'bun:test'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  initTreeSitter,
  loadGrammar,
  isGrammarCached,
  getCacheDir,
  setCacheDir,
  setResourceDir,
} from '../grammar-manager'

const testCacheDir = join(tmpdir(), `grammar-test-${Date.now()}`)

describe('grammar-manager', () => {
  beforeEach(() => {
    mkdirSync(testCacheDir, { recursive: true })
    setCacheDir(testCacheDir)
  })

  test('isGrammarCached returns false for uncached grammar', () => {
    expect(isGrammarCached('rust')).toBe(false)
  })

  test('isGrammarCached returns true when wasm file exists in cache', () => {
    writeFileSync(join(testCacheDir, 'tree-sitter-rust.wasm'), 'fake-wasm')
    expect(isGrammarCached('rust')).toBe(true)
  })

  test('getCacheDir returns the configured directory', () => {
    expect(getCacheDir()).toBe(testCacheDir)
  })
})

afterAll(() => {
  rmSync(testCacheDir, { recursive: true, force: true })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/main/ast-parsers/__tests__/grammar-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement grammar-manager.ts**

```ts
// src/main/ast-parsers/grammar-manager.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { log } from '../../shared/logger'

const logger = log.child('grammar-manager')

let cacheDir = join(homedir(), '.pylon', 'grammars')
let resourceDir = ''

// web-tree-sitter types
let Parser: any = null
let parserInstance: any = null

export function setCacheDir(dir: string): void {
  cacheDir = dir
}

export function getCacheDir(): string {
  return cacheDir
}

export function setResourceDir(dir: string): void {
  resourceDir = dir
}

/**
 * Initialize the web-tree-sitter runtime. Must be called once before loadGrammar.
 * The tree-sitter.wasm file must be in resourceDir or node_modules.
 */
export async function initTreeSitter(): Promise<void> {
  if (parserInstance) return

  const TreeSitter = (await import('web-tree-sitter')).default
  await TreeSitter.init()
  Parser = TreeSitter
  parserInstance = new TreeSitter()
  mkdirSync(cacheDir, { recursive: true })
  logger.info('web-tree-sitter initialized')
}

/**
 * Check if a grammar WASM file is cached locally.
 */
export function isGrammarCached(lang: string): boolean {
  return existsSync(join(cacheDir, `tree-sitter-${lang}.wasm`))
}

/**
 * Get the path to a bundled grammar (Tier 1: rust, python, go).
 * Returns null if not bundled.
 */
function getBundledGrammarPath(lang: string): string | null {
  if (!resourceDir) return null
  const bundledPath = join(resourceDir, 'grammars', `tree-sitter-${lang}.wasm`)
  return existsSync(bundledPath) ? bundledPath : null
}

/**
 * Load a grammar by name. Tries in order:
 * 1. Bundled (resources/grammars/)
 * 2. Cached (~/.pylon/grammars/)
 * 3. CDN download (jsdelivr)
 *
 * Returns the Language object for parser.setLanguage(), or null on failure.
 */
export async function loadGrammar(
  lang: string,
  onProgress?: (message: string) => void,
): Promise<any | null> {
  if (!Parser) {
    logger.error('Tree-sitter not initialized. Call initTreeSitter() first.')
    return null
  }

  // 1. Try bundled
  const bundledPath = getBundledGrammarPath(lang)
  if (bundledPath) {
    const wasmBytes = readFileSync(bundledPath)
    return Parser.Language.load(wasmBytes.buffer)
  }

  // 2. Try cache
  const cachePath = join(cacheDir, `tree-sitter-${lang}.wasm`)
  if (existsSync(cachePath)) {
    onProgress?.(`Loading ${lang} grammar...`)
    const wasmBytes = readFileSync(cachePath)
    return Parser.Language.load(wasmBytes.buffer)
  }

  // 3. Download from CDN
  const url = `https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out/tree-sitter-${lang}.wasm`
  onProgress?.(`Downloading ${lang} grammar...`)
  logger.info(`Downloading grammar: ${url}`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      logger.warn(`Failed to download ${lang} grammar: ${response.status}`)
      return null
    }
    const buffer = await response.arrayBuffer()
    // Cache for next time
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(cachePath, Buffer.from(buffer))
    logger.info(`Cached ${lang} grammar to ${cachePath}`)
    return Parser.Language.load(buffer)
  } catch (err) {
    logger.warn(`Failed to download ${lang} grammar:`, err)
    return null
  }
}

/**
 * Get the shared parser instance. Must call initTreeSitter() first.
 */
export function getParserInstance(): any {
  return parserInstance
}

// Grammar cache (in-memory, loaded Language objects)
const grammarCache = new Map<string, any>()

/**
 * Load a grammar with in-memory caching. Returns cached Language if already loaded.
 */
export async function loadGrammarCached(
  lang: string,
  onProgress?: (message: string) => void,
): Promise<any | null> {
  const cached = grammarCache.get(lang)
  if (cached) return cached

  const language = await loadGrammar(lang, onProgress)
  if (language) grammarCache.set(lang, language)
  return language
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/main/ast-parsers/__tests__/grammar-manager.test.ts`
Expected: PASS

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/ast-parsers/grammar-manager.ts src/main/ast-parsers/__tests__/grammar-manager.test.ts package.json bun.lock
git commit -m "feat(ast): add grammar manager with bundled/cached/CDN loading"
```

---

### Task 4: Tree-Sitter Parser with Query-Based Extraction

**Files:**
- Create: `src/main/ast-parsers/language-queries.ts`
- Create: `src/main/ast-parsers/tree-sitter-parser.ts`
- Test: `src/main/ast-parsers/__tests__/tree-sitter-parser.test.ts`

- [ ] **Step 1: Create language-queries.ts**

```ts
// src/main/ast-parsers/language-queries.ts

/**
 * Tree-sitter S-expression query patterns per language.
 * Each query captures declarations and imports using named captures:
 * @function, @class, @type, @variable, @import, @name, @path
 */

export type LanguageQueries = {
  declarations: string
  imports: string
  controlFlow: string
}

export const QUERIES: Record<string, LanguageQueries> = {
  rust: {
    declarations: `
      (function_item name: (identifier) @name) @function
      (struct_item name: (type_identifier) @name) @class
      (impl_item type: (type_identifier) @name) @class
      (enum_item name: (type_identifier) @name) @type
      (trait_item name: (type_identifier) @name) @type
      (type_item name: (type_identifier) @name) @type
      (const_item name: (identifier) @name) @variable
      (static_item name: (identifier) @name) @variable
    `,
    imports: `
      (use_declaration argument: (_) @path) @import
    `,
    controlFlow: `
      (if_expression) @statement
      (for_expression) @statement
      (while_expression) @statement
      (loop_expression) @statement
      (match_expression) @statement
      (return_expression) @statement
      (call_expression function: (_) @name) @expression
    `,
  },

  python: {
    declarations: `
      (function_definition name: (identifier) @name) @function
      (class_definition name: (identifier) @name) @class
    `,
    imports: `
      (import_statement name: (dotted_name) @path) @import
      (import_from_statement module_name: (dotted_name) @path) @import
      (import_from_statement module_name: (relative_import) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (while_statement) @statement
      (try_statement) @statement
      (return_statement) @statement
      (call) @expression
    `,
  },

  go: {
    declarations: `
      (function_declaration name: (identifier) @name) @function
      (method_declaration name: (field_identifier) @name) @function
      (type_declaration (type_spec name: (type_identifier) @name)) @type
      (var_declaration) @variable
      (const_declaration) @variable
    `,
    imports: `
      (import_spec path: (interpreted_string_literal) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (switch_statement) @statement
      (select_statement) @statement
      (return_statement) @statement
      (call_expression function: (_) @name) @expression
    `,
  },

  c: {
    declarations: `
      (function_definition declarator: (function_declarator declarator: (identifier) @name)) @function
      (struct_specifier name: (type_identifier) @name) @class
      (type_definition declarator: (type_identifier) @name) @type
      (declaration declarator: (init_declarator declarator: (identifier) @name)) @variable
    `,
    imports: `
      (preproc_include path: (_) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (while_statement) @statement
      (switch_statement) @statement
      (return_statement) @statement
      (call_expression function: (identifier) @name) @expression
    `,
  },

  cpp: {
    declarations: `
      (function_definition declarator: (function_declarator declarator: (identifier) @name)) @function
      (class_specifier name: (type_identifier) @name) @class
      (struct_specifier name: (type_identifier) @name) @class
      (type_definition declarator: (type_identifier) @name) @type
      (declaration declarator: (init_declarator declarator: (identifier) @name)) @variable
    `,
    imports: `
      (preproc_include path: (_) @path) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (while_statement) @statement
      (switch_statement) @statement
      (return_statement) @statement
      (call_expression function: (identifier) @name) @expression
    `,
  },

  java: {
    declarations: `
      (method_declaration name: (identifier) @name) @function
      (class_declaration name: (identifier) @name) @class
      (interface_declaration name: (identifier) @name) @type
      (enum_declaration name: (identifier) @name) @type
    `,
    imports: `
      (import_declaration) @import
    `,
    controlFlow: `
      (if_statement) @statement
      (for_statement) @statement
      (while_statement) @statement
      (switch_expression) @statement
      (return_statement) @statement
      (method_invocation name: (identifier) @name) @expression
    `,
  },

  ruby: {
    declarations: `
      (method name: (identifier) @name) @function
      (singleton_method name: (identifier) @name) @function
      (class name: (constant) @name) @class
      (module name: (constant) @name) @class
    `,
    imports: `
      (call method: (identifier) @method arguments: (argument_list (string (string_content) @path))) @import
    `,
    controlFlow: `
      (if) @statement
      (for) @statement
      (while) @statement
      (case) @statement
      (return) @statement
      (call method: (identifier) @name) @expression
    `,
  },
}

// C++ uses the same queries as C with additions — reuse c and extend
QUERIES.cpp = { ...QUERIES.c, ...QUERIES.cpp }
```

- [ ] **Step 2: Create tree-sitter-parser.ts**

```ts
// src/main/ast-parsers/tree-sitter-parser.ts
import type { AstNode, AstNodeType } from '../../shared/types'
import type { LanguageParser, ParsedFile } from './types'
import { getParserInstance, loadGrammarCached, initTreeSitter } from './grammar-manager'
import { QUERIES } from './language-queries'
import { log } from '../../shared/logger'

const logger = log.child('tree-sitter-parser')

const MAX_CHILD_DEPTH = 6
let idCounter = 0

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

function captureTypeToAstType(captureType: string): AstNodeType {
  switch (captureType) {
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
    case 'statement':
      return 'statement'
    case 'expression':
      return 'expression'
    default:
      return 'other'
  }
}

/**
 * Run a tree-sitter query and extract AstNode declarations.
 */
function extractDeclarations(
  tree: any,
  language: any,
  lang: string,
  filePath: string,
): AstNode[] {
  const queries = QUERIES[lang]
  if (!queries) return []

  const declarations: AstNode[] = []
  idCounter = 0

  try {
    const query = language.query(queries.declarations)
    const matches = query.matches(tree.rootNode)

    for (const match of matches) {
      let declNode: any = null
      let nameText = ''
      let astType: AstNodeType = 'other'

      for (const capture of match.captures) {
        if (capture.name === 'name') {
          nameText = capture.node.text
        } else {
          // The non-name capture is the declaration node itself
          declNode = capture.node
          astType = captureTypeToAstType(capture.name)
        }
      }

      if (!declNode) continue

      const children = extractControlFlow(tree, language, lang, filePath, declNode, 0)

      declarations.push({
        id: nextId(astType),
        type: astType,
        name: nameText || declNode.type,
        startLine: declNode.startPosition.row + 1,
        endLine: declNode.endPosition.row + 1,
        children,
        filePath,
      })
    }
  } catch (err) {
    logger.warn(`Query failed for ${lang}:`, err)
  }

  return declarations
}

/**
 * Extract control flow children from a node using the controlFlow query.
 */
function extractControlFlow(
  tree: any,
  language: any,
  lang: string,
  filePath: string,
  parentNode: any,
  depth: number,
): AstNode[] {
  if (depth >= MAX_CHILD_DEPTH) return []

  const queries = QUERIES[lang]
  if (!queries?.controlFlow) return []

  const children: AstNode[] = []

  try {
    const query = language.query(queries.controlFlow)
    const matches = query.matches(parentNode)

    for (const match of matches) {
      let stmtNode: any = null
      let nameText = ''
      let astType: AstNodeType = 'statement'

      for (const capture of match.captures) {
        if (capture.name === 'name') {
          nameText = capture.node.text
        } else {
          stmtNode = capture.node
          astType = captureTypeToAstType(capture.name)
        }
      }

      if (!stmtNode) continue

      // Only include direct children of this parent (not deeply nested ones)
      // Check that the statement is a direct descendant
      let isDirectChild = false
      let cursor = stmtNode.parent
      const maxWalk = 5
      for (let i = 0; i < maxWalk && cursor; i++) {
        if (cursor.id === parentNode.id) {
          isDirectChild = true
          break
        }
        cursor = cursor.parent
      }
      if (!isDirectChild) continue

      children.push({
        id: nextId(astType),
        type: astType,
        name: nameText || stmtNode.type.replace(/_/g, ' '),
        startLine: stmtNode.startPosition.row + 1,
        endLine: stmtNode.endPosition.row + 1,
        children: extractControlFlow(tree, language, lang, filePath, stmtNode, depth + 1),
        filePath,
      })
    }
  } catch {
    // Control flow query failure is non-fatal
  }

  return children
}

/**
 * Extract import statements from the tree.
 */
function extractImports(
  tree: any,
  language: any,
  lang: string,
): Array<{ moduleSpecifier: string; specifiers: string[] }> {
  const queries = QUERIES[lang]
  if (!queries?.imports) return []

  const imports: Array<{ moduleSpecifier: string; specifiers: string[] }> = []

  try {
    const query = language.query(queries.imports)
    const matches = query.matches(tree.rootNode)

    for (const match of matches) {
      let pathText = ''

      for (const capture of match.captures) {
        if (capture.name === 'path') {
          pathText = capture.node.text
            .replace(/^["'`]/, '')
            .replace(/["'`]$/, '')
        }
      }

      if (pathText) {
        imports.push({ moduleSpecifier: pathText, specifiers: [] })
      }
    }
  } catch (err) {
    logger.warn(`Import query failed for ${lang}:`, err)
  }

  return imports
}

/**
 * Create a tree-sitter based LanguageParser for a specific language.
 */
export function createTreeSitterParser(lang: string): LanguageParser {
  return {
    parseFile(filePath: string, content: string): ParsedFile {
      // This is called synchronously but grammar loading is async.
      // The grammar must be pre-loaded before calling this.
      // See parseFileAsync for the async version.
      throw new Error(
        `Synchronous parseFile not supported for tree-sitter. Use parseFileAsync for ${lang}.`,
      )
    },
  }
}

/**
 * Async parse — loads grammar if needed, then parses.
 * This is the primary entry point for tree-sitter parsing.
 */
export async function parseFileAsync(
  lang: string,
  filePath: string,
  content: string,
  onProgress?: (message: string) => void,
): Promise<ParsedFile> {
  await initTreeSitter()
  const language = await loadGrammarCached(lang, onProgress)

  if (!language) {
    logger.warn(`No grammar available for ${lang}, returning empty result`)
    return { declarations: [], imports: [] }
  }

  const parser = getParserInstance()
  parser.setLanguage(language)
  const tree = parser.parse(content)

  const declarations = extractDeclarations(tree, language, lang, filePath)
  const imports = extractImports(tree, language, lang)

  tree.delete()
  return { declarations, imports }
}
```

- [ ] **Step 3: Write tests**

```ts
// src/main/ast-parsers/__tests__/tree-sitter-parser.test.ts
import { test, expect, describe } from 'bun:test'
import { parseFileAsync } from '../tree-sitter-parser'

describe('tree-sitter-parser', () => {
  test('parses Rust function declarations', async () => {
    const code = `
fn main() {
    println!("Hello");
}

pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

struct Point {
    x: f64,
    y: f64,
}
`
    const result = await parseFileAsync('rust', 'test.rs', code)
    expect(result.declarations.length).toBeGreaterThanOrEqual(2)
    const mainFn = result.declarations.find((d) => d.name === 'main')
    expect(mainFn).toBeDefined()
    expect(mainFn!.type).toBe('function')
    const point = result.declarations.find((d) => d.name === 'Point')
    expect(point).toBeDefined()
    expect(point!.type).toBe('class')
  })

  test('parses Rust imports', async () => {
    const code = `
use std::io;
use crate::utils::helper;
use super::parent_mod;
`
    const result = await parseFileAsync('rust', 'test.rs', code)
    expect(result.imports.length).toBeGreaterThanOrEqual(2)
  })

  test('parses Python function and class declarations', async () => {
    const code = `
def greet(name):
    return f"Hello {name}"

class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        pass
`
    const result = await parseFileAsync('python', 'test.py', code)
    const greet = result.declarations.find((d) => d.name === 'greet')
    expect(greet).toBeDefined()
    expect(greet!.type).toBe('function')
    const animal = result.declarations.find((d) => d.name === 'Animal')
    expect(animal).toBeDefined()
    expect(animal!.type).toBe('class')
  })

  test('parses Python imports', async () => {
    const code = `
import os
from pathlib import Path
from . import sibling
from ..parent import helper
`
    const result = await parseFileAsync('python', 'test.py', code)
    expect(result.imports.length).toBeGreaterThanOrEqual(3)
  })

  test('parses Go function and type declarations', async () => {
    const code = `
package main

import "fmt"

func main() {
    fmt.Println("Hello")
}

func Add(a, b int) int {
    return a + b
}

type Point struct {
    X float64
    Y float64
}
`
    const result = await parseFileAsync('go', 'test.go', code)
    const mainFn = result.declarations.find((d) => d.name === 'main')
    expect(mainFn).toBeDefined()
    expect(mainFn!.type).toBe('function')
    const point = result.declarations.find((d) => d.name === 'Point')
    expect(point).toBeDefined()
    expect(point!.type).toBe('type')
  })

  test('parses Go imports', async () => {
    const code = `
package main

import (
    "fmt"
    "net/http"
    "myproject/internal/utils"
)
`
    const result = await parseFileAsync('go', 'test.go', code)
    expect(result.imports.length).toBeGreaterThanOrEqual(2)
  })

  test('returns empty result for unknown language', async () => {
    const result = await parseFileAsync('brainfuck', 'test.bf', '+++')
    expect(result.declarations).toEqual([])
    expect(result.imports).toEqual([])
  })
})
```

- [ ] **Step 4: Run tests**

Run: `bun test src/main/ast-parsers/__tests__/tree-sitter-parser.test.ts`
Expected: PASS (grammars downloaded from CDN on first run — may take a few seconds)

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ast-parsers/language-queries.ts src/main/ast-parsers/tree-sitter-parser.ts src/main/ast-parsers/__tests__/tree-sitter-parser.test.ts
git commit -m "feat(ast): add tree-sitter parser with query-based extraction for Rust/Python/Go"
```

---

### Task 5: Import Resolvers (Rust, Python, Go + Fallback)

**Files:**
- Create: `src/main/ast-parsers/import-resolvers/rust.ts`
- Create: `src/main/ast-parsers/import-resolvers/python.ts`
- Create: `src/main/ast-parsers/import-resolvers/go.ts`
- Create: `src/main/ast-parsers/import-resolvers/fallback.ts`
- Test: `src/main/ast-parsers/__tests__/import-resolvers.test.ts`

- [ ] **Step 1: Write tests for all resolvers**

```ts
// src/main/ast-parsers/__tests__/import-resolvers.test.ts
import { test, expect, describe, afterAll } from 'bun:test'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRustResolver } from '../import-resolvers/rust'
import { createPythonResolver } from '../import-resolvers/python'
import { createGoResolver } from '../import-resolvers/go'
import { fallbackResolver } from '../import-resolvers/fallback'

const testDir = join(tmpdir(), `resolver-test-${Date.now()}`)

function writeFile(relativePath: string, content: string = ''): string {
  const fullPath = join(testDir, relativePath)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content)
  return fullPath
}

const allFiles = new Set<string>()

function setup() {
  // Rust project
  writeFile('rust-project/Cargo.toml', '[package]\nname = "myapp"')
  allFiles.add(writeFile('rust-project/src/main.rs'))
  allFiles.add(writeFile('rust-project/src/utils.rs'))
  allFiles.add(writeFile('rust-project/src/utils/mod.rs'))
  allFiles.add(writeFile('rust-project/src/utils/helper.rs'))

  // Python project
  allFiles.add(writeFile('py-project/main.py'))
  allFiles.add(writeFile('py-project/utils/__init__.py'))
  allFiles.add(writeFile('py-project/utils/helper.py'))

  // Go project
  writeFile('go-project/go.mod', 'module myproject\n\ngo 1.21')
  allFiles.add(writeFile('go-project/main.go'))
  allFiles.add(writeFile('go-project/internal/utils/utils.go'))

  // Generic project
  allFiles.add(writeFile('generic/src/main.rb'))
  allFiles.add(writeFile('generic/src/helper.rb'))
}

setup()

describe('rust resolver', () => {
  const resolver = createRustResolver(join(testDir, 'rust-project'))

  test('resolves crate::utils to src/utils.rs or src/utils/mod.rs', () => {
    const result = resolver.resolve('crate::utils', join(testDir, 'rust-project/src/main.rs'), allFiles)
    expect(result).not.toBeNull()
    expect(result!.endsWith('utils.rs') || result!.endsWith('mod.rs')).toBe(true)
  })

  test('returns null for external crate', () => {
    const result = resolver.resolve('tokio::runtime', join(testDir, 'rust-project/src/main.rs'), allFiles)
    expect(result).toBeNull()
  })
})

describe('python resolver', () => {
  const resolver = createPythonResolver(join(testDir, 'py-project'))

  test('resolves relative import from .utils import helper', () => {
    const result = resolver.resolve('.utils.helper', join(testDir, 'py-project/main.py'), allFiles)
    expect(result).not.toBeNull()
    expect(result!).toContain('helper.py')
  })

  test('returns null for external package', () => {
    const result = resolver.resolve('numpy', join(testDir, 'py-project/main.py'), allFiles)
    expect(result).toBeNull()
  })
})

describe('go resolver', () => {
  const resolver = createGoResolver(join(testDir, 'go-project'))

  test('resolves internal package import', () => {
    const result = resolver.resolve('myproject/internal/utils', join(testDir, 'go-project/main.go'), allFiles)
    expect(result).not.toBeNull()
  })

  test('returns null for standard library', () => {
    const result = resolver.resolve('fmt', join(testDir, 'go-project/main.go'), allFiles)
    expect(result).toBeNull()
  })
})

describe('fallback resolver', () => {
  test('resolves relative path', () => {
    const result = fallbackResolver.resolve('./helper', join(testDir, 'generic/src/main.rb'), allFiles)
    expect(result).not.toBeNull()
  })

  test('returns null for non-relative', () => {
    const result = fallbackResolver.resolve('something', join(testDir, 'generic/src/main.rb'), allFiles)
    expect(result).toBeNull()
  })
})

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/main/ast-parsers/__tests__/import-resolvers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement rust.ts resolver**

```ts
// src/main/ast-parsers/import-resolvers/rust.ts
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ImportResolver } from '../types'

export function createRustResolver(projectRoot: string): ImportResolver {
  // Find the src directory (where Cargo.toml is)
  const srcDir = join(projectRoot, 'src')

  return {
    resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
      // crate:: → resolve from src dir
      if (specifier.startsWith('crate::')) {
        const parts = specifier.replace('crate::', '').split('::')
        return resolveRustPath(srcDir, parts, allFiles)
      }

      // self:: → resolve from current file's directory
      if (specifier.startsWith('self::')) {
        const parts = specifier.replace('self::', '').split('::')
        return resolveRustPath(dirname(fromFile), parts, allFiles)
      }

      // super:: → resolve from parent directory
      if (specifier.startsWith('super::')) {
        const parts = specifier.replace('super::', '').split('::')
        return resolveRustPath(dirname(dirname(fromFile)), parts, allFiles)
      }

      // External crate — unresolved
      return null
    },
  }
}

function resolveRustPath(baseDir: string, parts: string[], allFiles: Set<string>): string | null {
  // Try module.rs first, then module/mod.rs
  const modulePath = join(baseDir, ...parts)

  // Direct file: module.rs
  const directFile = modulePath + '.rs'
  if (allFiles.has(directFile)) return directFile

  // Directory module: module/mod.rs
  const modFile = join(modulePath, 'mod.rs')
  if (allFiles.has(modFile)) return modFile

  // Directory with same name file
  const dirFile = join(modulePath + '.rs')
  if (existsSync(dirFile)) return dirFile

  return null
}
```

- [ ] **Step 4: Implement python.ts resolver**

```ts
// src/main/ast-parsers/import-resolvers/python.ts
import { dirname, join } from 'node:path'
import type { ImportResolver } from '../types'

export function createPythonResolver(projectRoot: string): ImportResolver {
  return {
    resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
      // Relative import (starts with dots)
      if (specifier.startsWith('.')) {
        const dots = specifier.match(/^\.+/)![0].length
        const rest = specifier.slice(dots).split('.')
        let baseDir = dirname(fromFile)
        for (let i = 1; i < dots; i++) {
          baseDir = dirname(baseDir)
        }
        return resolvePythonPath(baseDir, rest.filter(Boolean), allFiles)
      }

      // Absolute import — try from project root
      const parts = specifier.split('.')
      const result = resolvePythonPath(projectRoot, parts, allFiles)
      if (result) return result

      // External package — unresolved
      return null
    },
  }
}

function resolvePythonPath(baseDir: string, parts: string[], allFiles: Set<string>): string | null {
  const modulePath = join(baseDir, ...parts)

  // Direct file: module.py
  const pyFile = modulePath + '.py'
  if (allFiles.has(pyFile)) return pyFile

  // Package: module/__init__.py
  const initFile = join(modulePath, '__init__.py')
  if (allFiles.has(initFile)) return initFile

  return null
}
```

- [ ] **Step 5: Implement go.ts resolver**

```ts
// src/main/ast-parsers/import-resolvers/go.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportResolver } from '../types'

// Go standard library packages (common ones — not exhaustive)
const GO_STDLIB = new Set([
  'fmt', 'os', 'io', 'log', 'net', 'net/http', 'strings', 'strconv',
  'sync', 'time', 'context', 'errors', 'math', 'sort', 'bytes', 'bufio',
  'encoding', 'encoding/json', 'encoding/xml', 'encoding/csv',
  'path', 'path/filepath', 'regexp', 'testing', 'flag',
  'crypto', 'crypto/sha256', 'crypto/tls', 'database/sql',
])

export function createGoResolver(projectRoot: string): ImportResolver {
  // Read module path from go.mod
  let modulePath = ''
  try {
    const goMod = readFileSync(join(projectRoot, 'go.mod'), 'utf-8')
    const match = goMod.match(/^module\s+(.+)$/m)
    if (match) modulePath = match[1].trim()
  } catch {
    // No go.mod found
  }

  return {
    resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
      // Standard library
      if (GO_STDLIB.has(specifier)) return null

      // Internal import (starts with module path)
      if (modulePath && specifier.startsWith(modulePath)) {
        const relativePath = specifier.slice(modulePath.length + 1) // +1 for the /
        const dirPath = join(projectRoot, relativePath)

        // Go packages are directories — find any .go file in that directory
        for (const file of allFiles) {
          if (file.startsWith(dirPath) && file.endsWith('.go')) {
            return file
          }
        }
      }

      // External module — unresolved
      return null
    },
  }
}
```

- [ ] **Step 6: Implement fallback.ts resolver**

```ts
// src/main/ast-parsers/import-resolvers/fallback.ts
import { dirname, resolve, extname } from 'node:path'
import type { ImportResolver } from '../types'

/**
 * Best-effort fallback resolver for languages without dedicated resolvers.
 * Only resolves relative paths (starts with . or /).
 */
export const fallbackResolver: ImportResolver = {
  resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      return null
    }

    const baseDir = dirname(fromFile)
    const resolved = resolve(baseDir, specifier)

    // Exact match
    if (allFiles.has(resolved)) return resolved

    // Try adding common extensions
    const ext = extname(fromFile) // Use same extension as source file
    const withExt = resolved + ext
    if (allFiles.has(withExt)) return withExt

    return null
  },
}
```

- [ ] **Step 7: Run tests**

Run: `bun test src/main/ast-parsers/__tests__/import-resolvers.test.ts`
Expected: PASS

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/main/ast-parsers/import-resolvers/ src/main/ast-parsers/__tests__/import-resolvers.test.ts
git commit -m "feat(ast): add import resolvers for Rust, Python, Go, and fallback"
```

---

### Task 6: Wire Multi-Language Parsing into ast-analyzer

**Files:**
- Modify: `src/main/ast-analyzer.ts`
- Modify: `src/main/ast-parsers/registry.ts`
- Test: `src/main/__tests__/ast-analyzer.test.ts` (add multi-language integration tests)

- [ ] **Step 1: Update registry to provide resolvers**

Add to `src/main/ast-parsers/registry.ts`:

```ts
import type { ImportResolver } from './types'
import { fallbackResolver } from './import-resolvers/fallback'

const resolvers = new Map<string, ImportResolver>()

export function registerResolver(lang: string, resolver: ImportResolver): void {
  resolvers.set(lang, resolver)
}

export function getResolver(ext: string): ImportResolver {
  const entry = extMap.get(ext)
  if (!entry) return fallbackResolver
  return resolvers.get(entry.name) ?? fallbackResolver
}
```

- [ ] **Step 2: Update ast-analyzer.ts for multi-language**

Modify `ast-analyzer.ts`:
- `collectFiles()` uses `getParseableExtensions()` for all supported extensions
- `buildImportGraph()` becomes `async` — tree-sitter parsing is async
- For each file: check extension, use `getParser(ext)` for TS/JS or `parseFileAsync(lang, ...)` for tree-sitter languages
- Import resolution uses `getResolver(ext)` per file
- `FileNode.language` uses `getLanguageName(ext)`
- On init: register TS parser, register Rust/Python/Go resolvers (by detecting project root from scope dir — look for Cargo.toml, go.mod, etc.)

`analyzeScope()` becomes `async` and the IPC handler already calls it with `await`.

- [ ] **Step 3: Add integration test**

Add to `src/main/__tests__/ast-analyzer.test.ts`:

```ts
describe('multi-language analyzeScope', () => {
  test('parses mixed TS + Python directory', async () => {
    writeTestFile('mixed/index.ts', 'export function main() { return 42 }')
    writeTestFile('mixed/helper.py', 'def helper():\n    return 42')
    const graph = await analyzeScope(join(testDir, 'mixed'))
    expect(graph.files.length).toBe(2)
    const tsFile = graph.files.find((f) => f.filePath.endsWith('.ts'))
    const pyFile = graph.files.find((f) => f.filePath.endsWith('.py'))
    expect(tsFile).toBeDefined()
    expect(tsFile!.language).toBe('typescript')
    expect(pyFile).toBeDefined()
    expect(pyFile!.language).toBe('python')
  })
})
```

- [ ] **Step 4: Run all tests**

Run: `bun test src/main/__tests__/ast-analyzer.test.ts`
Expected: All existing tests pass + new multi-language test passes

- [ ] **Step 5: Update IPC handler for async analyzeScope**

In `src/main/ipc-handlers.ts`, the `AST_ANALYZE_SCOPE` handler already uses `await` — just confirm `analyzeScope` is now exported as async and the handler calls `await analyzeScope(args.scope)`.

- [ ] **Step 6: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/ast-analyzer.ts src/main/ast-parsers/registry.ts src/main/__tests__/ast-analyzer.test.ts src/main/ipc-handlers.ts
git commit -m "feat(ast): wire multi-language parsing into analyzer with async tree-sitter"
```

---

### Task 7: Contextual Dependencies in CodePanel

**Files:**
- Modify: `src/renderer/src/components/ast/CodePanel.tsx`
- Modify: `src/renderer/src/store/ast-store.ts`

- [ ] **Step 1: Add external dependencies data to store**

The `FileNode.imports` already contains all imports. External deps are imports whose specifiers don't match any file in the `repoGraph`. Add a derived getter or compute inline in the CodePanel.

- [ ] **Step 2: Add "External Dependencies" section to CodePanel**

Below the file header in `CodePanel.tsx`, add a collapsible section:

```tsx
// Compute external deps from the selected file's imports vs graph files
const externalDeps = useMemo(() => {
  if (!selectedFile || !repoGraph) return []
  const fileNode = repoGraph.files.find((f) => f.filePath === selectedFile)
  if (!fileNode) return []
  const internalFiles = new Set(repoGraph.files.map((f) => f.filePath))
  const resolvedTargets = new Set(repoGraph.edges.filter((e) => e.source === selectedFile).map((e) => e.target))
  return fileNode.imports
    .filter((imp) => !resolvedTargets.has(imp.target))
    .map((imp) => imp.target)
}, [selectedFile, repoGraph])
```

Render as a collapsible section with package icon + name, muted styling. Only show when there are external deps. Use `ChevronDown`/`ChevronRight` from lucide for collapse toggle.

- [ ] **Step 3: Pass repoGraph to CodePanel**

Update `AstView.tsx` to pass `repoGraph` from the store to `CodePanel` as a prop (or read it directly from the store inside CodePanel).

- [ ] **Step 4: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ast/CodePanel.tsx src/renderer/src/pages/AstView.tsx
git commit -m "feat(ast): add contextual external dependencies section to CodePanel"
```

---

### Task 8: Bundle Tier 1 Grammars

**Files:**
- Create: `resources/grammars/` directory with WASM files
- Modify: `src/main/ast-parsers/grammar-manager.ts` (set resource dir from Electron app path)
- Modify: `src/main/ipc-handlers.ts` (init tree-sitter on app startup or first AST analysis)

- [ ] **Step 1: Download Tier 1 grammar WASM files**

```bash
mkdir -p resources/grammars
curl -L -o resources/grammars/tree-sitter-rust.wasm "https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out/tree-sitter-rust.wasm"
curl -L -o resources/grammars/tree-sitter-python.wasm "https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out/tree-sitter-python.wasm"
curl -L -o resources/grammars/tree-sitter-go.wasm "https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out/tree-sitter-go.wasm"
```

- [ ] **Step 2: Set resource dir in grammar-manager on app init**

In the `AST_ANALYZE_SCOPE` IPC handler (or a new init block), set the resource dir from Electron's app path:

```ts
const { app } = require('electron') as typeof import('electron')
const resourceDir = app.isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(app.getAppPath(), 'resources')
setResourceDir(resourceDir)
```

- [ ] **Step 3: Verify bundled grammars load**

Run the app in dev mode, open the AST visualizer on a Rust/Python/Go project, and verify grammars load without CDN fetch.

- [ ] **Step 4: Commit**

```bash
git add resources/grammars/ src/main/ast-parsers/grammar-manager.ts src/main/ipc-handlers.ts
git commit -m "feat(ast): bundle Tier 1 grammar WASM files (Rust, Python, Go)"
```

---

### Task 9: Integration Test & Polish

**Files:**
- Run: all checks

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors (warnings ok)

- [ ] **Step 4: Fix any issues found**

Address any failures from steps 1-3.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ast): multi-language support integration polish"
```
