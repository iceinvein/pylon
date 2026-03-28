/**
 * Fallback import resolver — handles relative path imports (./foo, ../bar)
 * for any language without a dedicated resolver. Tries the same extension
 * as the source file.
 */
import * as path from 'node:path'
import type { ImportResolver } from '../types'

export const fallbackResolver: ImportResolver = {
  resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
    // Only resolve relative paths
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      return null
    }

    const sourceDir = path.dirname(fromFile)
    const sourceExt = path.extname(fromFile)
    const basePath = path.resolve(sourceDir, specifier)

    // Try exact path first
    if (allFiles.has(basePath)) return basePath

    // Try with same extension as source file
    if (sourceExt) {
      const withExt = basePath + sourceExt
      if (allFiles.has(withExt)) return withExt
    }

    return null
  },
}
