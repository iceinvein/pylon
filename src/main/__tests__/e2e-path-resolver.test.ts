import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveE2eOutputPath } from '../e2e-path-resolver'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('resolveE2eOutputPath', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns e2e/ as default fallback', () => {
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('e2e')
    expect(result.reason).toContain('Default')
  })

  test('detects existing e2e/ directory', () => {
    mkdirSync(join(tmpDir, 'e2e'))
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('e2e')
    expect(result.reason).toContain('existing')
  })

  test('detects existing tests/e2e/ directory', () => {
    mkdirSync(join(tmpDir, 'tests', 'e2e'), { recursive: true })
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('tests/e2e')
    expect(result.reason).toContain('existing')
  })

  test('detects playwright.config.ts with testDir', () => {
    writeFileSync(
      join(tmpDir, 'playwright.config.ts'),
      `import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './tests/integration' });`,
    )
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('tests/integration')
    expect(result.reason).toContain('playwright.config')
  })

  test('playwright config takes priority over existing directory', () => {
    mkdirSync(join(tmpDir, 'e2e'))
    writeFileSync(join(tmpDir, 'playwright.config.ts'), `export default { testDir: './tests/pw' };`)
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('tests/pw')
  })

  test('detects monorepo and finds web package', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
    const webPkg = join(tmpDir, 'packages', 'web')
    mkdirSync(webPkg, { recursive: true })
    writeFileSync(join(webPkg, 'package.json'), JSON.stringify({ dependencies: { react: '*' } }))
    mkdirSync(join(webPkg, 'e2e'))
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('packages/web/e2e')
    expect(result.reason).toContain('monorepo')
  })

  test('detects Next.js project convention', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { next: '*' } }))
    const result = resolveE2eOutputPath(tmpDir)
    expect(result.path).toBe('e2e')
    expect(result.reason).toContain('Next.js')
  })
})
