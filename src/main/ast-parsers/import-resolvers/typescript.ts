/**
 * TypeScript/JavaScript import resolver — resolves relative import specifiers
 * to absolute file paths by trying common extensions and index files.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ImportResolver } from '../types'

// ── Import resolution extensions to try ──

const RESOLVE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
]

export const typescriptResolver: ImportResolver = {
  resolve(specifier: string, fromFile: string, _allFiles: Set<string>): string | null {
    // Only resolve relative imports
    if (!specifier.startsWith('.')) {
      return null
    }

    const sourceDir = path.dirname(fromFile)
    const basePath = path.resolve(sourceDir, specifier)

    for (const ext of RESOLVE_EXTENSIONS) {
      const candidate = basePath + ext
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate
      }
    }

    return null
  },
}
