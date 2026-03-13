import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { E2ePathResolution } from '../shared/types'

const PLAYWRIGHT_CONFIG_NAMES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mjs',
]

const E2E_DIR_PATTERNS = ['tests/e2e', 'test/e2e', '__tests__/e2e', 'e2e']

const WEB_FRAMEWORK_DEPS = ['next', 'react', 'vue', '@angular/core', 'svelte', 'nuxt', 'solid-js']

const FRAMEWORK_CONVENTIONS: Record<string, string> = {
  next: 'e2e',
  '@angular/core': 'e2e',
  nuxt: 'tests/e2e',
}

export function resolveE2eOutputPath(cwd: string): E2ePathResolution {
  // 1. Playwright config is authoritative
  const playwrightResult = findPlaywrightTestDir(cwd)
  if (playwrightResult) return playwrightResult

  // 2. Existing e2e directories
  const existingDir = findExistingE2eDir(cwd)
  if (existingDir) return existingDir

  // 3. Monorepo detection
  const monorepoResult = detectMonorepo(cwd)
  if (monorepoResult) return monorepoResult

  // 4. Framework conventions
  const frameworkResult = detectFramework(cwd)
  if (frameworkResult) return frameworkResult

  // 5. Fallback
  return { path: 'e2e', reason: 'Default fallback' }
}

function findPlaywrightTestDir(dir: string): E2ePathResolution | null {
  for (const configName of PLAYWRIGHT_CONFIG_NAMES) {
    const configPath = join(dir, configName)
    if (!existsSync(configPath)) continue
    try {
      const content = readFileSync(configPath, 'utf-8')
      const match = content.match(/testDir\s*:\s*['"]\.?\/?([^'"]+)['"]/)
      if (match) {
        return { path: match[1], reason: `Detected from ${configName}` }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

function findExistingE2eDir(dir: string): E2ePathResolution | null {
  for (const pattern of E2E_DIR_PATTERNS) {
    const fullPath = join(dir, pattern)
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      return { path: pattern, reason: `Using existing ${pattern}/ directory` }
    }
  }
  return null
}

function detectMonorepo(cwd: string): E2ePathResolution | null {
  const rootPkgPath = join(cwd, 'package.json')
  if (!existsSync(rootPkgPath)) return null
  try {
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'))
    const hasWorkspaces =
      Array.isArray(rootPkg.workspaces) ||
      (rootPkg.workspaces && typeof rootPkg.workspaces === 'object')
    const hasPnpmWorkspace = existsSync(join(cwd, 'pnpm-workspace.yaml'))
    if (!hasWorkspaces && !hasPnpmWorkspace) return null

    for (const searchDir of ['packages', 'apps']) {
      const searchPath = join(cwd, searchDir)
      if (!existsSync(searchPath) || !statSync(searchPath).isDirectory()) continue
      const entries = readdirSync(searchPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const subPkgPath = join(searchPath, entry.name, 'package.json')
        if (!existsSync(subPkgPath)) continue
        try {
          const subPkg = JSON.parse(readFileSync(subPkgPath, 'utf-8'))
          const allDeps = { ...subPkg.dependencies, ...subPkg.devDependencies }
          if (WEB_FRAMEWORK_DEPS.some((dep) => dep in allDeps)) {
            const subDir = `${searchDir}/${entry.name}`
            const subPw = findPlaywrightTestDir(join(cwd, subDir))
            if (subPw)
              return {
                path: `${subDir}/${subPw.path}`,
                reason: `monorepo: ${subPw.reason} in ${subDir}/`,
              }
            const subEx = findExistingE2eDir(join(cwd, subDir))
            if (subEx)
              return {
                path: `${subDir}/${subEx.path}`,
                reason: `monorepo: ${subEx.reason} in ${subDir}/`,
              }
            return { path: `${subDir}/e2e`, reason: `monorepo: detected web package in ${subDir}/` }
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function detectFramework(cwd: string): E2ePathResolution | null {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [framework, conventionPath] of Object.entries(FRAMEWORK_CONVENTIONS)) {
      if (framework in allDeps) {
        const name =
          framework === '@angular/core'
            ? 'Angular'
            : framework === 'next'
              ? 'Next.js'
              : framework.charAt(0).toUpperCase() + framework.slice(1)
        return { path: conventionPath, reason: `${name} project convention` }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}
