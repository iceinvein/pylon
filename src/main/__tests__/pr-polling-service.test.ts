import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock electron
mock.module('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: class {},
}))

// Use an in-memory DB for tests.
// The production service uses the better-sqlite3 API (prepare/transaction).
// We wrap bun:sqlite to expose a compatible surface.
let rawDb: Database

// Proxy object that mirrors the better-sqlite3 API used in PrPollingService
function createDbProxy(db: Database) {
  return {
    prepare(sql: string) {
      const stmt = db.query(sql)
      return stmt
    },
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
      return ((...args: unknown[]) => {
        db.run('BEGIN')
        try {
          const result = fn(...args)
          db.run('COMMIT')
          return result
        } catch (err) {
          try {
            db.run('ROLLBACK')
          } catch {
            /* ignore */
          }
          throw err
        }
      }) as T
    },
  }
}

let dbProxy: ReturnType<typeof createDbProxy>

mock.module('../db', () => ({
  getDb: () => dbProxy,
  initDatabase: () => dbProxy,
}))

// Mock gh-cli functions
type GhStatus = {
  available: boolean
  authenticated: boolean
  binaryPath: string | null
  username: string | null
  error: string | null
}
type GhRepoInfo = { owner: string; repo: string; fullName: string; projectPath: string }
type PrInfo = {
  number: number
  title: string
  author: string
  state: 'open' | 'closed' | 'merged'
  createdAt: string
  updatedAt: string
  headBranch: string
  baseBranch: string
  additions: number
  deletions: number
  reviewDecision: string | null
  isDraft: boolean
  url: string
  repo: GhRepoInfo
}

const mockCheckGhStatus = mock<(_?: unknown) => Promise<GhStatus>>(() =>
  Promise.resolve({
    available: true,
    authenticated: true,
    binaryPath: 'gh',
    username: 'testuser',
    error: null,
  }),
)
const mockDiscoverRepos = mock<(_?: unknown) => Promise<GhRepoInfo[]>>(() =>
  Promise.resolve([
    { owner: 'acme', repo: 'app', fullName: 'acme/app', projectPath: '/projects/app' },
  ]),
)
const mockListPrs = mock<(repo: string) => Promise<PrInfo[]>>(() =>
  Promise.resolve([
    {
      number: 1,
      title: 'Fix bug',
      author: 'alice',
      state: 'open' as const,
      createdAt: '2026-03-15T10:00:00Z',
      updatedAt: '2026-03-15T12:00:00Z',
      headBranch: 'fix-bug',
      baseBranch: 'main',
      additions: 10,
      deletions: 5,
      reviewDecision: null,
      isDraft: false,
      url: 'https://github.com/acme/app/pull/1',
      repo: { owner: '', repo: '', fullName: 'acme/app', projectPath: '' },
    },
    {
      number: 2,
      title: 'Add feature',
      author: 'bob',
      state: 'open' as const,
      createdAt: '2026-03-14T08:00:00Z',
      updatedAt: '2026-03-14T09:00:00Z',
      headBranch: 'add-feature',
      baseBranch: 'main',
      additions: 50,
      deletions: 0,
      reviewDecision: 'REVIEW_REQUIRED',
      isDraft: false,
      url: 'https://github.com/acme/app/pull/2',
      repo: { owner: '', repo: '', fullName: 'acme/app', projectPath: '' },
    },
  ]),
)

mock.module('../gh-cli', () => ({
  checkGhStatus: mockCheckGhStatus,
  discoverRepos: mockDiscoverRepos,
  listPrs: mockListPrs,
}))

// Mock session-manager
mock.module('../session-manager', () => ({
  sessionManager: {
    getProjectFolders: () => [{ path: '/projects/app', lastUsed: Date.now() }],
  },
}))

function initTestDb() {
  rawDb = new Database(':memory:')
  rawDb.run('PRAGMA journal_mode = WAL')
  rawDb.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  rawDb.run(`
    CREATE TABLE IF NOT EXISTS pr_cache (
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      head_branch TEXT NOT NULL,
      base_branch TEXT NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      review_decision TEXT,
      is_draft INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      repo_owner TEXT NOT NULL DEFAULT '',
      repo_name TEXT NOT NULL DEFAULT '',
      project_path TEXT NOT NULL DEFAULT '',
      last_seen_at INTEGER,
      last_polled_at INTEGER NOT NULL,
      PRIMARY KEY (repo_full_name, pr_number)
    )
  `)
  rawDb.run(
    `CREATE INDEX IF NOT EXISTS idx_pr_cache_unseen ON pr_cache(state, last_seen_at, updated_at)`,
  )
  dbProxy = createDbProxy(rawDb)
}

