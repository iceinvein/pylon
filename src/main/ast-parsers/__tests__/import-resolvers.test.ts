import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fallbackResolver } from '../import-resolvers/fallback'
import { createGoResolver } from '../import-resolvers/go'
import { createPythonResolver } from '../import-resolvers/python'
import { createRustResolver } from '../import-resolvers/rust'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-resolvers-test-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFixture(relativePath: string, content = ''): string {
  const filePath = path.join(tmpDir, relativePath)
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

// ── Rust resolver ──

describe('Rust resolver', () => {
  let projectRoot: string
  let allFiles: Set<string>

  beforeAll(() => {
    projectRoot = path.join(tmpDir, 'rust-project')

    const files = [
      writeFixture('rust-project/Cargo.toml', '[package]\nname = "myapp"\n'),
      writeFixture('rust-project/src/main.rs', 'mod utils;\nfn main() {}\n'),
      writeFixture('rust-project/src/utils.rs', 'pub fn helper() {}\n'),
      writeFixture('rust-project/src/models/mod.rs', 'pub struct User;\n'),
      writeFixture('rust-project/src/models/user.rs', 'pub struct UserDetail;\n'),
    ]
    allFiles = new Set(files)
  })

  test('resolves crate::utils to src/utils.rs', () => {
    const resolver = createRustResolver(projectRoot)
    const mainRs = path.join(projectRoot, 'src/main.rs')
    const result = resolver.resolve('crate::utils', mainRs, allFiles)
    expect(result).toBe(path.join(projectRoot, 'src/utils.rs'))
  })

  test('resolves crate::models to src/models/mod.rs', () => {
    const resolver = createRustResolver(projectRoot)
    const mainRs = path.join(projectRoot, 'src/main.rs')
    const result = resolver.resolve('crate::models', mainRs, allFiles)
    expect(result).toBe(path.join(projectRoot, 'src/models/mod.rs'))
  })

  test('resolves crate::models::user to src/models/user.rs', () => {
    const resolver = createRustResolver(projectRoot)
    const mainRs = path.join(projectRoot, 'src/main.rs')
    const result = resolver.resolve('crate::models::user', mainRs, allFiles)
    expect(result).toBe(path.join(projectRoot, 'src/models/user.rs'))
  })

  test('resolves self::utils from current directory', () => {
    const resolver = createRustResolver(projectRoot)
    const mainRs = path.join(projectRoot, 'src/main.rs')
    const result = resolver.resolve('self::utils', mainRs, allFiles)
    expect(result).toBe(path.join(projectRoot, 'src/utils.rs'))
  })

  test('resolves super::utils from subdirectory', () => {
    const resolver = createRustResolver(projectRoot)
    const userRs = path.join(projectRoot, 'src/models/user.rs')
    const result = resolver.resolve('super::utils', userRs, allFiles)
    expect(result).toBe(path.join(projectRoot, 'src/utils.rs'))
  })

  test('returns null for external crate', () => {
    const resolver = createRustResolver(projectRoot)
    const mainRs = path.join(projectRoot, 'src/main.rs')
    const result = resolver.resolve('tokio::runtime', mainRs, allFiles)
    expect(result).toBeNull()
  })

  test('returns null for bare identifier (no ::)', () => {
    const resolver = createRustResolver(projectRoot)
    const mainRs = path.join(projectRoot, 'src/main.rs')
    const result = resolver.resolve('serde', mainRs, allFiles)
    expect(result).toBeNull()
  })
})

// ── Python resolver ──

describe('Python resolver', () => {
  let projectRoot: string
  let allFiles: Set<string>

  beforeAll(() => {
    projectRoot = path.join(tmpDir, 'python-project')

    const files = [
      writeFixture('python-project/main.py', 'from .utils import helper\n'),
      writeFixture('python-project/utils/__init__.py', ''),
      writeFixture('python-project/utils/helper.py', 'def help(): pass\n'),
      writeFixture('python-project/mypackage/__init__.py', ''),
      writeFixture('python-project/mypackage/module.py', 'x = 1\n'),
      writeFixture('python-project/mypackage/sub/__init__.py', ''),
      writeFixture('python-project/mypackage/sub/deep.py', 'y = 2\n'),
    ]
    allFiles = new Set(files)
  })

  test('resolves relative dot-import .utils.helper', () => {
    const resolver = createPythonResolver(projectRoot)
    const mainPy = path.join(projectRoot, 'main.py')
    const result = resolver.resolve('.utils.helper', mainPy, allFiles)
    expect(result).toBe(path.join(projectRoot, 'utils/helper.py'))
  })

  test('resolves relative dot-import .utils to __init__.py', () => {
    const resolver = createPythonResolver(projectRoot)
    const mainPy = path.join(projectRoot, 'main.py')
    const result = resolver.resolve('.utils', mainPy, allFiles)
    expect(result).toBe(path.join(projectRoot, 'utils/__init__.py'))
  })

  test('resolves double-dot import from subdirectory', () => {
    const resolver = createPythonResolver(projectRoot)
    const helperPy = path.join(projectRoot, 'utils/helper.py')
    // ..mypackage.module → go up one level from utils/, then mypackage/module.py
    const result = resolver.resolve('..mypackage.module', helperPy, allFiles)
    expect(result).toBe(path.join(projectRoot, 'mypackage/module.py'))
  })

  test('resolves absolute import mypackage.module', () => {
    const resolver = createPythonResolver(projectRoot)
    const mainPy = path.join(projectRoot, 'main.py')
    const result = resolver.resolve('mypackage.module', mainPy, allFiles)
    expect(result).toBe(path.join(projectRoot, 'mypackage/module.py'))
  })

  test('resolves absolute import to __init__.py', () => {
    const resolver = createPythonResolver(projectRoot)
    const mainPy = path.join(projectRoot, 'main.py')
    const result = resolver.resolve('mypackage', mainPy, allFiles)
    expect(result).toBe(path.join(projectRoot, 'mypackage/__init__.py'))
  })

  test('returns null for external package', () => {
    const resolver = createPythonResolver(projectRoot)
    const mainPy = path.join(projectRoot, 'main.py')
    const result = resolver.resolve('numpy', mainPy, allFiles)
    expect(result).toBeNull()
  })

  test('returns null for non-existent module', () => {
    const resolver = createPythonResolver(projectRoot)
    const mainPy = path.join(projectRoot, 'main.py')
    const result = resolver.resolve('mypackage.nonexistent', mainPy, allFiles)
    expect(result).toBeNull()
  })
})

// ── Go resolver ──

describe('Go resolver', () => {
  let projectRoot: string
  let allFiles: Set<string>

  beforeAll(() => {
    projectRoot = path.join(tmpDir, 'go-project')

    const files = [
      writeFixture('go-project/go.mod', 'module myproject\n\ngo 1.21\n'),
      writeFixture('go-project/main.go', 'package main\n\nimport "myproject/internal/utils"\n'),
      writeFixture('go-project/internal/utils/utils.go', 'package utils\n\nfunc Helper() {}\n'),
      writeFixture(
        'go-project/internal/utils/helpers.go',
        'package utils\n\nfunc ExtraHelper() {}\n',
      ),
      writeFixture('go-project/pkg/api/api.go', 'package api\n\nfunc Serve() {}\n'),
    ]
    allFiles = new Set(files)
  })

  test('resolves internal package import', () => {
    const resolver = createGoResolver(projectRoot)
    const mainGo = path.join(projectRoot, 'main.go')
    const result = resolver.resolve('myproject/internal/utils', mainGo, allFiles)
    // Should resolve to one of the .go files in the directory
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
    expect(result?.startsWith(path.join(projectRoot, 'internal/utils/'))).toBe(true)
    expect(result?.endsWith('.go')).toBe(true)
  })

  test('resolves another internal package import', () => {
    const resolver = createGoResolver(projectRoot)
    const mainGo = path.join(projectRoot, 'main.go')
    const result = resolver.resolve('myproject/pkg/api', mainGo, allFiles)
    expect(result).toBe(path.join(projectRoot, 'pkg/api/api.go'))
  })

  test('returns null for standard library import fmt', () => {
    const resolver = createGoResolver(projectRoot)
    const mainGo = path.join(projectRoot, 'main.go')
    const result = resolver.resolve('fmt', mainGo, allFiles)
    expect(result).toBeNull()
  })

  test('returns null for standard library import net/http', () => {
    const resolver = createGoResolver(projectRoot)
    const mainGo = path.join(projectRoot, 'main.go')
    const result = resolver.resolve('net/http', mainGo, allFiles)
    expect(result).toBeNull()
  })

  test('returns null for external module import', () => {
    const resolver = createGoResolver(projectRoot)
    const mainGo = path.join(projectRoot, 'main.go')
    const result = resolver.resolve('github.com/other/pkg', mainGo, allFiles)
    expect(result).toBeNull()
  })
})

// ── Go resolver without go.mod ──

describe('Go resolver — no go.mod', () => {
  test('returns null when go.mod is missing', () => {
    const noModRoot = path.join(tmpDir, 'go-nomod')
    fs.mkdirSync(noModRoot, { recursive: true })
    const goFile = writeFixture('go-nomod/main.go', 'package main\n')

    const resolver = createGoResolver(noModRoot)
    const result = resolver.resolve('something/pkg', goFile, new Set([goFile]))
    expect(result).toBeNull()
  })
})

// ── Fallback resolver ──

describe('Fallback resolver', () => {
  let allFiles: Set<string>

  beforeAll(() => {
    const files = [
      writeFixture('generic/src/main.rb', "require_relative './helper'\n"),
      writeFixture('generic/src/helper.rb', 'def greet; end\n'),
      writeFixture('generic/src/lib/utils.rb', 'def util; end\n'),
    ]
    allFiles = new Set(files)
  })

  test('resolves ./helper relative path with same extension', () => {
    const mainRb = path.join(tmpDir, 'generic/src/main.rb')
    const result = fallbackResolver.resolve('./helper', mainRb, allFiles)
    expect(result).toBe(path.join(tmpDir, 'generic/src/helper.rb'))
  })

  test('resolves ../src/helper from subdirectory', () => {
    const utilsRb = path.join(tmpDir, 'generic/src/lib/utils.rb')
    const result = fallbackResolver.resolve('../helper', utilsRb, allFiles)
    expect(result).toBe(path.join(tmpDir, 'generic/src/helper.rb'))
  })

  test('returns null for non-relative specifier', () => {
    const mainRb = path.join(tmpDir, 'generic/src/main.rb')
    const result = fallbackResolver.resolve('something', mainRb, allFiles)
    expect(result).toBeNull()
  })

  test('returns null for non-existent relative path', () => {
    const mainRb = path.join(tmpDir, 'generic/src/main.rb')
    const result = fallbackResolver.resolve('./nonexistent', mainRb, allFiles)
    expect(result).toBeNull()
  })
})
