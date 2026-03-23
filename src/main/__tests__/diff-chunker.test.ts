import { expect, test } from 'bun:test'
import { chunkDiff, classifyFile, parseDiffIntoFiles } from '../diff-chunker'

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
  // JS/TS lockfiles
  expect(classifyFile('package-lock.json')).toBe('skip')
  expect(classifyFile('yarn.lock')).toBe('skip')
  expect(classifyFile('bun.lockb')).toBe('skip')
  expect(classifyFile('pnpm-lock.yaml')).toBe('skip')
  // Other ecosystem lockfiles
  expect(classifyFile('Cargo.lock')).toBe('skip')
  expect(classifyFile('Gemfile.lock')).toBe('skip')
  expect(classifyFile('poetry.lock')).toBe('skip')
  expect(classifyFile('Pipfile.lock')).toBe('skip')
  expect(classifyFile('composer.lock')).toBe('skip')
  expect(classifyFile('go.sum')).toBe('skip')
  expect(classifyFile('Podfile.lock')).toBe('skip')
  expect(classifyFile('mix.lock')).toBe('skip')
  expect(classifyFile('pubspec.lock')).toBe('skip')
  // Nested lockfiles (monorepo)
  expect(classifyFile('packages/web/yarn.lock')).toBe('skip')
  expect(classifyFile('services/api/Cargo.lock')).toBe('skip')
  // ORM migrations / snapshots
  expect(classifyFile('drizzle/meta/0000_snapshot.json')).toBe('skip')
  expect(classifyFile('drizzle/meta/_journal.json')).toBe('skip')
  expect(classifyFile('drizzle/0001_initial.sql')).toBe('skip')
  expect(classifyFile('drizzle/0002_add_users.sql')).toBe('skip')
  expect(classifyFile('src/db/schema.snapshot.json')).toBe('skip')
  expect(classifyFile('prisma/migrations/20240101_init/migration.sql')).toBe('skip')
  expect(classifyFile('migrations/0001_create_tables.sql')).toBe('skip')
  // Generated / build
  expect(classifyFile('dist/bundle.min.js')).toBe('skip')
  expect(classifyFile('coverage/lcov.info')).toBe('skip')
  expect(classifyFile('src/generated/schema.ts')).toBe('skip')
  expect(classifyFile('build/output.js')).toBe('skip')
  expect(classifyFile('.next/cache/data.json')).toBe('skip')
  // Documentation / prose
  expect(classifyFile('README.md')).toBe('skip')
  expect(classifyFile('docs/guide.md')).toBe('skip')
  expect(classifyFile('docs/setup.mdx')).toBe('skip')
  expect(classifyFile('CHANGELOG.md')).toBe('skip')
  expect(classifyFile('CHANGES')).toBe('skip')
  expect(classifyFile('LICENSE')).toBe('skip')
  expect(classifyFile('LICENSE.md')).toBe('skip')
  expect(classifyFile('LICENCE')).toBe('skip')
  expect(classifyFile('COPYING')).toBe('skip')
  expect(classifyFile('notes.txt')).toBe('skip')
  expect(classifyFile('docs/api.rst')).toBe('skip')
  expect(classifyFile('docs/guide.adoc')).toBe('skip')
  // Database snapshots
  expect(classifyFile('data/app.sqlite')).toBe('skip')
  expect(classifyFile('data/app.sqlite3')).toBe('skip')
  expect(classifyFile('local.db')).toBe('skip')
  expect(classifyFile('app.db-wal')).toBe('skip')
  expect(classifyFile('app.db-journal')).toBe('skip')
  expect(classifyFile('app.db-shm')).toBe('skip')
  // Data / log files
  expect(classifyFile('data/export.csv')).toBe('skip')
  expect(classifyFile('data/export.tsv')).toBe('skip')
  expect(classifyFile('logs/server.log')).toBe('skip')
  expect(classifyFile('data/events.ndjson')).toBe('skip')
  // Binary / assets
  expect(classifyFile('assets/logo.png')).toBe('skip')
  expect(classifyFile('fonts/inter.woff2')).toBe('skip')
  expect(classifyFile('icon.svg')).toBe('skip')
  // Media files
  expect(classifyFile('video/demo.mp4')).toBe('skip')
  expect(classifyFile('audio/clip.mp3')).toBe('skip')
  expect(classifyFile('video/intro.webm')).toBe('skip')
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
  const authIndices = files.map((f, i) => (f.includes('auth/') ? i : -1)).filter((i) => i >= 0)
  expect(authIndices[1] - authIndices[0]).toBe(1)
})