describe('PrPollingService', () => {
  let service: Awaited<typeof import('../pr-polling-service')>['prPollingService']

  beforeEach(async () => {
    initTestDb()
    mockCheckGhStatus.mockClear()
    mockDiscoverRepos.mockClear()
    mockListPrs.mockClear()
    // Re-import to get fresh singleton with new DB
    const mod = await import('../pr-polling-service')
    service = mod.prPollingService
  })

  afterEach(() => {
    service.stop()
  })

  test('poll upserts PRs into pr_cache', async () => {
    await service.poll()

    const rows = rawDb.query('SELECT * FROM pr_cache ORDER BY pr_number').all() as Record<
      string,
      unknown
    >[]
    expect(rows).toHaveLength(2)
    expect(rows[0].pr_number).toBe(1)
    expect(rows[0].title).toBe('Fix bug')
    expect(rows[0].repo_owner).toBe('acme')
    expect(rows[0].repo_name).toBe('app')
    expect(rows[0].project_path).toBe('/projects/app')
    expect(rows[0].last_seen_at).toBeNull()
  })

  test('upsert preserves last_seen_at', async () => {
    await service.poll()

    // Mark PR #1 as seen
    service.markSeen('acme/app', 1)
    const before = rawDb.query('SELECT last_seen_at FROM pr_cache WHERE pr_number = ?').get(1) as {
      last_seen_at: number | null
    }
    expect(before.last_seen_at).toBeGreaterThan(0)

    // Re-poll — last_seen_at should be preserved
    await service.poll()
    const after = rawDb.query('SELECT last_seen_at FROM pr_cache WHERE pr_number = ?').get(1) as {
      last_seen_at: number | null
    }
    expect(after.last_seen_at).toBe(before.last_seen_at)
  })

  test('getUnseenCount returns correct count for never-seen PRs', async () => {
    await service.poll()
    const count = service.getUnseenCount()
    expect(count).toBe(2) // both PRs never seen
  })

  test('markSeen decrements unseen count', async () => {
    await service.poll()
    expect(service.getUnseenCount()).toBe(2)

    service.markSeen('acme/app', 1)
    expect(service.getUnseenCount()).toBe(1)
  })

  test('PR becomes unseen again when updatedAt changes', async () => {
    await service.poll()
    service.markSeen('acme/app', 1)
    expect(service.getUnseenCount()).toBe(1)

    // Simulate PR #1 getting updated
    mockListPrs.mockImplementationOnce(() =>
      Promise.resolve([
        {
          number: 1,
          title: 'Fix bug (v2)',
          author: 'alice',
          state: 'open' as const,
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2099-01-01T00:00:00Z', // newer than last_seen_at
          headBranch: 'fix-bug',
          baseBranch: 'main',
          additions: 15,
          deletions: 5,
          reviewDecision: null,
          isDraft: false,
          url: 'https://github.com/acme/app/pull/1',
          repo: { owner: '', repo: '', fullName: 'acme/app', projectPath: '' },
        },
        {
          number: 2,
          title: 'Add feature',
          author: 'bob',
          state: 'open' as const,
          createdAt: '2026-03-14T08:00:00Z',
          updatedAt: '2026-03-14T09:00:00Z',
          headBranch: 'add-feature',
          baseBranch: 'main',
          additions: 50,
          deletions: 0,
          reviewDecision: 'REVIEW_REQUIRED',
          isDraft: false,
          url: 'https://github.com/acme/app/pull/2',
          repo: { owner: '', repo: '', fullName: 'acme/app', projectPath: '' },
        },
      ]),
    )

    await service.poll()
    expect(service.getUnseenCount()).toBe(2) // PR #1 is unseen again
  })

  test('seen PR stays seen when updatedAt is unchanged after re-poll', async () => {
    await service.poll()
    service.markSeen('acme/app', 1)
    expect(service.getUnseenCount()).toBe(1)

    // Re-poll with same data — PR #1 should still be seen
    await service.poll()
    expect(service.getUnseenCount()).toBe(1) // PR #1 still seen, PR #2 still unseen
  })

  test('stale PRs are marked as closed', async () => {
    await service.poll()
    expect(
      (
        rawDb.query('SELECT COUNT(*) as c FROM pr_cache WHERE state = ?').get('open') as {
          c: number
        }
      ).c,
    ).toBe(2)

    // Next poll only returns PR #1 (PR #2 was merged/closed)
    mockListPrs.mockImplementationOnce(() =>
      Promise.resolve([
        {
          number: 1,
          title: 'Fix bug',
          author: 'alice',
          state: 'open' as const,
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2026-03-15T12:00:00Z',
          headBranch: 'fix-bug',
          baseBranch: 'main',
          additions: 10,
          deletions: 5,
          reviewDecision: null,
          isDraft: false,
          url: 'https://github.com/acme/app/pull/1',
          repo: { owner: '', repo: '', fullName: 'acme/app', projectPath: '' },
        },
      ]),
    )

    await service.poll()
    const openCount = (
      rawDb.query('SELECT COUNT(*) as c FROM pr_cache WHERE state = ?').get('open') as { c: number }
    ).c
    const closedCount = (
      rawDb.query('SELECT COUNT(*) as c FROM pr_cache WHERE state = ?').get('closed') as {
        c: number
      }
    ).c
    expect(openCount).toBe(1)
    expect(closedCount).toBe(1)
  })

  test('getCachedPrs returns GhPullRequest[] with correct repo field', async () => {
    await service.poll()
    const cached = service.getCachedPrs()
    expect(cached).toHaveLength(2)
    expect(cached[0].repo.owner).toBe('acme')
    expect(cached[0].repo.repo).toBe('app')
    expect(cached[0].repo.fullName).toBe('acme/app')
    expect(cached[0].repo.projectPath).toBe('/projects/app')
    // sorted by updated_at DESC — PR #1 is newer
    expect(cached[0].number).toBe(1)
  })

  test('getCachedPrs filters by repo', async () => {
    await service.poll()
    const cached = service.getCachedPrs('acme/app')
    expect(cached).toHaveLength(2)
    const empty = service.getCachedPrs('other/repo')
    expect(empty).toHaveLength(0)
  })

  test('poll skips when gh is not configured', async () => {
    mockCheckGhStatus.mockImplementationOnce(() =>
      Promise.resolve({
        available: false,
        authenticated: false,
        binaryPath: null,
        username: null,
        error: 'not found',
      }),
    )
    await service.poll()
    expect(mockDiscoverRepos).not.toHaveBeenCalled()
  })

  test('poll handles individual repo failures gracefully', async () => {
    mockDiscoverRepos.mockImplementationOnce(() =>
      Promise.resolve([
        { owner: 'acme', repo: 'app', fullName: 'acme/app', projectPath: '/projects/app' },
        {
          owner: 'acme',
          repo: 'broken',
          fullName: 'acme/broken',
          projectPath: '/projects/broken',
        },
      ]),
    )

    mockListPrs.mockImplementation((repo: string) => {
      if (repo === 'acme/broken') throw new Error('API error')
      return Promise.resolve([
        {
          number: 1,
          title: 'Fix bug',
          author: 'alice',
          state: 'open' as const,
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2026-03-15T12:00:00Z',
          headBranch: 'fix-bug',
          baseBranch: 'main',
          additions: 10,
          deletions: 5,
          reviewDecision: null,
          isDraft: false,
          url: 'https://github.com/acme/app/pull/1',
          repo: { owner: '', repo: '', fullName: 'acme/app', projectPath: '' },
        },
      ])
    })

    await service.poll()
    const rows = rawDb.query('SELECT * FROM pr_cache').all()
    expect(rows).toHaveLength(1)
  })

  test('overlap guard prevents concurrent polls', async () => {
    mockListPrs.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
    )

    const p1 = service.poll()
    const p2 = service.poll() // Should be skipped
    await Promise.all([p1, p2])

    expect(mockDiscoverRepos).toHaveBeenCalledTimes(1)
  })
})
