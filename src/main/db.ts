import { join } from 'node:path'
import Database from 'better-sqlite3'

let db: Database.Database

export function initDatabase(): Database.Database {
  // Lazy-load electron so this module can be imported in CI tests
  // without triggering a missing 'electron' native module error.
  const { app } = require('electron') as typeof import('electron')
  const dbPath = join(app.getPath('userData'), 'pylon.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
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
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      sdk_message TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
  `)

  // Migrations
  const cols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'permission_mode')) {
    db.exec("ALTER TABLE sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'default'")
  }
  if (!cols.some((c) => c.name === 'git_baseline_hash')) {
    db.exec('ALTER TABLE sessions ADD COLUMN git_baseline_hash TEXT DEFAULT NULL')
  }
  if (!cols.some((c) => c.name === 'worktree_path')) {
    db.exec('ALTER TABLE sessions ADD COLUMN worktree_path TEXT DEFAULT NULL')
  }
  if (!cols.some((c) => c.name === 'original_cwd')) {
    db.exec('ALTER TABLE sessions ADD COLUMN original_cwd TEXT DEFAULT NULL')
  }
  if (!cols.some((c) => c.name === 'worktree_branch')) {
    db.exec('ALTER TABLE sessions ADD COLUMN worktree_branch TEXT DEFAULT NULL')
  }
  if (!cols.some((c) => c.name === 'original_branch')) {
    db.exec('ALTER TABLE sessions ADD COLUMN original_branch TEXT DEFAULT NULL')
  }
  if (!cols.some((c) => c.name === 'source')) {
    db.exec("ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'user'")
  }
  if (!cols.some((c) => c.name === 'context_window')) {
    db.exec('ALTER TABLE sessions ADD COLUMN context_window INTEGER NOT NULL DEFAULT 0')
  }
  if (!cols.some((c) => c.name === 'context_input_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN context_input_tokens INTEGER NOT NULL DEFAULT 0')
  }
  if (!cols.some((c) => c.name === 'provider')) {
    db.exec("ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude'")
  }
  if (!cols.some((c) => c.name === 'max_output_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN max_output_tokens INTEGER NOT NULL DEFAULT 0')
  }

  // PR Review tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_reviews (
      id TEXT PRIMARY KEY,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_title TEXT,
      pr_url TEXT,
      focus TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      session_id TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pr_review_findings (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      file TEXT,
      line INTEGER,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      posted INTEGER NOT NULL DEFAULT 0,
      posted_at INTEGER,
      FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pr_reviews_repo ON pr_reviews(repo_full_name, pr_number);
    CREATE INDEX IF NOT EXISTS idx_pr_review_findings_review ON pr_review_findings(review_id);
  `)

  // Migration: add raw_output column to pr_reviews
  const prCols = db.prepare('PRAGMA table_info(pr_reviews)').all() as Array<{ name: string }>
  if (!prCols.some((c) => c.name === 'raw_output')) {
    db.exec('ALTER TABLE pr_reviews ADD COLUMN raw_output TEXT')
  }

  // Migration: add cost_usd column to pr_reviews
  if (!prCols.some((c) => c.name === 'cost_usd')) {
    db.exec('ALTER TABLE pr_reviews ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0')
  }

  // Migration: add domain column to pr_review_findings
  const findingCols = db.prepare('PRAGMA table_info(pr_review_findings)').all() as Array<{
    name: string
  }>
  if (!findingCols.some((c) => c.name === 'domain')) {
    db.exec('ALTER TABLE pr_review_findings ADD COLUMN domain TEXT')
  }

  // PR Cache table for background polling
  db.exec(`
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
    );

    CREATE INDEX IF NOT EXISTS idx_pr_cache_unseen
      ON pr_cache(state, last_seen_at, updated_at);
  `)

  // Normalize any uppercase state values from GitHub API (OPEN→open, CLOSED→closed, MERGED→merged)
  db.exec(`UPDATE pr_cache SET state = LOWER(state) WHERE state != LOWER(state)`)

  // AI Exploration Testing tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_explorations (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      cwd TEXT NOT NULL,
      url TEXT NOT NULL,
      goal TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'manual',
      requirements TEXT,
      e2e_output_path TEXT NOT NULL DEFAULT 'e2e',
      e2e_path_reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      findings_count INTEGER NOT NULL DEFAULT 0,
      tests_generated INTEGER NOT NULL DEFAULT 0,
      generated_test_paths TEXT NOT NULL DEFAULT '[]',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_findings (
      id TEXT PRIMARY KEY,
      exploration_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      url TEXT NOT NULL DEFAULT '',
      screenshot_path TEXT,
      reproduction_steps TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (exploration_id) REFERENCES test_explorations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_test_explorations_cwd ON test_explorations(cwd);
    CREATE INDEX IF NOT EXISTS idx_test_findings_exploration ON test_findings(exploration_id);
  `)

  // Migration: add batch_id column to test_explorations
  const explorationCols = db.pragma('table_info(test_explorations)') as Array<{ name: string }>
  if (!explorationCols.some((c) => c.name === 'batch_id')) {
    db.exec('ALTER TABLE test_explorations ADD COLUMN batch_id TEXT')
  }

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
