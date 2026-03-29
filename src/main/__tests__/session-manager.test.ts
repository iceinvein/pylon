import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock electron
mock.module('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: class {},
}))

// In-memory DB with better-sqlite3 compatible API
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

// Mock providers
const mockCreateSession = mock(() => ({
  send: () => ({
    [Symbol.asyncIterator]() {
      return {
        next() {
          return Promise.resolve({ value: undefined, done: true })
        },
      }
    },
  }),
  stop: () => {},
}))

mock.module('../providers', () => ({
  getProvider: () => ({
    id: 'claude',
    createSession: mockCreateSession,
  }),
  getProviderForModel: () => ({
    id: 'claude',
    createSession: mockCreateSession,
  }),
}))

// Mock extracted services (they have their own tests)
mock.module('../diff-service', () => ({
  diffService: {
    captureGitBaseline: mock(() => Promise.resolve(null)),
    persistBaseline: mock(() => {}),
    getFileDiffs: mock(() => Promise.resolve([])),
    getFileStatuses: mock(() => Promise.resolve([])),
  },
}))

mock.module('../git-worktree-service', () => ({
  gitWorktreeService: {
    checkRepoStatus: mock(() => Promise.resolve({ isGitRepo: true, isDirty: false })),
    createWorktree: mock(() =>
      Promise.resolve({ worktreePath: '/tmp/wt', branch: 'test', originalBranch: 'main' }),
    ),
    renameWorktreeBranch: mock(() => Promise.resolve()),
    removeWorktree: mock(() => Promise.resolve()),
    mergeAndCleanupWorktree: mock(() => Promise.resolve({ success: true })),
    getWorktreeInfo: mock(() => ({
      worktreePath: null,
      worktreeBranch: null,
      originalBranch: null,
    })),
  },
}))

mock.module('../pr-raise-service', () => ({
  prRaiseService: {
    getRaisePrInfo: mock(() => Promise.resolve({})),
    generatePrDescription: mock(() => Promise.resolve({ title: 'test', body: '' })),
    raisePr: mock(() => Promise.resolve({ success: true })),
  },
}))

mock.module('../worktree-recipe-service', () => ({
  worktreeRecipeService: {
    setWindow: mock(() => {}),
    getRecipe: mock(() => null),
    deleteRecipe: mock(() => {}),
    analyzeProject: mock(() => Promise.resolve({})),
    executeRecipe: mock(() => Promise.resolve()),
  },
}))

