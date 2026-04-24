import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  PrContextBundle,
  PrContextFile,
  PrContextReference,
  PrContextSymbol,
  PrContextSymbolKind,
  PrContextTest,
} from '../../shared/types'
import type { BuildInput, PrContextBackend } from './pr-context-backend'
import { extractDeclarations, intersectRangesWithTouchedLines, parseDiff } from './symbol-extractor'

/**
 * Parse the diff and return a map of file path -> set of line numbers that were
 * actually added ('+' lines) in the new file. Context lines (' ') are excluded
 * so that unchanged declarations at line boundaries don't get hydrated.
 */
function parseAddedLines(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>()
  let currentFile: string | null = null
  let newLineNum = 0

  for (const line of diff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      if (!result.has(currentFile)) result.set(currentFile, new Set())
      continue
    }
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      newLineNum = Number(hunkMatch[1])
      continue
    }
    if (currentFile === null) continue
    if (line.startsWith('+') && !line.startsWith('+++')) {
      result.get(currentFile)?.add(newLineNum)
      newLineNum++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // removed line: does not advance new-file counter
    } else if (line.startsWith(' ')) {
      // context line: advances new-file counter but is not "added"
      newLineNum++
    }
  }

  return result
}

const REFERENCE_CAP = 20
const CONCURRENCY = 4

export interface McpClientLike {
  connect(timeoutMs?: number): Promise<void>
  close(): Promise<void>
  callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<unknown>
}

export type McpBackendConfig = {
  makeClient: () => McpClientLike
}

type RawSymbol = {
  name: string
  kind?: string
  range?: { start: number; end: number }
}

type RawReferencesResult = {
  references?: Array<{ file: string; line: number; snippet?: string }>
  total?: number
  truncated?: boolean
}

export class McpContextBackend implements PrContextBackend {
  readonly mode = 'mcp' as const

  constructor(private readonly config: McpBackendConfig) {}

  async detectAvailability(): Promise<boolean> {
    const client = this.config.makeClient()
    try {
      await client.connect(3_000)
      await client.close()
      return true
    } catch {
      try {
        await client.close()
      } catch {
        // ignore
      }
      return false
    }
  }

  async build(input: BuildInput): Promise<PrContextBundle> {
    const client = this.config.makeClient()
    const notes: string[] = []
    try {
      await client.connect(3_000)
    } catch (err) {
      notes.push(`MCP connect failed: ${String(err)}`)
      return {
        version: 1,
        generatedAt: Date.now(),
        mode: 'mcp',
        pr: input.pr,
        files: [],
        notes,
      }
    }

    try {
      const diffFiles = parseDiff(input.diff)
      const addedLines = parseAddedLines(input.diff)
      const files: PrContextFile[] = []

      for (const df of diffFiles) {
        if (input.signal.aborted) break
        const rawSymbols = (await callSafe(
          client,
          'get_file_symbols',
          { path: df.path },
          input.perCallTimeoutMs,
        )) as RawSymbol[] | null
        if (!rawSymbols) {
          files.push({ path: df.path, symbols: [] })
          continue
        }

        const declsFromMcp = rawSymbols
          .filter((s) => s.range)
          .map((s) => ({
            name: s.name,
            kind: normalizeKind(s.kind),
            range: s.range as { start: number; end: number },
          }))

        const decls =
          declsFromMcp.length > 0
            ? declsFromMcp
            : await extractDeclarationsFromDisk(input.worktreePath, df.path)

        // When MCP provides explicit ranges, use the precise set of added lines
        // so that unchanged declarations at hunk boundaries are excluded.
        // When falling back to disk-extracted declarations, use hunk ranges (the
        // heuristic path) since we have no finer granularity.
        const changed =
          declsFromMcp.length > 0
            ? filterByAddedLines(decls, addedLines.get(df.path) ?? new Set())
            : intersectRangesWithTouchedLines(decls, df.touchedRanges)

        const moduleSummary = (await callSafe(
          client,
          'get_module_summary',
          { path: df.path },
          input.perCallTimeoutMs,
        )) as string | null

        const hydrated: PrContextSymbol[] = await hydrateWithConcurrency(
          changed,
          CONCURRENCY,
          async (decl) => {
            try {
              const [definition, references, tests] = await Promise.all([
                callSafe(
                  client,
                  'get_definition',
                  { path: df.path, name: decl.name },
                  input.perCallTimeoutMs,
                ),
                callSafe(
                  client,
                  'find_references',
                  { path: df.path, name: decl.name, limit: REFERENCE_CAP },
                  input.perCallTimeoutMs,
                ),
                callSafe(
                  client,
                  'find_tests_for_symbol',
                  { path: df.path, name: decl.name },
                  input.perCallTimeoutMs,
                ),
              ])
              const refs = normalizeReferences(references, REFERENCE_CAP)
              return {
                name: decl.name,
                kind: decl.kind,
                range: decl.range,
                definition: typeof definition === 'string' ? definition : undefined,
                references: refs.items,
                referencesTotal: refs.total,
                referencesTruncated: refs.truncated,
                tests: normalizeTests(tests),
              }
            } catch (err) {
              return {
                name: decl.name,
                kind: decl.kind,
                range: decl.range,
                references: [],
                referencesTotal: 0,
                referencesTruncated: false,
                tests: [],
                error: String(err),
              }
            }
          },
        )

        files.push({
          path: df.path,
          moduleSummary: typeof moduleSummary === 'string' ? moduleSummary : undefined,
          symbols: hydrated,
        })
      }

      return {
        version: 1,
        generatedAt: Date.now(),
        mode: 'mcp',
        pr: input.pr,
        files,
        notes,
      }
    } finally {
      await client.close().catch(() => {})
    }
  }
}

