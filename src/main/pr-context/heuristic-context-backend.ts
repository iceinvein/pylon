import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { PrContextBundle, PrContextFile, PrContextSymbol } from '../../shared/types'
import type { BuildInput, PrContextBackend } from './pr-context-backend'
import { extractDeclarations, intersectRangesWithTouchedLines, parseDiff } from './symbol-extractor'

const MAX_DEFINITION_LINES = 200

export class HeuristicContextBackend implements PrContextBackend {
  readonly mode = 'heuristic' as const

  async detectAvailability(): Promise<boolean> {
    return true
  }

  async build({ diff, worktreePath, pr }: BuildInput): Promise<PrContextBundle> {
    const diffFiles = parseDiff(diff)
    const files: PrContextFile[] = []
    const notes: string[] = [
      'heuristic mode: reference data unavailable, call find_references or grep for specific symbols if needed',
    ]

    for (const df of diffFiles) {
      const absPath = join(worktreePath, df.path)
      let source: string | null = null
      try {
        source = await readFile(absPath, 'utf8')
      } catch {
        notes.push(`could not read ${df.path} from worktree`)
      }

      const symbols: PrContextSymbol[] = []
      if (source !== null) {
        const decls = extractDeclarations(source, df.path)
        const changed = intersectRangesWithTouchedLines(decls, df.touchedRanges)
        const sourceLines = source.split('\n')
        for (const decl of changed) {
          const sliceEnd = Math.min(sourceLines.length, decl.range.start + MAX_DEFINITION_LINES - 1)
          const definition = sourceLines.slice(decl.range.start - 1, sliceEnd).join('\n')
          const tests = await findCoLocatedTests(worktreePath, df.path)
          symbols.push({
            name: decl.name,
            kind: decl.kind,
            range: decl.range,
            definition,
            references: [],
            referencesTotal: 0,
            referencesTruncated: false,
            tests,
          })
        }
      }

      files.push({ path: df.path, symbols })
    }

    return {
      version: 1,
      generatedAt: Date.now(),
      mode: 'heuristic',
      pr,
      files,
      notes,
    }
  }
}

async function findCoLocatedTests(
  worktreePath: string,
  relPath: string,
): Promise<Array<{ file: string; name?: string }>> {
  const ext = extname(relPath)
  const base = basename(relPath, ext)
  const dir = dirname(relPath)
  const candidates = [
    join(dir, `${base}.test${ext}`),
    join(dir, `${base}.spec${ext}`),
    join(dir, '__tests__', `${base}.test${ext}`),
    join(dir, '__tests__', `${base}.spec${ext}`),
  ]
  const results: Array<{ file: string; name?: string }> = []
  for (const candidate of candidates) {
    try {
      const s = await stat(join(worktreePath, candidate))
      if (s.isFile()) results.push({ file: candidate })
    } catch {
      // candidate does not exist
    }
  }
  return results
}
