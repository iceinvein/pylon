/**
 * Python import resolver — resolves relative dot-imports and absolute package imports
 * to file paths within a Python project.
 */
import * as path from 'node:path'
import type { ImportResolver } from '../types'

/**
 * Try to resolve a module path to either `<base>.py` or `<base>/__init__.py`.
 */
function tryResolve(basePath: string, allFiles: Set<string>): string | null {
  const asFile = `${basePath}.py`
  if (allFiles.has(asFile)) return asFile

  const asPackage = path.join(basePath, '__init__.py')
  if (allFiles.has(asPackage)) return asPackage

  return null
}

export function createPythonResolver(projectRoot: string): ImportResolver {
  return {
    resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
      if (specifier.startsWith('.')) {
        // Relative import: count leading dots
        let dotCount = 0
        while (dotCount < specifier.length && specifier[dotCount] === '.') {
          dotCount++
        }

        // Start from the current file's package directory
        // 1 dot = current package dir, 2 dots = parent, etc.
        let baseDir = path.dirname(fromFile)
        for (let i = 1; i < dotCount; i++) {
          baseDir = path.dirname(baseDir)
        }

        const remainder = specifier.slice(dotCount)
        if (!remainder) {
          // Just dots, e.g. `from . import something` — resolve to __init__.py
          const initPath = path.join(baseDir, '__init__.py')
          if (allFiles.has(initPath)) return initPath
          return null
        }

        // Convert dotted module path to file path segments
        const segments = remainder.split('.')
        const modulePath = path.join(baseDir, ...segments)
        return tryResolve(modulePath, allFiles)
      }

      // Absolute import: resolve from project root
      // e.g., `mypackage.module` → `<projectRoot>/mypackage/module.py`
      const segments = specifier.split('.')
      const modulePath = path.join(projectRoot, ...segments)
      return tryResolve(modulePath, allFiles)
    },
  }
}
