import { describe, expect, test } from 'bun:test'
import {
  buildPairedLines,
  computeDiffHunks,
  filePathMatches,
  parseUnifiedDiff,
  parseUnifiedDiffToHunks,
} from './diff-utils'

describe('filePathMatches', () => {
  test('exact match returns true', () => {
    expect(filePathMatches('src/foo.ts', 'src/foo.ts')).toBe(true)
  })

  test('shorter suffix aligned on / boundary returns true', () => {
    expect(filePathMatches('packages/app/src/foo.ts', 'src/foo.ts')).toBe(true)
  })

  test('reversed argument order also works', () => {
    expect(filePathMatches('src/foo.ts', 'packages/app/src/foo.ts')).toBe(true)
  })

  test('non-boundary suffix returns false (admin_config.rs vs config.rs)', () => {
    expect(filePathMatches('admin_config.rs', 'config.rs')).toBe(false)
  })

  test('completely different paths return false', () => {
    expect(filePathMatches('src/a.ts', 'src/b.ts')).toBe(false)
  })

  test('same-length different paths return false', () => {
    expect(filePathMatches('abc', 'xyz')).toBe(false)
  })
})

describe('computeDiffHunks', () => {
  test('returns empty array for identical strings', () => {
    const text = 'line1\nline2\nline3'
    expect(computeDiffHunks(text, text)).toEqual([])
  })

  test('detects a single added line', () => {
    const old = 'line1\nline2'
    const new_ = 'line1\nline2\nline3'
    const hunks = computeDiffHunks(old, new_)
    expect(hunks).toHaveLength(1)
    const addedLines = hunks[0].lines.filter((l) => l.type === 'added')
    expect(addedLines.length).toBeGreaterThanOrEqual(1)
    expect(addedLines.some((l) => l.content === 'line3')).toBe(true)
  })

  test('detects a single removed line', () => {
    const old = 'line1\nline2\nline3'
    const new_ = 'line1\nline3'
    const hunks = computeDiffHunks(old, new_)
    expect(hunks).toHaveLength(1)
    const removedLines = hunks[0].lines.filter((l) => l.type === 'removed')
    expect(removedLines).toHaveLength(1)
    expect(removedLines[0].content).toBe('line2')
  })

  test('detects a modification (remove + add)', () => {
    const old = 'hello world'
    const new_ = 'hello universe'
    const hunks = computeDiffHunks(old, new_)
    expect(hunks).toHaveLength(1)
    const types = hunks[0].lines.map((l) => l.type)
    expect(types).toContain('removed')
    expect(types).toContain('added')
  })

  test('includes context lines around changes', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
    const old = lines.join('\n')
    const modified = [...lines]
    modified[10] = 'CHANGED'
    const new_ = modified.join('\n')

    const hunks = computeDiffHunks(old, new_)
    expect(hunks).toHaveLength(1)

    const contextLines = hunks[0].lines.filter((l) => l.type === 'context')
    // Should have up to 3 context lines before and 3 after the change
    expect(contextLines.length).toBeLessThanOrEqual(6)
    expect(contextLines.length).toBeGreaterThan(0)
  })

  test('produces separate hunks for distant changes', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`)
    const old = lines.join('\n')
    const modified = [...lines]
    modified[2] = 'CHANGED_EARLY'
    modified[27] = 'CHANGED_LATE'
    const new_ = modified.join('\n')

    const hunks = computeDiffHunks(old, new_)
    expect(hunks.length).toBeGreaterThanOrEqual(2)
  })

  test('assigns correct line numbers', () => {
    const old = 'a\nb\nc'
    const new_ = 'a\nB\nc'
    const hunks = computeDiffHunks(old, new_)
    expect(hunks).toHaveLength(1)

    const removed = hunks[0].lines.find((l) => l.type === 'removed')
    const added = hunks[0].lines.find((l) => l.type === 'added')
    expect(removed?.oldLineNo).toBe(2)
    expect(added?.newLineNo).toBe(2)
  })

  test('handles empty old string (all added)', () => {
    const hunks = computeDiffHunks('', 'new content')
    expect(hunks).toHaveLength(1)
    const addedLines = hunks[0].lines.filter((l) => l.type === 'added')
    expect(addedLines.length).toBeGreaterThan(0)
  })

  test('handles empty new string (all removed)', () => {
    const hunks = computeDiffHunks('old content', '')
    expect(hunks).toHaveLength(1)
    const removedLines = hunks[0].lines.filter((l) => l.type === 'removed')
    expect(removedLines.length).toBeGreaterThan(0)
  })
})

describe('parseUnifiedDiff', () => {
  test('parses a simple unified diff', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`

    const result = parseUnifiedDiff(diff)
    expect(result.oldStr).toBe('line1\nold line\nline3')
    expect(result.newStr).toBe('line1\nnew line\nline3')
  })

  test('handles additions only', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 line1
+added line
 line2`

    const result = parseUnifiedDiff(diff)
    expect(result.oldStr).toBe('line1\nline2')
    expect(result.newStr).toBe('line1\nadded line\nline2')
  })

  test('handles removals only', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,2 @@
 line1
-removed line
 line2`

    const result = parseUnifiedDiff(diff)
    expect(result.oldStr).toBe('line1\nremoved line\nline2')
    expect(result.newStr).toBe('line1\nline2')
  })

  test('ignores "No newline at end of file" marker', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-old
+new
\\ No newline at end of file`

    const result = parseUnifiedDiff(diff)
    expect(result.oldStr).toBe('old')
    expect(result.newStr).toBe('new')
  })

  test('handles multiple hunks', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 first
-old1
+new1
 middle
@@ -10,3 +10,3 @@
 before
-old2
+new2
 after`

    const result = parseUnifiedDiff(diff)
    expect(result.oldStr).toBe('first\nold1\nmiddle\nbefore\nold2\nafter')
    expect(result.newStr).toBe('first\nnew1\nmiddle\nbefore\nnew2\nafter')
  })

  test('returns empty strings for empty diff', () => {
    const result = parseUnifiedDiff('')
    expect(result.oldStr).toBe('')
    expect(result.newStr).toBe('')
  })

  test('ignores lines before first hunk header', () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc123..def456 100644
--- a/file.ts
+++ b/file.ts
some random preamble
@@ -1,2 +1,2 @@
-old
+new`

    const result = parseUnifiedDiff(diff)
    expect(result.oldStr).toBe('old')
    expect(result.newStr).toBe('new')
  })
})

describe('computeDiffHunks with extraNewLineNos', () => {
  test('includes extra lines referenced by findings in visible hunks', () => {
    // 20 lines, change line 5, but also request line 15 via extraNewLineNos
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
    const old = lines.join('\n')
    const modified = [...lines]
    modified[4] = 'CHANGED' // line 5
    const new_ = modified.join('\n')

    const hunks = computeDiffHunks(old, new_, new Set([15]))
    // Should have 2 hunks: one around line 5, one around line 15
    expect(hunks.length).toBeGreaterThanOrEqual(2)
    // The second hunk should include context around line 15
    const allNewLineNos = hunks.flatMap((h) => h.lines.map((l) => l.newLineNo).filter(Boolean))
    expect(allNewLineNos).toContain(15)
  })
})

describe('parseUnifiedDiffToHunks', () => {
  test('parses a simple unified diff into hunks', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`

    const hunks = parseUnifiedDiffToHunks(diff)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines).toHaveLength(4)

    const removed = hunks[0].lines.find((l) => l.type === 'removed')
    const added = hunks[0].lines.find((l) => l.type === 'added')
    expect(removed?.content).toBe('old line')
    expect(removed?.oldLineNo).toBe(2)
    expect(added?.content).toBe('new line')
    expect(added?.newLineNo).toBe(2)
  })

  test('preserves original line numbers from @@ headers', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -10,3 +10,3 @@
 before
-old
+new
 after`

    const hunks = parseUnifiedDiffToHunks(diff)
    expect(hunks).toHaveLength(1)
    const context1 = hunks[0].lines[0]
    expect(context1.oldLineNo).toBe(10)
    expect(context1.newLineNo).toBe(10)
  })

  test('handles multiple hunks', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 first
-old1
+new1
 middle
@@ -20,3 +20,3 @@
 before
-old2
+new2
 after`

    const hunks = parseUnifiedDiffToHunks(diff)
    expect(hunks).toHaveLength(2)
    expect(hunks[0].lines.find((l) => l.type === 'added')?.content).toBe('new1')
    expect(hunks[1].lines.find((l) => l.type === 'added')?.content).toBe('new2')
    // Second hunk should start at line 20
    expect(hunks[1].lines[0].oldLineNo).toBe(20)
  })

  test('returns empty array for empty input', () => {
    expect(parseUnifiedDiffToHunks('')).toEqual([])
  })

  test('ignores "No newline at end of file" marker', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-old
+new
\\ No newline at end of file`

    const hunks = parseUnifiedDiffToHunks(diff)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines).toHaveLength(2)
  })

  test('ignores lines before first hunk header', () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc123..def456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-old
+new`

    const hunks = parseUnifiedDiffToHunks(diff)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines).toHaveLength(2)
  })
})

