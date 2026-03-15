import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, relative } from 'node:path'
import type { PortOverrideMethod, ProjectScan } from '../shared/types'

const FRAMEWORK_DEPS: Record<string, { name: string; defaultPort: number }> = {
  next: { name: 'next', defaultPort: 3000 },
  vite: { name: 'vite', defaultPort: 5173 },
  '@remix-run/react': { name: 'remix', defaultPort: 5173 },
  '@remix-run/dev': { name: 'remix', defaultPort: 5173 },
  astro: { name: 'astro', defaultPort: 4321 },
  'react-scripts': { name: 'cra', defaultPort: 3000 },
  nuxt: { name: 'nuxt', defaultPort: 3000 },
  '@angular/core': { name: 'angular', defaultPort: 4200 },
  svelte: { name: 'svelte', defaultPort: 5173 },
  '@sveltejs/kit': { name: 'sveltekit', defaultPort: 5173 },
}

export const PORT_OVERRIDE_MAP: Record<string, PortOverrideMethod> = {
  next: { type: 'cli-flag', flag: '-p' },
  vite: { type: 'cli-flag', flag: '--port' },
  remix: { type: 'cli-flag', flag: '--port' },
  cra: { type: 'env' },
  angular: { type: 'cli-flag', flag: '--port' },
  nuxt: { type: 'cli-flag', flag: '--port' },
  svelte: { type: 'cli-flag', flag: '--port' },
  sveltekit: { type: 'cli-flag', flag: '--port' },
  astro: { type: 'cli-flag', flag: '--port' },
}

const ROUTE_PATTERNS: Record<string, string[]> = {
  next: [
    'app/**/page.tsx',
    'app/**/page.jsx',
    'app/**/page.ts',
    'app/**/page.js',
    'pages/**/*.tsx',
    'pages/**/*.jsx',
    'src/app/**/page.tsx',
    'src/pages/**/*.tsx',
  ],
  remix: ['app/routes/**/*.tsx', 'app/routes/**/*.jsx'],
  nuxt: ['pages/**/*.vue'],
  angular: ['src/app/**/*.component.ts'],
  sveltekit: ['src/routes/**/+page.svelte'],
  default: ['src/pages/**/*', 'src/routes/**/*', 'src/views/**/*'],
}

const ROUTE_FILE_CAP = 50

export function scanProject(cwd: string): ProjectScan {
  const result: ProjectScan = {
    framework: null,
    devCommand: null,
    detectedPort: null,
    detectedUrl: null,
    packageManager: null,
    portOverrideMethod: null,
    serverRunning: false,
    routeFiles: [],
    hasPlaywrightConfig: false,
    docsFiles: [],
    error: null,
  }

  result.packageManager = detectPackageManager(cwd)

  let pkg: Record<string, unknown> | null = null
  try {
    const pkgPath = join(cwd, 'package.json')
    if (existsSync(pkgPath)) {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    }
  } catch (err) {
    result.error = `Failed to parse package.json: ${String(err)}`
  }

  if (pkg) {
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    }
    for (const [depName, info] of Object.entries(FRAMEWORK_DEPS)) {
      if (deps[depName]) {
        result.framework = info.name
        result.detectedPort = info.defaultPort
        result.portOverrideMethod = PORT_OVERRIDE_MAP[info.name] ?? { type: 'env' }
        break
      }
    }

    const scripts = pkg.scripts as Record<string, string> | undefined
    if (scripts) {
      const scriptName = scripts.dev
        ? 'dev'
        : scripts.start
          ? 'start'
          : scripts.serve
            ? 'serve'
            : null
      if (scriptName && result.packageManager) {
        result.devCommand = `${result.packageManager} run ${scriptName}`
      }
    }
  }

  const envPort = readPortFromEnv(cwd)
  if (envPort) {
    result.detectedPort = envPort
  }

  if (result.detectedPort) {
    result.detectedUrl = `http://localhost:${result.detectedPort}`
  }

  result.hasPlaywrightConfig =
    existsSync(join(cwd, 'playwright.config.ts')) ||
    existsSync(join(cwd, 'playwright.config.js')) ||
    existsSync(join(cwd, 'playwright.config.mjs'))

  result.docsFiles = findDocsFiles(cwd)
  result.routeFiles = findRouteFiles(cwd, result.framework)

  return result
}

export function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = createConnection({ port, host: '127.0.0.1' })
    conn.on('connect', () => {
      conn.destroy()
      resolve(true)
    })
    conn.on('error', () => {
      resolve(false)
    })
    conn.setTimeout(500, () => {
      conn.destroy()
      resolve(false)
    })
  })
}

function detectPackageManager(cwd: string): string | null {
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'package.json'))) return 'npm'
  return null
}

function readPortFromEnv(cwd: string): number | null {
  try {
    const envPath = join(cwd, '.env')
    if (!existsSync(envPath)) return null
    const content = readFileSync(envPath, 'utf-8')
    const match = content.match(/^PORT\s*=\s*(\d+)/m)
    if (match) return Number.parseInt(match[1], 10)
  } catch {
    // ignore
  }
  return null
}

function findDocsFiles(cwd: string): string[] {
  const docs: string[] = []

  for (const name of ['README.md', 'readme.md', 'README.MD']) {
    if (existsSync(join(cwd, name))) {
      docs.push(name)
      break
    }
  }

  const docsDir = join(cwd, 'docs')
  if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
    try {
      const files = readdirSync(docsDir, { recursive: false })
      for (const file of files) {
        const fileName = String(file)
        if (fileName.endsWith('.md')) {
          docs.push(`docs/${fileName}`)
        }
      }
    } catch {
      // ignore
    }
  }

  return docs
}

function findRouteFiles(cwd: string, framework: string | null): string[] {
  const patterns =
    framework && ROUTE_PATTERNS[framework] ? ROUTE_PATTERNS[framework] : ROUTE_PATTERNS.default
  const files: string[] = []

  for (const pattern of patterns) {
    const parts = pattern.split('/**/')
    const baseDir = join(cwd, parts[0])
    const filePattern = parts.length > 1 ? parts[1] : '*'
    if (!existsSync(baseDir)) continue

    collectFiles(baseDir, cwd, filePattern, files)
    if (files.length >= ROUTE_FILE_CAP) break
  }

  return files.slice(0, ROUTE_FILE_CAP)
}

function matchesFilePattern(fileName: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern.startsWith('*')) {
    return fileName.endsWith(pattern.slice(1))
  }
  return fileName === pattern
}

function collectFiles(dir: string, cwd: string, filePattern: string, out: string[]): void {
  if (out.length >= ROUTE_FILE_CAP) return
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (out.length >= ROUTE_FILE_CAP) return
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        collectFiles(fullPath, cwd, filePattern, out)
      } else if (entry.isFile() && matchesFilePattern(entry.name, filePattern)) {
        out.push(relative(cwd, fullPath))
      }
    }
  } catch {
    // ignore permission errors
  }
}