function initTestDb() {
  rawDb = new Database(':memory:')
  dbProxy = createDbProxy(rawDb)

  rawDb.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      cwd TEXT NOT NULL,
      sdk_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'empty',
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      title TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      permission_mode TEXT NOT NULL DEFAULT 'default',
      git_baseline_hash TEXT DEFAULT NULL,
      worktree_path TEXT DEFAULT NULL,
      original_cwd TEXT DEFAULT NULL,
      worktree_branch TEXT DEFAULT NULL,
      original_branch TEXT DEFAULT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      context_window INTEGER NOT NULL DEFAULT 0,
      context_input_tokens INTEGER NOT NULL DEFAULT 0,
      max_output_tokens INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL DEFAULT 'claude'
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      sdk_message TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

describe('SessionManager', () => {
  let SessionManager: typeof import('../session-manager').SessionManager

  beforeEach(async () => {
    initTestDb()
    const mod = await import('../session-manager')
    SessionManager = mod.SessionManager
  })

  afterEach(() => {
    rawDb?.close()
  })

  describe('createSession', () => {
    test('creates a session and persists to DB', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')

      const row = rawDb.query('SELECT * FROM sessions WHERE id = ?').get(id) as Record<
        string,
        unknown
      >
      expect(row).toBeTruthy()
      expect(row.cwd).toBe('/tmp/project')
      expect(row.status).toBe('empty')
      expect(row.model).toBe('claude-opus-4-6')
      expect(row.source).toBe('user')
    })

    test('uses specified model', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project', 'claude-sonnet-4-6')

      const row = rawDb.query('SELECT model FROM sessions WHERE id = ?').get(id) as {
        model: string
      }
      expect(row.model).toBe('claude-sonnet-4-6')
    })

    test('uses custom source', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project', undefined, false, 'internal')

      const row = rawDb.query('SELECT source FROM sessions WHERE id = ?').get(id) as {
        source: string
      }
      expect(row.source).toBe('internal')
    })

    test('generates unique IDs', async () => {
      const sm = new SessionManager()
      const id1 = await sm.createSession('/tmp/a')
      const id2 = await sm.createSession('/tmp/b')
      expect(id1).not.toBe(id2)
    })
  })

  describe('getSessionInfo', () => {
    test('returns model and permission mode for active session', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project', 'claude-sonnet-4-6')

      const info = sm.getSessionInfo(id)
      expect(info).toEqual({ model: 'claude-sonnet-4-6', permissionMode: 'default' })
    })

    test('returns null for unknown session', () => {
      const sm = new SessionManager()
      expect(sm.getSessionInfo('nonexistent')).toBeNull()
    })
  })

  describe('setPermissionMode', () => {
    test('updates permission mode in memory and DB', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      sm.setPermissionMode(id, 'auto-approve')

      const info = sm.getSessionInfo(id)
      expect(info?.permissionMode).toBe('auto-approve')

      const row = rawDb.query('SELECT permission_mode FROM sessions WHERE id = ?').get(id) as {
        permission_mode: string
      }
      expect(row.permission_mode).toBe('auto-approve')
    })

    test('no-ops for unknown session', () => {
      const sm = new SessionManager()
      sm.setPermissionMode('nonexistent', 'auto-approve')
    })
  })

  describe('setModel', () => {
    test('updates model in memory and DB', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      sm.setModel(id, 'claude-haiku-4-5')

      const info = sm.getSessionInfo(id)
      expect(info?.model).toBe('claude-haiku-4-5')

      const row = rawDb.query('SELECT model FROM sessions WHERE id = ?').get(id) as {
        model: string
      }
      expect(row.model).toBe('claude-haiku-4-5')
    })
  })

  describe('onMessage', () => {
    test('subscribe and unsubscribe', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      const received: unknown[] = []
      const unsub = sm.onMessage(id, (msg) => received.push(msg))
      expect(typeof unsub).toBe('function')

      unsub()
      // After unsubscribe, listener map should be cleaned up
    })

    test('multiple listeners on same session', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      const unsub1 = sm.onMessage(id, () => {})
      const unsub2 = sm.onMessage(id, () => {})

      // Both registered without error
      unsub1()
      unsub2()
    })
  })

  describe('resolvePermission', () => {
    test('resolves pending permission for the correct request', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      let resolved = false
      const sessions = (sm as unknown as { sessions: Map<string, Record<string, unknown>> })
        .sessions
      const session = sessions.get(id) as {
        pendingPermissions: Map<string, { resolve: (r: unknown) => void }>
      }
      session.pendingPermissions.set('req-1', {
        resolve: () => {
          resolved = true
        },
      })

      sm.resolvePermission({ requestId: 'req-1', behavior: 'allow' })
      expect(resolved).toBe(true)
      expect(session.pendingPermissions.size).toBe(0)
    })

    test('no-ops for unknown request ID', async () => {
      const sm = new SessionManager()
      await sm.createSession('/tmp/project')
      sm.resolvePermission({ requestId: 'nonexistent', behavior: 'deny' })
    })
  })

  describe('resolveQuestion', () => {
    test('resolves pending question', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      let resolvedAnswers: Record<string, string> = {}
      const sessions = (sm as unknown as { sessions: Map<string, Record<string, unknown>> })
        .sessions
      const session = sessions.get(id) as {
        pendingQuestions: Map<string, { resolve: (r: Record<string, string>) => void }>
      }
      session.pendingQuestions.set('q-1', {
        resolve: (answers) => {
          resolvedAnswers = answers
        },
      })

      sm.resolveQuestion({ requestId: 'q-1', answers: { a: 'yes' } })
      expect(resolvedAnswers).toEqual({ a: 'yes' })
      expect(session.pendingQuestions.size).toBe(0)
    })
  })

  describe('resumeSession', () => {
    test('resumes a session from DB', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      const sm2 = new SessionManager()
      expect(sm2.getSessionInfo(id)).toBeNull()

      const resumed = sm2.resumeSession(id)
      expect(resumed).toBe(true)
      expect(sm2.getSessionInfo(id)).toBeTruthy()
    })

    test('returns false for nonexistent session', () => {
      const sm = new SessionManager()
      expect(sm.resumeSession('nonexistent')).toBe(false)
    })

    test('returns true if session already in memory', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')
      expect(sm.resumeSession(id)).toBe(true)
    })
  })

  describe('stopSession', () => {
    test('sets status to done', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      await sm.stopSession(id)

      const row = rawDb.query('SELECT status FROM sessions WHERE id = ?').get(id) as {
        status: string
      }
      expect(row.status).toBe('done')
    })

    test('no-ops for unknown session', async () => {
      const sm = new SessionManager()
      await sm.stopSession('nonexistent')
    })
  })

  describe('deleteSession', () => {
    test('removes session from DB', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      await sm.deleteSession(id)

      const row = rawDb.query('SELECT * FROM sessions WHERE id = ?').get(id)
      expect(row).toBeFalsy()
    })
  })

  describe('getStoredSessions / getSessionMessages', () => {
    test('returns stored user sessions', async () => {
      const sm = new SessionManager()
      await sm.createSession('/tmp/a')
      await sm.createSession('/tmp/b')

      const sessions = sm.getStoredSessions()
      expect(sessions).toHaveLength(2)
    })

    test('returns empty messages for new session', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')

      const messages = sm.getSessionMessages(id)
      expect(messages).toHaveLength(0)
    })
  })

  describe('getProjectFolders', () => {
    test('returns unique project folders', async () => {
      const sm = new SessionManager()
      await sm.createSession('/tmp/project-a')
      await sm.createSession('/tmp/project-b')
      await sm.createSession('/tmp/project-a')

      const folders = sm.getProjectFolders()
      expect(folders).toHaveLength(2)
      expect(folders.map((f) => f.path).sort()).toEqual(['/tmp/project-a', '/tmp/project-b'])
    })
  })

  describe('model context window caching', () => {
    test('persists and loads context windows from settings', () => {
      rawDb.exec(
        "INSERT INTO settings (key, value) VALUES ('context_window:claude-sonnet-4-6', '200000')",
      )

      const sm = new SessionManager()
      expect(sm.getModelContextWindow('claude-sonnet-4-6')).toBe(200000)
    })

    test('returns undefined for unknown model', () => {
      const sm = new SessionManager()
      expect(sm.getModelContextWindow('unknown-model')).toBeUndefined()
    })

    test('persists and loads max output tokens', () => {
      rawDb.exec(
        "INSERT INTO settings (key, value) VALUES ('max_output_tokens:claude-sonnet-4-6', '8192')",
      )

      const sm = new SessionManager()
      expect(sm.getModelMaxOutputTokens('claude-sonnet-4-6')).toBe(8192)
    })
  })

  describe('delegation to extracted services', () => {
    test('checkRepoStatus delegates to gitWorktreeService', async () => {
      const sm = new SessionManager()
      const result = await sm.checkRepoStatus('/tmp/repo')
      expect(result).toEqual({ isGitRepo: true, isDirty: false })
    })

    test('getWorktreeInfo delegates to gitWorktreeService', async () => {
      const sm = new SessionManager()
      const id = await sm.createSession('/tmp/project')
      const info = sm.getWorktreeInfo(id)
      expect(info).toHaveProperty('worktreePath')
      expect(info).toHaveProperty('worktreeBranch')
      expect(info).toHaveProperty('originalBranch')
    })
  })
})
