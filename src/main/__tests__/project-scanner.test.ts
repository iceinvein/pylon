import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProject } from '../project-scanner'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `scan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('scanProject', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns defaults for empty directory', () => {
    const result = scanProject(tmpDir)
    expect(result.framework).toBeNull()
    expect(result.devCommand).toBeNull()
    expect(result.detectedPort).toBeNull()
    expect(result.detectedUrl).toBeNull()
    expect(result.packageManager).toBeNull()
    expect(result.serverRunning).toBe(false)
    expect(result.routeFiles).toEqual([])
    expect(result.hasPlaywrightConfig).toBe(false)
    expect(result.docsFiles).toEqual([])
    expect(result.error).toBeNull()
  })

  test('detects Next.js from package.json dependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'next dev' },
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('next')
    expect(result.detectedPort).toBe(3000)
    expect(result.detectedUrl).toBe('http://localhost:3000')
  })

  test('detects Vite from package.json devDependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'vite' },
        devDependencies: { vite: '^5.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('vite')
    expect(result.detectedPort).toBe(5173)
  })

  test('detects bun package manager from bun.lock', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    writeFileSync(join(tmpDir, 'bun.lock'), '')
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('bun')
    expect(result.devCommand).toBe('bun run dev')
  })

  test('detects yarn package manager from yarn.lock', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    writeFileSync(join(tmpDir, 'yarn.lock'), '')
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('yarn')
    expect(result.devCommand).toBe('yarn run dev')
  })

  test('detects pnpm package manager from pnpm-lock.yaml', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '')
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('pnpm')
    expect(result.devCommand).toBe('pnpm run dev')
  })

  test('defaults to npm when no lockfile found', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    const result = scanProject(tmpDir)
    expect(result.packageManager).toBe('npm')
    expect(result.devCommand).toBe('npm run dev')
  })

  test('prefers dev script over start and serve', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node index.js', dev: 'next dev', serve: 'serve' } }),
    )
    const result = scanProject(tmpDir)
    expect(result.devCommand).toContain('dev')
  })

  test('falls back to start when no dev script', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node index.js' } }),
    )
    const result = scanProject(tmpDir)
    expect(result.devCommand).toContain('start')
  })

  test('detects port from .env file', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'node server.js' } }),
    )
    writeFileSync(join(tmpDir, '.env'), 'PORT=4000\nOTHER=value')
    const result = scanProject(tmpDir)
    expect(result.detectedPort).toBe(4000)
    expect(result.detectedUrl).toBe('http://localhost:4000')
  })

  test('detects Playwright config', () => {
    writeFileSync(join(tmpDir, 'playwright.config.ts'), 'export default {}')
    const result = scanProject(tmpDir)
    expect(result.hasPlaywrightConfig).toBe(true)
  })

  test('finds README.md in docsFiles', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# Hello')
    const result = scanProject(tmpDir)
    expect(result.docsFiles).toContain('README.md')
  })

  test('finds docs/ directory files', () => {
    mkdirSync(join(tmpDir, 'docs'))
    writeFileSync(join(tmpDir, 'docs', 'guide.md'), '# Guide')
    const result = scanProject(tmpDir)
    expect(result.docsFiles).toContain('docs/guide.md')
  })

  test('finds route files for Next.js app/ directory', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0' } }),
    )
    mkdirSync(join(tmpDir, 'app', 'dashboard'), { recursive: true })
    writeFileSync(join(tmpDir, 'app', 'page.tsx'), 'export default function() {}')
    writeFileSync(join(tmpDir, 'app', 'dashboard', 'page.tsx'), 'export default function() {}')
    const result = scanProject(tmpDir)
    expect(result.routeFiles.length).toBeGreaterThanOrEqual(2)
  })

  test('caps routeFiles at 50 entries', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0' } }),
    )
    const appDir = join(tmpDir, 'app')
    mkdirSync(appDir)
    for (let i = 0; i < 60; i++) {
      const subDir = join(appDir, `page-${i}`)
      mkdirSync(subDir)
      writeFileSync(join(subDir, 'page.tsx'), `export default function P${i}() {}`)
    }
    const result = scanProject(tmpDir)
    expect(result.routeFiles.length).toBeLessThanOrEqual(50)
  })

  test('returns error for corrupted package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{ invalid json !!!}')
    const result = scanProject(tmpDir)
    expect(result.error).not.toBeNull()
    expect(result.framework).toBeNull()
  })

  test('detects Remix from dependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'remix dev' },
        dependencies: { '@remix-run/react': '^2.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('remix')
  })

  test('detects CRA from react-scripts dependency', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { start: 'react-scripts start' },
        dependencies: { 'react-scripts': '^5.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('cra')
    expect(result.detectedPort).toBe(3000)
  })

  test('detects Astro from dependencies', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'astro dev' },
        dependencies: { astro: '^4.0.0' },
      }),
    )
    const result = scanProject(tmpDir)
    expect(result.framework).toBe('astro')
    expect(result.detectedPort).toBe(4321)
  })
})
