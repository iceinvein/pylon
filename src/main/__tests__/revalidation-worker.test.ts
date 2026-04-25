import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let rawDb: Database

function createDbProxy(db: Database) {
  return {
    prepare(sql: string) {
      return db.query(sql)
    },
    exec(sql: string) {
      db.exec(sql)
    },
    pragma(p: string) {
      db.exec(`PRAGMA ${p}`)
    },
  }
}

let dbProxy: ReturnType<typeof createDbProxy>

mock.module('../db', () => ({
  getDb: () => dbProxy,
  initDatabase: () => dbProxy,
}))

function initTestDb() {
  rawDb = new Database(':memory:')
  dbProxy = createDbProxy(rawDb)

  rawDb.exec(`
    CREATE TABLE pr_review_threads (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      domain TEXT,
      canonical_title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'needs_revalidation',
      first_seen_review_id TEXT NOT NULL,
      last_seen_review_id TEXT NOT NULL,
      last_file TEXT,
      last_line INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE pr_review_findings (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      file TEXT,
      line INTEGER,
      severity TEXT NOT NULL,
      impact TEXT NOT NULL DEFAULT 'medium',
      likelihood TEXT NOT NULL DEFAULT 'possible',
      confidence TEXT NOT NULL DEFAULT 'medium',
      action TEXT NOT NULL DEFAULT 'consider',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      suggestion_body TEXT,
      suggestion_start_line INTEGER,
      suggestion_end_line INTEGER,
      thread_id TEXT,
      status_in_run TEXT NOT NULL DEFAULT 'new',
      fingerprint TEXT,
      matched_by TEXT,
      anchor_json TEXT,
      source_review_id TEXT,
      carried_forward INTEGER NOT NULL DEFAULT 0,
      domain TEXT,
      merged_from TEXT,
      posted INTEGER NOT NULL DEFAULT 0,
      posted_at INTEGER
    );
  `)
}

function seedThreadAndPriorFinding(args: {
  threadId: string
  seriesId: string
  reviewId: string
  file: string
  line: number
  title: string
  description: string
}) {
  rawDb
    .query(
      'INSERT INTO pr_review_threads (id, series_id, fingerprint, canonical_title, status, first_seen_review_id, last_seen_review_id, last_file, last_line, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      args.threadId,
      args.seriesId,
      `fp-${args.threadId}`,
      args.title,
      'persisting',
      args.reviewId,
      args.reviewId,
      args.file,
      args.line,
      1,
      1,
    )
  rawDb
    .query(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description, status_in_run, thread_id, carried_forward) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      crypto.randomUUID(),
      args.reviewId,
      args.file,
      args.line,
      'high',
      args.title,
      args.description,
      'persisting',
      args.threadId,
      0,
    )
}

