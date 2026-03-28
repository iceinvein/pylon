import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { getCacheDir, isGrammarCached, setCacheDir, setResourceDir } from '../grammar-manager'

// ── Helpers ──

let tmpDir: string
let originalCacheDir: string

beforeEach(() => {
  originalCacheDir = getCacheDir()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pylon-grammar-test-'))
  setCacheDir(tmpDir)
  // Clear any resource dir set by other test suites to isolate these tests
  setResourceDir(null)
})

afterEach(() => {
  setCacheDir(originalCacheDir)
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── getCacheDir / setCacheDir ──

describe('getCacheDir / setCacheDir', () => {
  test('getCacheDir returns the directory set by setCacheDir', () => {
    const customDir = path.join(tmpDir, 'custom')
    setCacheDir(customDir)
    expect(getCacheDir()).toBe(customDir)
  })

  test('getCacheDir returns default before setCacheDir is called', () => {
    // Restore to original and check it ends with expected suffix
    setCacheDir(originalCacheDir)
    expect(getCacheDir()).toContain('grammars')
  })
})

// ── isGrammarCached ──

describe('isGrammarCached', () => {
  test('returns true when wasm file exists in cache dir', () => {
    const wasmPath = path.join(tmpDir, 'tree-sitter-rust.wasm')
    fs.writeFileSync(wasmPath, 'fake wasm content')
    expect(isGrammarCached('rust')).toBe(true)
  })

  test('returns false when wasm file does not exist', () => {
    expect(isGrammarCached('rust')).toBe(false)
  })

  test('returns false for empty cache dir', () => {
    expect(isGrammarCached('python')).toBe(false)
    expect(isGrammarCached('go')).toBe(false)
  })

  test('differentiates between languages', () => {
    fs.writeFileSync(path.join(tmpDir, 'tree-sitter-python.wasm'), 'fake')
    expect(isGrammarCached('python')).toBe(true)
    expect(isGrammarCached('rust')).toBe(false)
    expect(isGrammarCached('go')).toBe(false)
  })
})
