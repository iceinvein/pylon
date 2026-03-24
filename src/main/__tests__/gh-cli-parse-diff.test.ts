import { describe, expect, test } from 'bun:test'
import { parseFilesFromDiff } from '../gh-cli-parse'

describe('parseFilesFromDiff', () => {
  test('parses a single file diff', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo'
+import { bar } from './bar'

 export function main() {
-  foo()
+  bar()
+  foo()
 }
`
    const files = parseFilesFromDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('src/index.ts')
    expect(files[0].additions).toBe(3)
    expect(files[0].deletions).toBe(1)
  })

  test('parses multiple file diffs', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
 const a = 1
+const b = 2
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1 @@
 const x = 1
-const y = 2
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-# Old Title
+# New Title
`
    const files = parseFilesFromDiff(diff)
    expect(files).toHaveLength(3)
    expect(files[0]).toEqual({ path: 'src/a.ts', additions: 1, deletions: 0 })
    expect(files[1]).toEqual({ path: 'src/b.ts', additions: 0, deletions: 1 })
    expect(files[2]).toEqual({ path: 'README.md', additions: 1, deletions: 1 })
  })

  test('handles renamed files', () => {
    const diff = `diff --git a/old/path.ts b/new/path.ts
similarity index 95%
rename from old/path.ts
rename to new/path.ts
--- a/old/path.ts
+++ b/new/path.ts
@@ -1,2 +1,3 @@
 const x = 1
+const y = 2
 export { x }
`
    const files = parseFilesFromDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('new/path.ts')
    expect(files[0].additions).toBe(1)
  })

  test('handles binary files with no hunk content', () => {
    const diff = `diff --git a/image.png b/image.png
Binary files /dev/null and b/image.png differ
`
    const files = parseFilesFromDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('image.png')
    expect(files[0].additions).toBe(0)
    expect(files[0].deletions).toBe(0)
  })

  test('handles empty diff string', () => {
    const files = parseFilesFromDiff('')
    expect(files).toHaveLength(0)
  })

  test('handles new file creation', () => {
    const diff = `diff --git a/new-file.ts b/new-file.ts
new file mode 100644
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,3 @@
+export const a = 1
+export const b = 2
+export const c = 3
`
    const files = parseFilesFromDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('new-file.ts')
    expect(files[0].additions).toBe(3)
    expect(files[0].deletions).toBe(0)
  })

  test('handles file deletion', () => {
    const files = parseFilesFromDiff(`diff --git a/removed.ts b/removed.ts
deleted file mode 100644
--- a/removed.ts
+++ /dev/null
@@ -1,4 +0,0 @@
-export const a = 1
-export const b = 2
-export const c = 3
-export const d = 4
`)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('removed.ts')
    expect(files[0].additions).toBe(0)
    expect(files[0].deletions).toBe(4)
  })
})