describe('buildPairedLines', () => {
  test('returns empty map for empty hunks', () => {
    const map = buildPairedLines([])
    expect(map.size).toBe(0)
  })

  test('returns empty map for context-only hunks', () => {
    const map = buildPairedLines([
      {
        lines: [
          { type: 'context', content: 'line1', oldLineNo: 1, newLineNo: 1 },
          { type: 'context', content: 'line2', oldLineNo: 2, newLineNo: 2 },
        ],
      },
    ])
    expect(map.size).toBe(0)
  })

  test('pairs equal-count removed and added lines', () => {
    const removed = { type: 'removed' as const, content: 'old', oldLineNo: 1 }
    const added = { type: 'added' as const, content: 'new', newLineNo: 1 }

    const map = buildPairedLines([{ lines: [removed, added] }])
    expect(map.get(removed)).toBe('new')
    expect(map.get(added)).toBe('old')
  })

  test('pairs multiple removed/added lines in order', () => {
    const r1 = { type: 'removed' as const, content: 'old1', oldLineNo: 1 }
    const r2 = { type: 'removed' as const, content: 'old2', oldLineNo: 2 }
    const a1 = { type: 'added' as const, content: 'new1', newLineNo: 1 }
    const a2 = { type: 'added' as const, content: 'new2', newLineNo: 2 }

    const map = buildPairedLines([{ lines: [r1, r2, a1, a2] }])
    expect(map.get(r1)).toBe('new1')
    expect(map.get(r2)).toBe('new2')
    expect(map.get(a1)).toBe('old1')
    expect(map.get(a2)).toBe('old2')
  })

  test('does not pair when remove/add counts differ', () => {
    const r1 = { type: 'removed' as const, content: 'old1', oldLineNo: 1 }
    const a1 = { type: 'added' as const, content: 'new1', newLineNo: 1 }
    const a2 = { type: 'added' as const, content: 'new2', newLineNo: 2 }

    const map = buildPairedLines([{ lines: [r1, a1, a2] }])
    expect(map.size).toBe(0)
  })

  test('does not pair standalone additions', () => {
    const a1 = { type: 'added' as const, content: 'new1', newLineNo: 1 }
    const ctx = { type: 'context' as const, content: 'ctx', oldLineNo: 1, newLineNo: 2 }

    const map = buildPairedLines([{ lines: [a1, ctx] }])
    expect(map.size).toBe(0)
  })

  test('does not pair standalone removals', () => {
    const r1 = { type: 'removed' as const, content: 'old1', oldLineNo: 1 }
    const ctx = { type: 'context' as const, content: 'ctx', oldLineNo: 2, newLineNo: 1 }

    const map = buildPairedLines([{ lines: [r1, ctx] }])
    expect(map.size).toBe(0)
  })

  test('handles multiple separate pairs in one hunk', () => {
    const r1 = { type: 'removed' as const, content: 'old1', oldLineNo: 1 }
    const a1 = { type: 'added' as const, content: 'new1', newLineNo: 1 }
    const ctx = { type: 'context' as const, content: 'middle', oldLineNo: 2, newLineNo: 2 }
    const r2 = { type: 'removed' as const, content: 'old2', oldLineNo: 3 }
    const a2 = { type: 'added' as const, content: 'new2', newLineNo: 3 }

    const map = buildPairedLines([{ lines: [r1, a1, ctx, r2, a2] }])
    expect(map.get(r1)).toBe('new1')
    expect(map.get(a1)).toBe('old1')
    expect(map.get(r2)).toBe('new2')
    expect(map.get(a2)).toBe('old2')
  })
})
