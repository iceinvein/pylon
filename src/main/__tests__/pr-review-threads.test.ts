import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReviewFinding } from '../../shared/types'

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

mock.module('../session-manager', () => ({
  sessionManager: {
    getModelContextWindow: () => null,
    createSession: mock(() => Promise.resolve('session-1')),
    setPermissionMode: mock(() => {}),
    onMessage: mock(() => () => {}),
    sendMessage: mock(() => Promise.resolve()),
    stopSession: mock(() => {}),
  },
}))

mock.module('../gh-cli', () => ({
  getPrDetail: mock(() =>
    Promise.resolve({
      number: 1,
      title: 'Title',
      body: '',
      author: 'author',
      state: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      headBranch: 'feature',
      baseBranch: 'main',
      additions: 1,
      deletions: 0,
      reviewDecision: null,
      isDraft: false,
      url: 'https://example.com/pr/1',
      files: [],
      diff: '',
      headSha: 'head',
      baseSha: 'base',
      repo: { owner: 'acme', repo: 'app', fullName: 'acme/app', projectPath: '/tmp/app' },
    }),
  ),
  // Stubs to avoid polluting other test files that share the cached gh-cli mock
  checkGhStatus: mock(() =>
    Promise.resolve({
      available: false,
      authenticated: false,
      binaryPath: null,
      username: null,
      error: null,
    }),
  ),
  discoverRepos: mock(() => Promise.resolve([])),
  listPrs: mock(() => Promise.resolve([])),
  getHeadCommitSha: mock(() => Promise.resolve('')),
  postComment: mock(() => Promise.resolve()),
  postFindingComment: mock(() =>
    Promise.resolve({ kind: 'inline', ghCommentId: null, ghCommentUrl: null, body: '' }),
  ),
  postReview: mock(() =>
    Promise.resolve({
      ghReviewId: null,
      ghReviewUrl: null,
      reviewBody: '',
      inlineFindings: [],
      inlineCommentBodies: [],
    }),
  ),
  appendToPullRequestReviewComment: mock(() => Promise.resolve(true)),
}))

function baseFinding(): ReviewFinding {
  return {
    id: crypto.randomUUID(),
    file: 'src/app.ts',
    line: 42,
    severity: 'high',
    risk: {
      impact: 'high',
      likelihood: 'possible',
      confidence: 'medium',
      action: 'should-fix',
    },
    title: 'Null guard missing before dereference',
    description: 'Observation: The value can be null here.',
    domain: 'bugs',
    posted: false,
    postUrl: null,
    threadId: null,
    statusInRun: 'new',
    carriedForward: false,
    sourceReviewId: null,
  }
}

