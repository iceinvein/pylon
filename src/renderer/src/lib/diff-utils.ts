import { diffLines } from 'diff'

export type DiffLine = {
  type: 'context' | 'added' | 'removed'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

export type DiffHunk = {
  lines: DiffLine[]
}

const CONTEXT_LINES = 3

/**
 * @param extraNewLineNos - Additional newLineNo values to include in the visible hunks
 *   (e.g., lines referenced by findings that may be outside the normal context window)
 */
export function computeDiffHunks(oldStr: string, newStr: string, extraNewLineNos?: Set<number>): DiffHunk[] {
  const changes = diffLines(oldStr, newStr)
  const allLines: DiffLine[] = []
  let oldLine = 1
  let newLine = 1

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, '').split('\n')
    for (const line of lines) {
      if (change.added) {
        allLines.push({ type: 'added', content: line, newLineNo: newLine++ })
      } else if (change.removed) {
        allLines.push({ type: 'removed', content: line, oldLineNo: oldLine++ })
      } else {
        allLines.push({ type: 'context', content: line, oldLineNo: oldLine++, newLineNo: newLine++ })
      }
    }
  }

  const changedIndices = new Set<number>()
  allLines.forEach((line, i) => {
    if (line.type !== 'context') changedIndices.add(i)
  })

  // Also treat finding-referenced lines as "interesting" so they appear in hunks
  if (extraNewLineNos) {
    allLines.forEach((line, i) => {
      if (line.newLineNo && extraNewLineNos.has(line.newLineNo)) {
        changedIndices.add(i)
      }
    })
  }

  if (changedIndices.size === 0) return []

  const visibleIndices = new Set<number>()
  for (const idx of changedIndices) {
    for (let i = Math.max(0, idx - CONTEXT_LINES); i <= Math.min(allLines.length - 1, idx + CONTEXT_LINES); i++) {
      visibleIndices.add(i)
    }
  }

  const sorted = [...visibleIndices].sort((a, b) => a - b)
  const hunks: DiffHunk[] = []
  let currentHunk: DiffLine[] = []

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      hunks.push({ lines: currentHunk })
      currentHunk = []
    }
    currentHunk.push(allLines[sorted[i]])
  }
  if (currentHunk.length > 0) {
    hunks.push({ lines: currentHunk })
  }

  return hunks
}

export function parseUnifiedDiff(unifiedDiff: string): { oldStr: string; newStr: string } {
  const lines = unifiedDiff.split('\n')
  const oldLines: string[] = []
  const newLines: string[] = []
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) continue

    if (line.startsWith('-')) {
      oldLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      newLines.push(line.slice(1))
    } else if (line.startsWith(' ')) {
      oldLines.push(line.slice(1))
      newLines.push(line.slice(1))
    } else if (line === '\\ No newline at end of file') {
      // skip
    }
  }

  return { oldStr: oldLines.join('\n'), newStr: newLines.join('\n') }
}

/**
 * Parse a unified diff directly into DiffHunks, preserving the original line
 * numbers from @@ headers. This avoids the re-diffing approach which produces
 * wrong line numbers when the diff has gaps between hunks.
 */
export function parseUnifiedDiffToHunks(unifiedDiff: string): DiffHunk[] {
  const lines = unifiedDiff.split('\n')
  const hunks: DiffHunk[] = []
  let currentLines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    const hhMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hhMatch) {
      if (currentLines.length > 0) {
        hunks.push({ lines: currentLines })
        currentLines = []
      }
      oldLine = parseInt(hhMatch[1], 10)
      newLine = parseInt(hhMatch[2], 10)
      continue
    }
    if (oldLine === 0 && newLine === 0) continue // before first hunk header

    if (line.startsWith('-')) {
      currentLines.push({ type: 'removed', content: line.slice(1), oldLineNo: oldLine++ })
    } else if (line.startsWith('+')) {
      currentLines.push({ type: 'added', content: line.slice(1), newLineNo: newLine++ })
    } else if (line.startsWith(' ')) {
      currentLines.push({ type: 'context', content: line.slice(1), oldLineNo: oldLine++, newLineNo: newLine++ })
    } else if (line === '\\ No newline at end of file') {
      // skip
    }
  }
  if (currentLines.length > 0) {
    hunks.push({ lines: currentLines })
  }

  return hunks
}

export function buildPairedLines(hunks: DiffHunk[]): Map<DiffLine, string> {
  const map = new Map<DiffLine, string>()
  for (const hunk of hunks) {
    let i = 0
    while (i < hunk.lines.length) {
      const removeStart = i
      while (i < hunk.lines.length && hunk.lines[i].type === 'removed') i++
      const removeEnd = i
      const addStart = i
      while (i < hunk.lines.length && hunk.lines[i].type === 'added') i++
      const addEnd = i

      const removeCount = removeEnd - removeStart
      const addCount = addEnd - addStart

      if (removeCount > 0 && addCount > 0 && removeCount === addCount) {
        for (let j = 0; j < removeCount; j++) {
          const removedLine = hunk.lines[removeStart + j]
          const addedLine = hunk.lines[addStart + j]
          map.set(removedLine, addedLine.content)
          map.set(addedLine, removedLine.content)
        }
      }

      if (i === removeStart) i++
    }
  }
  return map
}