async function callSafe(
  client: McpClientLike,
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await client.callTool(name, args, timeoutMs)
  } catch (err) {
    if (err instanceof Error && /timed out/i.test(err.message)) throw err
    return null
  }
}

async function extractDeclarationsFromDisk(worktreePath: string, relPath: string) {
  try {
    const source = await readFile(join(worktreePath, relPath), 'utf8')
    return extractDeclarations(source, relPath)
  } catch {
    return []
  }
}

function normalizeKind(kind: string | undefined): PrContextSymbolKind {
  switch (kind) {
    case 'function':
    case 'class':
    case 'type':
    case 'method':
    case 'variable':
      return kind
    default:
      return 'other'
  }
}

function normalizeReferences(
  raw: unknown,
  cap: number,
): { items: PrContextReference[]; total: number; truncated: boolean } {
  const typed = raw as RawReferencesResult | null
  if (!typed || !Array.isArray(typed.references)) {
    return { items: [], total: 0, truncated: false }
  }
  const items = typed.references.slice(0, cap).map((r) => ({
    file: r.file,
    line: r.line,
    snippet: r.snippet,
  }))
  const total = typeof typed.total === 'number' ? typed.total : typed.references.length
  const truncated = typeof typed.truncated === 'boolean' ? typed.truncated : total > items.length
  return { items, total, truncated }
}

function normalizeTests(raw: unknown): PrContextTest[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r) => (typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => r !== null && typeof r.file === 'string')
    .map((r) => ({ file: r.file as string, name: typeof r.name === 'string' ? r.name : undefined }))
}

/**
 * Keep only declarations whose line range contains at least one added ('+') line.
 * This is stricter than hunk-range intersection and prevents unchanged declarations
 * that happen to sit at the edge of a hunk from being included.
 */
function filterByAddedLines<T extends { range: { start: number; end: number } }>(
  decls: T[],
  addedLineNums: Set<number>,
): T[] {
  if (addedLineNums.size === 0) return []
  return decls.filter((d) => {
    for (let l = d.range.start; l <= d.range.end; l++) {
      if (addedLineNums.has(l)) return true
    }
    return false
  })
}

async function hydrateWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  worker: (item: I) => Promise<O>,
): Promise<O[]> {
  const results: O[] = []
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await worker(items[idx])
    }
  })
  await Promise.all(runners)
  return results
}
