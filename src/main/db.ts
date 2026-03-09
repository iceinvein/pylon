import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function initDatabase(): Database.Database {
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
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]
  if (!cols.some((c) => c.name === 'permission_mode')) {
    db.exec("ALTER TABLE sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'default'")
  }
  if (!cols.some((c) => c.name === 'git_baseline_hash')) {
    db.exec("ALTER TABLE sessions ADD COLUMN git_baseline_hash TEXT DEFAULT NULL")
  }
  if (!cols.some((c) => c.name === 'worktree_path')) {
    db.exec("ALTER TABLE sessions ADD COLUMN worktree_path TEXT DEFAULT NULL")
  }
  if (!cols.some((c) => c.name === 'original_cwd')) {
    db.exec("ALTER TABLE sessions ADD COLUMN original_cwd TEXT DEFAULT NULL")
  }
  if (!cols.some((c) => c.name === 'worktree_branch')) {
    db.exec("ALTER TABLE sessions ADD COLUMN worktree_branch TEXT DEFAULT NULL")
  }
  if (!cols.some((c) => c.name === 'original_branch')) {
    db.exec("ALTER TABLE sessions ADD COLUMN original_branch TEXT DEFAULT NULL")
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

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
