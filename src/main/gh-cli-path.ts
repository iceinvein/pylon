import { existsSync } from 'node:fs'
import { delimiter, dirname } from 'node:path'

const COMMON_GH_BINARIES = [
  '/opt/homebrew/bin/gh',
  '/usr/local/bin/gh',
  '/usr/bin/gh',
]

const COMMON_GH_DIRS = Array.from(new Set(COMMON_GH_BINARIES.map((binary) => dirname(binary))))

export function augmentExecutablePath(pathValue: string | null | undefined): string {
  const existing = (pathValue ?? '').split(delimiter).filter(Boolean)
  const merged = [...COMMON_GH_DIRS]

  for (const entry of existing) {
    if (!merged.includes(entry)) {
      merged.push(entry)
    }
  }

  return merged.join(delimiter)
}

export function findKnownGhBinary(
  fileExists: (path: string) => boolean = existsSync,
): string | null {
  for (const candidate of COMMON_GH_BINARIES) {
    if (fileExists(candidate)) {
      return candidate
    }
  }

  return null
}
