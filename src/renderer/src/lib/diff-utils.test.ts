import { describe, expect, test } from 'bun:test'
import { buildPairedLines, computeDiffHunks, parseUnifiedDiff } from './diff-utils'

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
