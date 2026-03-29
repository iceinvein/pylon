/**
 * Rust import resolver — resolves `use` path specifiers (crate::, self::, super::)
 * to absolute file paths within a Cargo project.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ImportResolver } from '../types'

/**
 * Try to resolve a module segment to either `<dir>/<segment>.rs` or `<dir>/<segment>/mod.rs`.
 */
function resolveModule(dir: string, segment: string, allFiles: Set<string>): string | null {
  const asFile = path.join(dir, `${segment}.rs`)
  if (allFiles.has(asFile)) return asFile

  const asModDir = path.join(dir, segment, 'mod.rs')
  if (allFiles.has(asModDir)) return asModDir

  return null
}

/**
 * Walk a series of path segments starting from a base directory, resolving each
 * segment as a nested module. Returns the resolved file path or null.
 */
function resolveSegments(
  baseDir: string,
  segments: string[],
  allFiles: Set<string>,
): string | null {
  if (segments.length === 0) return null

  // All but the last segment are directories
  let currentDir = baseDir
  for (let i = 0; i < segments.length - 1; i++) {
    // Check if segment maps to a directory (mod.rs style)
    const modDir = path.join(currentDir, segments[i])
    if (fs.existsSync(modDir) && fs.statSync(modDir).isDirectory()) {
      currentDir = modDir
    } else {
      return null
    }
  }

  const lastSegment = segments[segments.length - 1]
  return resolveModule(currentDir, lastSegment, allFiles)
}

export function createRustResolver(projectRoot: string): ImportResolver {
  return {
    resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null {
      const parts = specifier.split('::')
      if (parts.length < 2) return null

      const prefix = parts[0]

      if (prefix === 'crate') {
        // crate::module::item → resolve from <projectRoot>/src/
        const srcDir = path.join(projectRoot, 'src')
        const segments = parts.slice(1)
        return resolveSegments(srcDir, segments, allFiles)
      }

      if (prefix === 'self') {
        // self::submod → resolve from current file's directory
        const currentDir = path.dirname(fromFile)
        const segments = parts.slice(1)
        return resolveSegments(currentDir, segments, allFiles)
      }

      if (prefix === 'super') {
        // super::parent → resolve from parent directory
        const parentDir = path.dirname(path.dirname(fromFile))
        const segments = parts.slice(1)
        return resolveSegments(parentDir, segments, allFiles)
      }

      // External crates (tokio::runtime, serde::Deserialize, etc.) → not resolvable
      return null
    },
  }
}