function initTestDb() {
  rawDb = new Database(':memory:')
  dbProxy = createDbProxy(rawDb)

  rawDb.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE pr_review_series (
      id TEXT PRIMARY KEY,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      latest_review_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE pr_reviews (
      id TEXT PRIMARY KEY,
      series_id TEXT,
      parent_review_id TEXT,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_title TEXT,
      pr_url TEXT,
      focus TEXT,
      review_mode TEXT NOT NULL DEFAULT 'full',
      trigger TEXT NOT NULL DEFAULT 'manual',
      base_sha TEXT,
      head_sha TEXT,
      merge_base_sha TEXT,
      compared_from_sha TEXT,
      compared_to_sha TEXT,
      review_scope TEXT NOT NULL DEFAULT 'full-pr',
      summary_json TEXT NOT NULL DEFAULT '{"newCount":0,"persistingCount":0,"resolvedCount":0,"staleCount":0}',
      incremental_valid INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      session_id TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      raw_output TEXT,
      cost_usd REAL NOT NULL DEFAULT 0
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
  `)
}

describe('prReviewManager thread persistence', () => {
  let prReviewManager: Awaited<typeof import('../pr-review-manager')>['prReviewManager']

  beforeEach(async () => {
    initTestDb()
    const mod = await import(`../pr-review-manager?t=${Date.now()}`)
    prReviewManager = mod.prReviewManager
  })

  afterEach(() => {
    rawDb?.close()
  })

  test('saveFindings creates and reuses threads across runs', () => {
    const now = Date.now()
    rawDb
      .query(
        'INSERT INTO pr_review_series (id, repo_full_name, pr_number, latest_review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('series-1', 'acme/app', 1, null, now, now)

    rawDb
      .query(
        'INSERT INTO pr_reviews (id, series_id, parent_review_id, repo_full_name, pr_number, pr_title, pr_url, focus, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'review-1',
        'series-1',
        null,
        'acme/app',
        1,
        'PR title',
        'https://example.com/pr/1',
        '["bugs"]',
        'done',
        now,
      )

    prReviewManager.saveFindings('review-1', [baseFinding()])

    const firstThread = rawDb.query('SELECT * FROM pr_review_threads').get() as Record<
      string,
      unknown
    >
    expect(firstThread).toBeTruthy()
    expect(firstThread.status).toBe('new')
    expect(firstThread.first_seen_review_id).toBe('review-1')
    expect(firstThread.last_seen_review_id).toBe('review-1')

    const firstFinding = rawDb
      .query('SELECT * FROM pr_review_findings WHERE review_id = ?')
      .get('review-1') as Record<string, unknown>
    expect(firstFinding.thread_id).toBe(firstThread.id)
    expect(firstFinding.status_in_run).toBe('new')
    expect(firstFinding.source_review_id).toBeNull()

    rawDb
      .query(
        'INSERT INTO pr_reviews (id, series_id, parent_review_id, repo_full_name, pr_number, pr_title, pr_url, focus, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'review-2',
        'series-1',
        'review-1',
        'acme/app',
        1,
        'PR title',
        'https://example.com/pr/1',
        '["bugs"]',
        'done',
        now + 1000,
      )

    prReviewManager.saveFindings('review-2', [baseFinding()])

    const threads = rawDb
      .query('SELECT * FROM pr_review_threads ORDER BY created_at')
      .all() as Array<Record<string, unknown>>
    expect(threads).toHaveLength(1)
    expect(threads[0].status).toBe('persisting')
    expect(threads[0].last_seen_review_id).toBe('review-2')

    const secondFinding = rawDb
      .query('SELECT * FROM pr_review_findings WHERE review_id = ?')
      .get('review-2') as Record<string, unknown>
    expect(secondFinding.thread_id).toBe(threads[0].id)
    expect(secondFinding.status_in_run).toBe('persisting')
    expect(secondFinding.source_review_id).toBe('review-1')

    const series = prReviewManager.getReviewSeries('acme/app', 1)
    expect(series?.id).toBe('series-1')

    const reviewThreads = prReviewManager.getReviewThreads('series-1')
    expect(reviewThreads).toHaveLength(1)
    expect(reviewThreads[0].status).toBe('persisting')

    const timeline = prReviewManager.getReviewTimeline('series-1')
    expect(timeline).toHaveLength(2)
    expect(timeline[0].reviewId).toBe('review-2')
    expect(timeline[0].status).toBe('persisting')
    expect(timeline[0].title).toBe('Null guard missing before dereference')
    expect(timeline[0].file).toBe('src/app.ts')
    expect(timeline[0].carriedForward).toBe(false)
    expect(timeline[1].reviewId).toBe('review-1')
    expect(timeline[1].status).toBe('new')
  })

  test('uncertain matches do not over-merge into a single thread', () => {
    const now = Date.now()
    rawDb
      .query(
        'INSERT INTO pr_review_series (id, repo_full_name, pr_number, latest_review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('series-2', 'acme/app', 2, null, now, now)
    rawDb
      .query(
        'INSERT INTO pr_reviews (id, series_id, parent_review_id, repo_full_name, pr_number, pr_title, pr_url, focus, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'review-3',
        'series-2',
        null,
        'acme/app',
        2,
        'PR2',
        'https://example.com/pr/2',
        '["bugs"]',
        'done',
        now,
      )

    const original = baseFinding()
    const differentFile: ReviewFinding = {
      ...baseFinding(),
      id: crypto.randomUUID(),
      file: 'src/other.ts',
    }
    const differentTitle: ReviewFinding = {
      ...baseFinding(),
      id: crypto.randomUUID(),
      title: 'Off-by-one error in slice',
    }
    const differentDomain: ReviewFinding = {
      ...baseFinding(),
      id: crypto.randomUUID(),
      domain: 'security',
    }
    const differentLineFar: ReviewFinding = {
      ...baseFinding(),
      id: crypto.randomUUID(),
      line: 200,
    }

    prReviewManager.saveFindings('review-3', [
      original,
      differentFile,
      differentTitle,
      differentDomain,
      differentLineFar,
    ])

    const threads = rawDb.query('SELECT * FROM pr_review_threads').all() as Array<
      Record<string, unknown>
    >
    expect(threads).toHaveLength(5)
    const fingerprints = new Set(threads.map((t) => t.fingerprint as string))
    expect(fingerprints.size).toBe(5)
  })
})
