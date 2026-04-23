import type { PrContextSymbolKind } from '../../shared/types'

export type DiffFile = {
  path: string
  touchedRanges: Array<{ start: number; end: number }>
}

export type Declaration = {
  name: string
  kind: PrContextSymbolKind
  range: { start: number; end: number }
}

export function parseDiff(diff: string): DiffFile[] {
  const result: DiffFile[] = []
  let current: DiffFile | null = null

  const lines = diff.split('\n')
  for (const line of lines) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      current = { path: fileMatch[1], touchedRanges: [] }
      result.push(current)
      continue
    }
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hunkMatch && current) {
      const start = Number(hunkMatch[1])
      const length = hunkMatch[2] ? Number(hunkMatch[2]) : 1
      if (length > 0) {
        current.touchedRanges.push({ start, end: start + length - 1 })
      }
    }
  }

  return mergeTouchedRanges(result)
}

function mergeTouchedRanges(files: DiffFile[]): DiffFile[] {
  for (const f of files) {
    f.touchedRanges.sort((a, b) => a.start - b.start)
    const merged: Array<{ start: number; end: number }> = []
    for (const r of f.touchedRanges) {
      const last = merged.at(-1)
      if (last && r.start <= last.end + 1) {
        last.end = Math.max(last.end, r.end)
      } else {
        merged.push({ ...r })
      }
    }
    f.touchedRanges = merged
  }
  return files
}

type LangRule = {
  pattern: RegExp
  kind: PrContextSymbolKind
}

const LANG_RULES: Record<string, LangRule[]> = {
  ts: [
    {
      pattern: /^[^\S\n]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
      kind: 'function',
    },
    { pattern: /^[^\S\n]*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm, kind: 'class' },
    { pattern: /^[^\S\n]*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/gm, kind: 'type' },
    { pattern: /^[^\S\n]*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/gm, kind: 'type' },
    { pattern: /^[^\S\n]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm, kind: 'variable' },
  ],
  py: [
    { pattern: /^[^\S\n]*def\s+([A-Za-z_][\w]*)/gm, kind: 'function' },
    { pattern: /^[^\S\n]*class\s+([A-Za-z_][\w]*)/gm, kind: 'class' },
  ],
  go: [
    { pattern: /^[^\S\n]*func\s+(?:\([^)]*\)\s+)?([A-Za-z_][\w]*)/gm, kind: 'function' },
    { pattern: /^[^\S\n]*type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/gm, kind: 'type' },
  ],
  rs: [
    { pattern: /^[^\S\n]*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/gm, kind: 'function' },
    { pattern: /^[^\S\n]*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/gm, kind: 'type' },
    { pattern: /^[^\S\n]*(?:pub\s+)?enum\s+([A-Za-z_][\w]*)/gm, kind: 'type' },
    { pattern: /^[^\S\n]*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)/gm, kind: 'type' },
  ],
}

const EXT_ALIASES: Record<string, keyof typeof LANG_RULES> = {
  ts: 'ts',
  tsx: 'ts',
  js: 'ts',
  jsx: 'ts',
  mjs: 'ts',
  cjs: 'ts',
  py: 'py',
  go: 'go',
  rs: 'rs',
}

export function extractDeclarations(source: string, path: string): Declaration[] {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const langKey = EXT_ALIASES[ext]
  if (!langKey) return []
  const rules = LANG_RULES[langKey]
  const lines = source.split('\n')

  const results: Declaration[] = []
  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags)
    let match: RegExpExecArray | null = regex.exec(source)
    while (match) {
      const name = match[1]
      const startOffset = match.index
      const startLine = source.slice(0, startOffset).split('\n').length
      const endLine = computeEndLine(lines, startLine, langKey)
      results.push({ name, kind: rule.kind, range: { start: startLine, end: endLine } })
      match = regex.exec(source)
    }
  }
  results.sort((a, b) => a.range.start - b.range.start)
  return results
}

// Brace-balance end detection is a v1 simplification: braces inside strings,
// regex literals, or comments can cause early termination. Acceptable for the
// current use case (rough range bounds for declaration-overlap checks).
function computeEndLine(lines: string[], startLine: number, lang: string): number {
  if (lang === 'py') {
    const header = lines[startLine - 1] ?? ''
    const baseIndent = header.match(/^\s*/)?.[0].length ?? 0
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim().length === 0) continue
      const indent = line.match(/^\s*/)?.[0].length ?? 0
      if (indent <= baseIndent) return i
    }
    return lines.length
  }
  let depth = 0
  let seenOpen = false
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') {
        depth++
        seenOpen = true
      } else if (ch === '}') {
        depth--
        if (seenOpen && depth <= 0) return i + 1
      }
    }
  }
  return Math.min(startLine + 50, lines.length)
}

export function intersectRangesWithTouchedLines<
  T extends { range: { start: number; end: number } },
>(decls: T[], touched: Array<{ start: number; end: number }>): T[] {
  if (touched.length === 0) return []
  return decls.filter((d) => touched.some((t) => d.range.start <= t.end && d.range.end >= t.start))
}
