import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  analyzeScope,
  buildImportGraph,
  parseFile,
  parseFileAst,
  parseFileCached,
} from '../ast-analyzer'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-analyzer-test-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFixture(name: string, content: string): string {
  const filePath = path.join(tmpDir, name)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

// ── parseFile: function declarations ──

describe('parseFile — function declarations', () => {
  test('extracts named function with correct name, type, and line spans', () => {
    const filePath = writeFixture(
      'func.ts',
      `function greet(name: string): string {
  return 'Hello, ' + name
}
`,
    )
    const result = parseFile(filePath)
    expect(result.declarations.length).toBeGreaterThanOrEqual(1)
    const fn = result.declarations.find((d) => d.name === 'greet')
    expect(fn).toBeDefined()
    expect(fn?.type).toBe('function')
    expect(fn?.startLine).toBe(1)
    expect(fn?.endLine).toBe(3)
    expect(fn?.filePath).toBe(filePath)
  })

  test('extracts arrow function assigned to const', () => {
    const filePath = writeFixture(
      'arrow.ts',
      `const add = (a: number, b: number) => a + b
`,
    )
    const result = parseFile(filePath)
    const decl = result.declarations.find((d) => d.name === 'add')
    expect(decl).toBeDefined()
    expect(decl?.type).toBe('variable')
    expect(decl?.startLine).toBe(1)
  })

  test('extracts exported function', () => {
    const filePath = writeFixture(
      'exported.ts',
      `export function doStuff(): void {
  console.log('stuff')
}
`,
    )
    const result = parseFile(filePath)
    const fn = result.declarations.find((d) => d.name === 'doStuff')
    expect(fn).toBeDefined()
    expect(fn?.type).toBe('function')
  })
})

// ── parseFile: class declarations ──

describe('parseFile — class declarations', () => {
  test('extracts class with correct name and line spans', () => {
    const filePath = writeFixture(
      'cls.ts',
      `class Animal {
  name: string
  constructor(name: string) {
    this.name = name
  }
  speak(): string {
    return this.name + ' speaks'
  }
}
`,
    )
    const result = parseFile(filePath)
    const cls = result.declarations.find((d) => d.name === 'Animal')
    expect(cls).toBeDefined()
    expect(cls?.type).toBe('class')
    expect(cls?.startLine).toBe(1)
    expect(cls?.endLine).toBe(9)
    expect(cls?.children.length).toBeGreaterThan(0)
  })
})

// ── parseFile: type aliases ──

describe('parseFile — type aliases', () => {
  test('extracts type alias', () => {
    const filePath = writeFixture(
      'types.ts',
      `type Point = {
  x: number
  y: number
}
`,
    )
    const result = parseFile(filePath)
    const t = result.declarations.find((d) => d.name === 'Point')
    expect(t).toBeDefined()
    expect(t?.type).toBe('type')
    expect(t?.startLine).toBe(1)
    expect(t?.endLine).toBe(4)
  })

  test('extracts interface as type', () => {
    const filePath = writeFixture(
      'iface.ts',
      `interface Movable {
  velocity: number
  move(): void
}
`,
    )
    const result = parseFile(filePath)
    const t = result.declarations.find((d) => d.name === 'Movable')
    expect(t).toBeDefined()
    expect(t?.type).toBe('type')
  })

  test('extracts enum as type', () => {
    const filePath = writeFixture(
      'enums.ts',
      `enum Color {
  Red,
  Green,
  Blue,
}
`,
    )
    const result = parseFile(filePath)
    const t = result.declarations.find((d) => d.name === 'Color')
    expect(t).toBeDefined()
    expect(t?.type).toBe('type')
  })
})

// ── parseFile: variable declarations ──

describe('parseFile — variable declarations', () => {
  test('extracts const and let declarations', () => {
    const filePath = writeFixture(
      'vars.ts',
      `const MAX_SIZE = 100
let counter = 0
`,
    )
    const result = parseFile(filePath)
    const max = result.declarations.find((d) => d.name === 'MAX_SIZE')
    expect(max).toBeDefined()
    expect(max?.type).toBe('variable')
    expect(max?.startLine).toBe(1)

    const cnt = result.declarations.find((d) => d.name === 'counter')
    expect(cnt).toBeDefined()
    expect(cnt?.type).toBe('variable')
    expect(cnt?.startLine).toBe(2)
  })
})

// ── parseFile: import declarations ──

describe('parseFile — import declarations', () => {
  test('extracts named imports with specifiers', () => {
    const filePath = writeFixture(
      'imports.ts',
      `import { foo, bar } from './utils'
import type { Baz } from './types'
const x = 1
`,
    )
    const result = parseFile(filePath)
    expect(result.imports.length).toBeGreaterThanOrEqual(2)

    const utilsImport = result.imports.find((i) => i.target.includes('utils'))
    expect(utilsImport).toBeDefined()
    expect(utilsImport?.specifiers).toContain('foo')
    expect(utilsImport?.specifiers).toContain('bar')
    expect(utilsImport?.source).toBe(filePath)

    const typesImport = result.imports.find((i) => i.target.includes('types'))
    expect(typesImport).toBeDefined()
    expect(typesImport?.specifiers).toContain('Baz')
  })

  test('extracts default import', () => {
    const filePath = writeFixture(
      'default-import.ts',
      `import React from 'react'
const x = 1
`,
    )
    const result = parseFile(filePath)
    const reactImport = result.imports.find((i) => i.target === 'react')
    expect(reactImport).toBeDefined()
    expect(reactImport?.specifiers).toContain('default')
  })

  test('extracts namespace import', () => {
    const filePath = writeFixture(
      'ns-import.ts',
      `import * as path from 'node:path'
const x = 1
`,
    )
    const result = parseFile(filePath)
    const pathImport = result.imports.find((i) => i.target === 'node:path')
    expect(pathImport).toBeDefined()
    expect(pathImport?.specifiers).toContain('* as path')
  })
})

// ── parseFile: TSX/JSX ──

describe('parseFile — TSX/JSX', () => {
  test('handles TSX file with JSX elements', () => {
    const filePath = writeFixture(
      'component.tsx',
      `import React from 'react'

type Props = { name: string }

function Greeting({ name }: Props) {
  return <div>Hello, {name}</div>
}

export default Greeting
`,
    )
    const result = parseFile(filePath)
    const fn = result.declarations.find((d) => d.name === 'Greeting')
    expect(fn).toBeDefined()
    expect(fn?.type).toBe('function')

    const t = result.declarations.find((d) => d.name === 'Props')
    expect(t).toBeDefined()
    expect(t?.type).toBe('type')
  })

  test('handles JSX file', () => {
    const filePath = writeFixture(
      'app.jsx',
      `function App() {
  return <div>Hello World</div>
}
`,
    )
    const result = parseFile(filePath)
    const fn = result.declarations.find((d) => d.name === 'App')
    expect(fn).toBeDefined()
    expect(fn?.type).toBe('function')
  })
})

// ── buildImportGraph ──

describe('buildImportGraph', () => {
  test('resolves relative imports to absolute paths', () => {
    const subDir = path.join(tmpDir, 'graph-test')
    fs.mkdirSync(subDir, { recursive: true })

    writeFixture(
      'graph-test/utils.ts',
      `export function helper() { return 1 }
`,
    )
    writeFixture(
      'graph-test/main.ts',
      `import { helper } from './utils'
console.log(helper())
`,
    )

    const graph = buildImportGraph(subDir)
    expect(graph.files.length).toBeGreaterThanOrEqual(2)

    const mainFile = graph.files.find((f) => f.filePath.endsWith('main.ts'))
    expect(mainFile).toBeDefined()

    const utilsFile = graph.files.find((f) => f.filePath.endsWith('utils.ts'))
    expect(utilsFile).toBeDefined()

    // Should have an edge from main.ts -> utils.ts with absolute paths
    const edge = graph.edges.find(
      (e) => e.source.endsWith('main.ts') && e.target.endsWith('utils.ts'),
    )
    expect(edge).toBeDefined()
    expect(path.isAbsolute(edge?.target)).toBe(true)
    expect(edge?.specifiers).toContain('helper')
  })

  test('ignores node_modules imports in edges', () => {
    const subDir = path.join(tmpDir, 'nm-test')
    fs.mkdirSync(subDir, { recursive: true })

    writeFixture(
      'nm-test/app.ts',
      `import { useState } from 'react'
import { helper } from './helper'
const x = 1
`,
    )
    writeFixture(
      'nm-test/helper.ts',
      `export function helper() { return 2 }
`,
    )

    const graph = buildImportGraph(subDir)

    // Edge for react should NOT exist (not a relative import resolving to a file)
    const reactEdge = graph.edges.find((e) => e.target === 'react')
    expect(reactEdge).toBeUndefined()

    // Edge for helper SHOULD exist
    const helperEdge = graph.edges.find((e) => e.target.endsWith('helper.ts'))
    expect(helperEdge).toBeDefined()
  })

  test('ignores excluded directories', () => {
    const subDir = path.join(tmpDir, 'exclude-test')
    fs.mkdirSync(path.join(subDir, 'node_modules', 'pkg'), { recursive: true })
    fs.mkdirSync(path.join(subDir, 'dist'), { recursive: true })
    fs.mkdirSync(path.join(subDir, 'src'), { recursive: true })

    writeFixture('exclude-test/src/index.ts', `const x = 1\n`)
    writeFixture('exclude-test/node_modules/pkg/index.ts', `const y = 2\n`)
    writeFixture('exclude-test/dist/bundle.js', `const z = 3\n`)

    const graph = buildImportGraph(subDir)
    const filePaths = graph.files.map((f) => f.filePath)

    expect(filePaths.some((p) => p.includes('node_modules'))).toBe(false)
    expect(filePaths.some((p) => p.includes('/dist/'))).toBe(false)
    expect(filePaths.some((p) => p.endsWith('index.ts'))).toBe(true)
  })

  test('resolves imports with index files', () => {
    const subDir = path.join(tmpDir, 'index-test')
    fs.mkdirSync(path.join(subDir, 'lib'), { recursive: true })

    writeFixture('index-test/lib/index.ts', `export const value = 42\n`)
    writeFixture('index-test/main.ts', `import { value } from './lib'\nconst x = value\n`)

    const graph = buildImportGraph(subDir)
    const edge = graph.edges.find(
      (e) => e.source.endsWith('main.ts') && e.target.endsWith('lib/index.ts'),
    )
    expect(edge).toBeDefined()
  })
})

// ── analyzeScope ──

describe('analyzeScope', () => {
  test('returns a complete RepoGraph', () => {
    const subDir = path.join(tmpDir, 'scope-test')
    fs.mkdirSync(subDir, { recursive: true })

    writeFixture('scope-test/a.ts', `export function alpha() { return 1 }\n`)
    writeFixture('scope-test/b.ts', `import { alpha } from './a'\nconst x = alpha()\n`)

    const graph = analyzeScope(subDir)
    expect(graph.files).toBeDefined()
    expect(graph.edges).toBeDefined()
    expect(graph.files.length).toBe(2)
    expect(graph.edges.length).toBeGreaterThanOrEqual(1)
  })
})

// ── parseFileAst ──

describe('parseFileAst', () => {
  test('returns just AstNode declarations', () => {
    const filePath = writeFixture(
      'ast-only.ts',
      `function hello() { return 'hi' }
class World {}
type Foo = string
`,
    )
    const nodes = parseFileAst(filePath)
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    expect(nodes.find((n) => n.name === 'hello')).toBeDefined()
    expect(nodes.find((n) => n.name === 'World')).toBeDefined()
    expect(nodes.find((n) => n.name === 'Foo')).toBeDefined()
  })
})

// ── parseFileCached ──

describe('parseFileCached', () => {
  test('returns cached result on second call without file change', () => {
    const filePath = writeFixture('cached.ts', `const x = 1\n`)
    const result1 = parseFileCached(filePath)
    const result2 = parseFileCached(filePath)
    // Should return equivalent results
    expect(result1.declarations.length).toBe(result2.declarations.length)
    expect(result1.declarations[0]?.name).toBe(result2.declarations[0]?.name)
  })
})
