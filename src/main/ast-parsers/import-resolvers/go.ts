/**
 * Go import resolver — resolves internal package imports by reading the module
 * path from go.mod and mapping import paths to directories within the project.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ImportResolver } from '../types'

// Common Go standard library top-level packages.
// We only need the first path segment to detect stdlib imports.
const GO_STDLIB_PREFIXES = new Set([
  'archive',
  'bufio',
  'bytes',
  'compress',
  'container',
  'context',
  'crypto',
  'database',
  'debug',
  'embed',
  'encoding',
  'errors',
  'expvar',
  'flag',
  'fmt',
  'go',
  'hash',
  'html',
  'image',
  'index',
  'io',
  'log',
  'maps',
  'math',
  'mime',
  'net',
  'os',
  'path',
  'plugin',
  'reflect',
  'regexp',
  'runtime',
  'slices',
  'sort',
  'strconv',
  'strings',
  'sync',
  'syscall',
  'testing',
  'text',
  'time',
  'unicode',
  'unsafe',
])

/**
 * Read the module path from a go.mod file.
 * Returns null if the file doesn't exist or can't be parsed.
 */
function readModulePath(projectRoot: string): string | null {
  const goModPath = path.join(projectRoot, 'go.mod')
  try {
    const content = fs.readFileSync(goModPath, 'utf-8')
    const match = content.match(/^module\s+(\S+)/m)
    return match ? match[1] : null
  } catch {
    return null
  }
}

function isStdlib(importPath: string): boolean {
  const firstSegment = importPath.split('/')[0]
  // Stdlib packages don't contain dots in their first segment
  if (firstSegment.includes('.')) return false
  return GO_STDLIB_PREFIXES.has(firstSegment)
}

export function createGoResolver(projectRoot: string): ImportResolver {
  const modulePath = readModulePath(projectRoot)

  return {
    resolve(specifier: string, _fromFile: string, allFiles: Set<string>): string | null {
      // Standard library → return null
      if (isStdlib(specifier)) return null

      // If we couldn't read the module path, we can't resolve internal imports
      if (!modulePath) return null

      // Only resolve imports that start with the project's module path
      if (!specifier.startsWith(modulePath)) return null

      // Strip the module prefix to get the relative package path
      const relativePkg = specifier.slice(modulePath.length)
      // relativePkg starts with "/" or is empty
      const pkgDir = relativePkg ? path.join(projectRoot, relativePkg) : projectRoot

      // Find any .go file in the package directory
      for (const filePath of allFiles) {
        if (filePath.startsWith(pkgDir + path.sep) || filePath.startsWith(`${pkgDir}/`)) {
          const rel = filePath.slice(pkgDir.length + 1)
          // Only files directly in the package dir (not subdirectories)
          if (!rel.includes(path.sep) && !rel.includes('/') && filePath.endsWith('.go')) {
            return filePath
          }
        }
      }

      return null
    },
  }
}
