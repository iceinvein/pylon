import { test, expect } from 'bun:test'
import { parseDiffIntoFiles, classifyFile, chunkDiff } from '../diff-chunker'

test('parseDiffIntoFiles splits unified diff into per-file segments', () => {
  const diff = `diff --git a/src/main.ts b/src/main.ts
index abc..def 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
+import { foo } from './foo'
 const a = 1
 const b = 2
diff --git a/package.json b/package.json
index 111..222 100644
--- a/package.json
+++ b/package.json
@@ -1,3 +1,3 @@
-  "name": "old"
+  "name": "new"`

  const files = parseDiffIntoFiles(diff)
  expect(files).toHaveLength(2)
  expect(files[0].path).toBe('src/main.ts')
  expect(files[1].path).toBe('package.json')
  expect(files[0].diff).toContain('import { foo }')
  expect(files[1].diff).toContain('"name": "new"')
})

test('parseDiffIntoFiles handles empty diff', () => {
  expect(parseDiffIntoFiles('')).toEqual([])
})

test('classifyFile identifies source files as critical', () => {
  expect(classifyFile('src/main.ts')).toBe('critical')
  expect(classifyFile('lib/utils.tsx')).toBe('critical')
  expect(classifyFile('server.py')).toBe('critical')
})

test('classifyFile identifies config files as important', () => {
  expect(classifyFile('Dockerfile')).toBe('important')
  expect(classifyFile('deploy.yaml')).toBe('important')
  expect(classifyFile('.env.example')).toBe('important')
})

test('classifyFile identifies test files as low priority', () => {
  expect(classifyFile('src/main.test.ts')).toBe('low')
  expect(classifyFile('__tests__/foo.ts')).toBe('low')
  expect(classifyFile('src/foo.spec.js')).toBe('low')
})

test('classifyFile identifies generated/lock files as skip', () => {
  expect(classifyFile('package-lock.json')).toBe('skip')
  expect(classifyFile('yarn.lock')).toBe('skip')
  expect(classifyFile('bun.lockb')).toBe('skip')
  expect(classifyFile('dist/bundle.min.js')).toBe('skip')
  expect(classifyFile('coverage/lcov.info')).toBe('skip')
  expect(classifyFile('src/generated/schema.ts')).toBe('skip')
})

test('chunkDiff returns single chunk when diff fits', () => {
  const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,1 @@
-old
+new`

  const result = chunkDiff(diff, { tokenBudget: 100_000 })
  expect(result.chunks).toHaveLength(1)
  expect(result.skippedFiles).toEqual([])
})

test('chunkDiff splits large diff into multiple chunks', () => {
  const files = Array.from({ length: 20 }, (_, i) => {
    const content = 'x'.repeat(500)
    return `diff --git a/src/file${i}.ts b/src/file${i}.ts
--- a/src/file${i}.ts
+++ b/src/file${i}.ts
@@ -1,1 +1,2 @@
 existing
+${content}`
  }).join('\n')

  const result = chunkDiff(files, { tokenBudget: 800 })
  expect(result.chunks.length).toBeGreaterThan(1)
  const allFiles = result.chunks.flatMap((c) => c.files)
  expect(allFiles.length).toBe(20)
})

test('chunkDiff skips lock/generated files', () => {
  const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,1 +1,1 @@
-old
+new`

  const result = chunkDiff(diff, { tokenBudget: 100_000 })
  expect(result.chunks).toHaveLength(1)
  expect(result.chunks[0].files).toEqual(['src/app.ts'])
  expect(result.skippedFiles).toEqual(['package-lock.json'])
})

test('chunkDiff prioritizes critical files before low-priority files', () => {
  const diff = `diff --git a/src/app.test.ts b/src/app.test.ts
--- a/src/app.test.ts
+++ b/src/app.test.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,1 @@
-old
+new`

  const result = chunkDiff(diff, { tokenBudget: 100_000 })
  expect(result.chunks[0].files[0]).toBe('src/app.ts')
})

test('chunkDiff groups files in the same directory together', () => {
  const makeFile = (path: string) => `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1,1 +1,1 @@
-old
+new`

  const diff = [
    makeFile('src/auth/login.ts'),
    makeFile('src/db/connection.ts'),
    makeFile('src/auth/session.ts'),
  ].join('\n')

  const result = chunkDiff(diff, { tokenBudget: 100_000 })
  const files = result.chunks[0].files
  const authIndices = files
    .map((f, i) => (f.includes('auth/') ? i : -1))
    .filter((i) => i >= 0)
  expect(authIndices[1] - authIndices[0]).toBe(1)
})
