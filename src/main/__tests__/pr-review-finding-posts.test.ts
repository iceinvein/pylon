import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

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
  getPrDetail: mock(() => Promise.resolve({})),
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

    CREATE TABLE pr_review_finding_posts (
      id TEXT PRIMARY KEY,
      series_id TEXT,
      thread_id TEXT,
      finding_id TEXT NOT NULL,
      review_id TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      kind TEXT NOT NULL,
      gh_comment_id INTEGER,
      gh_comment_url TEXT,
      gh_review_id INTEGER,
      body_hash TEXT NOT NULL,
      posted_at INTEGER NOT NULL,
      resolved_at INTEGER
    );
  `)
}

function seedFinding(reviewId: string, threadId: string | null = null): string {
  const findingId = crypto.randomUUID()
  rawDb
    .query(
      'INSERT INTO pr_review_findings (id, review_id, file, line, severity, title, description, status_in_run, thread_id, carried_forward) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      findingId,
      reviewId,
      'src/app.ts',
      42,
      'high',
      'Null guard missing',
      'Observation: foo can be null',
      'new',
      threadId,
      0,
    )
  return findingId
}

describe('prReviewManager finding-post mapping', () => {
  let prReviewManager: Awaited<typeof import('../pr-review-manager')>['prReviewManager']

  beforeEach(async () => {
    initTestDb()
    const mod = await import(`../pr-review-manager?fp-${Date.now()}`)
    prReviewManager = mod.prReviewManager

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
      .run('review-1', 'series-1', null, 'acme/app', 1, 't', 'u', '["bugs"]', 'done', now)
  })

  afterEach(() => {
    rawDb?.close()
  })

  test('recordFindingPost stores mapping with thread + series', () => {
    const findingId = seedFinding('review-1', 'thread-1')
    rawDb
      .query(
        'INSERT INTO pr_review_threads (id, series_id, fingerprint, canonical_title, first_seen_review_id, last_seen_review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('thread-1', 'series-1', 'fp-1', 'Null guard missing', 'review-1', 'review-1', 1, 1)

    const post = prReviewManager.recordFindingPost({
      findingId,
      reviewId: 'review-1',
      repoFullName: 'acme/app',
      prNumber: 1,
      kind: 'inline',
      body: '### High: Null guard missing\n\nObservation',
      ghCommentId: 4242,
      ghCommentUrl: 'https://github.com/acme/app/pull/1#discussion_r4242',
    })

    expect(post.findingId).toBe(findingId)
    expect(post.threadId).toBe('thread-1')
    expect(post.seriesId).toBe('series-1')
    expect(post.kind).toBe('inline')
    expect(post.ghCommentId).toBe(4242)
    expect(post.ghCommentUrl).toBe('https://github.com/acme/app/pull/1#discussion_r4242')
    expect(post.bodyHash.length).toBeGreaterThan(8)
    expect(post.resolvedAt).toBeNull()

    const byThread = prReviewManager.getFindingPosts({ threadId: 'thread-1' })
    expect(byThread).toHaveLength(1)
    expect(byThread[0].id).toBe(post.id)

    const bySeries = prReviewManager.getFindingPosts({ seriesId: 'series-1' })
    expect(bySeries).toHaveLength(1)

    const byFinding = prReviewManager.getFindingPosts({ findingId })
    expect(byFinding).toHaveLength(1)
  })

  test('hydratePostUrls fills postUrl on getReview findings', () => {
    const findingId = seedFinding('review-1', 'thread-1')
    rawDb
      .query(
        'INSERT INTO pr_review_threads (id, series_id, fingerprint, canonical_title, first_seen_review_id, last_seen_review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('thread-1', 'series-1', 'fp-1', 'Null guard missing', 'review-1', 'review-1', 1, 1)

    prReviewManager.recordFindingPost({
      findingId,
      reviewId: 'review-1',
      repoFullName: 'acme/app',
      prNumber: 1,
      kind: 'inline',
      body: 'body',
      ghCommentId: 1,
      ghCommentUrl: 'https://github.com/acme/app/pull/1#discussion_r1',
    })

    const review = prReviewManager.getReview('review-1')
    expect(review).toBeTruthy()
    expect(review?.findings).toHaveLength(1)
    expect(review?.findings[0].postUrl).toBe('https://github.com/acme/app/pull/1#discussion_r1')
  })

  test('markFindingPostResolved excludes resolved posts from hydration', () => {
    const findingId = seedFinding('review-1', 'thread-1')
    rawDb
      .query(
        'INSERT INTO pr_review_threads (id, series_id, fingerprint, canonical_title, first_seen_review_id, last_seen_review_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('thread-1', 'series-1', 'fp-1', 'Null guard missing', 'review-1', 'review-1', 1, 1)

    const post = prReviewManager.recordFindingPost({
      findingId,
      reviewId: 'review-1',
      repoFullName: 'acme/app',
      prNumber: 1,
      kind: 'inline',
      body: 'body',
      ghCommentId: 1,
      ghCommentUrl: 'https://github.com/acme/app/pull/1#discussion_r1',
    })

    prReviewManager.markFindingPostResolved(post.id)

    const review = prReviewManager.getReview('review-1')
    expect(review?.findings[0].postUrl).toBeNull()
  })

  test('getFindingPosts with no filters returns empty', () => {
    const posts = prReviewManager.getFindingPosts({})
    expect(posts).toEqual([])
  })
})