describe('revalidation-worker', () => {
  let tempDir: string
  let mod: typeof import('../revalidation-worker')

  beforeEach(async () => {
    initTestDb()
    tempDir = await mkdtemp(join(tmpdir(), 'reval-'))
    mod = await import(`../revalidation-worker?reval-${Date.now()}`)
  })

  afterEach(async () => {
    rawDb?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  test('selectThreadsToRevalidate filters to touched files only', () => {
    seedThreadAndPriorFinding({
      threadId: 'thread-touched',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'src/touched.ts',
      line: 12,
      title: 'Issue A',
      description: 'desc A',
    })
    seedThreadAndPriorFinding({
      threadId: 'thread-untouched',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'src/untouched.ts',
      line: 4,
      title: 'Issue B',
      description: 'desc B',
    })

    const candidates = mod.selectThreadsToRevalidate(
      'review-current',
      'series-1',
      new Set(['src/touched.ts']),
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].threadId).toBe('thread-touched')
  })

  test('runRevalidationPass emits persisting outcome on still_applies', async () => {
    seedThreadAndPriorFinding({
      threadId: 'thread-1',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'app.ts',
      line: 10,
      title: 'Null deref',
      description: 'foo can be null',
    })
    await writeFile(
      join(tempDir, 'app.ts'),
      Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'),
    )

    const outcomes = await mod.runRevalidationPass({
      reviewId: 'review-current',
      seriesId: 'series-1',
      repoCwd: tempDir,
      touchedFiles: new Set(['app.ts']),
      runSession: async () =>
        '```revalidation\n{ "verdict": "still_applies", "reasoning": "still there" }\n```',
    })

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].verdict).toBe('still_applies')
    expect(outcomes[0].finding.statusInRun).toBe('persisting')
    expect(outcomes[0].finding.carriedForward).toBe(true)
    expect(outcomes[0].finding.threadId).toBe('thread-1')
  })

  test('runRevalidationPass emits resolved when verdict is resolved', async () => {
    seedThreadAndPriorFinding({
      threadId: 'thread-2',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'app.ts',
      line: 10,
      title: 'Null deref',
      description: 'foo can be null',
    })
    await writeFile(join(tempDir, 'app.ts'), 'fixed\n'.repeat(20))

    const outcomes = await mod.runRevalidationPass({
      reviewId: 'review-current',
      seriesId: 'series-1',
      repoCwd: tempDir,
      touchedFiles: new Set(['app.ts']),
      runSession: async () =>
        '```revalidation\n{ "verdict": "resolved", "reasoning": "guard added" }\n```',
    })

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].verdict).toBe('resolved')
    expect(outcomes[0].finding.statusInRun).toBe('resolved')
  })

  test('runRevalidationPass emits needs_revalidation on parse failure', async () => {
    seedThreadAndPriorFinding({
      threadId: 'thread-3',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'app.ts',
      line: 10,
      title: 'Null deref',
      description: 'foo can be null',
    })
    await writeFile(join(tempDir, 'app.ts'), 'something\n'.repeat(20))

    const outcomes = await mod.runRevalidationPass({
      reviewId: 'review-current',
      seriesId: 'series-1',
      repoCwd: tempDir,
      touchedFiles: new Set(['app.ts']),
      runSession: async () => 'agent rambled and never produced JSON',
    })

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].verdict).toBe('uncertain')
    expect(outcomes[0].finding.statusInRun).toBe('needs_revalidation')
  })

  test('runRevalidationPass marks needs_revalidation when session throws', async () => {
    seedThreadAndPriorFinding({
      threadId: 'thread-4',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'app.ts',
      line: 10,
      title: 'Null deref',
      description: 'foo can be null',
    })
    await writeFile(join(tempDir, 'app.ts'), 'something\n'.repeat(20))

    const outcomes = await mod.runRevalidationPass({
      reviewId: 'review-current',
      seriesId: 'series-1',
      repoCwd: tempDir,
      touchedFiles: new Set(['app.ts']),
      runSession: async () => {
        throw new Error('agent boom')
      },
    })

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0].verdict).toBe('uncertain')
    expect(outcomes[0].finding.statusInRun).toBe('needs_revalidation')
  })

  test('runRevalidationPass applies updatedLine and updatedTitle from agent', async () => {
    seedThreadAndPriorFinding({
      threadId: 'thread-5',
      seriesId: 'series-1',
      reviewId: 'review-prev',
      file: 'app.ts',
      line: 10,
      title: 'Original title',
      description: 'desc',
    })
    await writeFile(join(tempDir, 'app.ts'), 'foo\n'.repeat(40))

    const outcomes = await mod.runRevalidationPass({
      reviewId: 'review-current',
      seriesId: 'series-1',
      repoCwd: tempDir,
      touchedFiles: new Set(['app.ts']),
      runSession: async () =>
        '```revalidation\n{ "verdict": "still_applies", "reasoning": "moved", "updatedLine": 14, "updatedTitle": "Refined title" }\n```',
    })

    expect(outcomes[0].finding.line).toBe(14)
    expect(outcomes[0].finding.title).toBe('Refined title')
  })
})
