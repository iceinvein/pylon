import { join } from 'node:path'
import Database from 'better-sqlite3'

let db: Database.Database

/**
 * Ordered list of schema migrations. Each entry runs exactly once.
 * The schema_version table tracks which migrations have been applied.
 *
 * Rules:
 * - Never modify an existing migration — append a new one.
 * - Migrations run inside a transaction.
 * - SQL can be a single statement or multi-statement string.
 */
const migrations: Array<{ version: number; description: string; sql: string }> = [
  {
    version: 1,
    description: 'Add permission_mode to sessions',
    sql: "ALTER TABLE sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'default'",
  },
  {
    version: 2,
    description: 'Add git_baseline_hash to sessions',
    sql: 'ALTER TABLE sessions ADD COLUMN git_baseline_hash TEXT DEFAULT NULL',
  },
  {
    version: 3,
    description: 'Add worktree columns to sessions',
    sql: `
      ALTER TABLE sessions ADD COLUMN worktree_path TEXT DEFAULT NULL;
      ALTER TABLE sessions ADD COLUMN original_cwd TEXT DEFAULT NULL;
      ALTER TABLE sessions ADD COLUMN worktree_branch TEXT DEFAULT NULL;
      ALTER TABLE sessions ADD COLUMN original_branch TEXT DEFAULT NULL;
    `,
  },
  {
    version: 4,
    description: 'Add source to sessions',
    sql: "ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'user'",
  },
  {
    version: 5,
    description: 'Add context tracking columns to sessions',
    sql: `
      ALTER TABLE sessions ADD COLUMN context_window INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN context_input_tokens INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 6,
    description: 'Add provider to sessions',
    sql: "ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude'",
  },
  {
    version: 7,
    description: 'Add max_output_tokens to sessions',
    sql: 'ALTER TABLE sessions ADD COLUMN max_output_tokens INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 8,
    description: 'Add raw_output and cost_usd to pr_reviews',
    sql: `
      ALTER TABLE pr_reviews ADD COLUMN raw_output TEXT;
      ALTER TABLE pr_reviews ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 9,
    description: 'Add domain to pr_review_findings',
    sql: 'ALTER TABLE pr_review_findings ADD COLUMN domain TEXT',
  },
  {
    version: 10,
    description: 'Add batch_id to test_explorations',
    sql: 'ALTER TABLE test_explorations ADD COLUMN batch_id TEXT',
  },
  {
    version: 11,
    description: 'Add worktree recipe tables',
    sql: `
      CREATE TABLE IF NOT EXISTS worktree_recipes (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS worktree_recipe_steps (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        command TEXT,
        source TEXT,
        destination TEXT,
        glob TEXT,
        optional INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (recipe_id) REFERENCES worktree_recipes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON worktree_recipe_steps(recipe_id, sort_order);
    `,
  },
  {
    version: 12,
    description: 'Add ast_analyses table for persisting AST scan results',
    sql: `
      CREATE TABLE IF NOT EXISTS ast_analyses (
        scope TEXT PRIMARY KEY,
        repo_graph TEXT NOT NULL,
        arch_analysis TEXT,
        file_count INTEGER NOT NULL DEFAULT 0,
        analyzed_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 13,
    description: 'Add projects table for bookmarked project folders',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        path TEXT PRIMARY KEY,
        added_at INTEGER NOT NULL,
        last_opened_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 14,
    description: 'Add merged_from to pr_review_findings',
    sql: 'ALTER TABLE pr_review_findings ADD COLUMN merged_from TEXT',
  },
  {
    version: 15,
    description: 'Add hidden flag to projects for manual project list overrides',
    sql: 'ALTER TABLE projects ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 16,
    description: 'Add structured risk fields to PR review findings',
    sql: `
      ALTER TABLE pr_review_findings ADD COLUMN impact TEXT NOT NULL DEFAULT 'medium';
      ALTER TABLE pr_review_findings ADD COLUMN likelihood TEXT NOT NULL DEFAULT 'possible';
      ALTER TABLE pr_review_findings ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium';
      ALTER TABLE pr_review_findings ADD COLUMN action TEXT NOT NULL DEFAULT 'consider';
    `,
  },
]

/**
 * Determine which migrations need to run for an existing DB.
 * Existing databases that predate the migration system need to skip
 * migrations for columns that already exist.
 */
function detectAppliedMigrations(database: Database.Database): Set<number> {
  const applied = new Set<number>()

  // Check sessions columns
  const sessionCols = new Set(
    (database.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map(
      (c) => c.name,
    ),
  )

  if (sessionCols.has('permission_mode')) applied.add(1)
  if (sessionCols.has('git_baseline_hash')) applied.add(2)
  if (sessionCols.has('worktree_path')) applied.add(3)
  if (sessionCols.has('source')) applied.add(4)
  if (sessionCols.has('context_window')) applied.add(5)
  if (sessionCols.has('provider')) applied.add(6)
  if (sessionCols.has('max_output_tokens')) applied.add(7)

  // Check pr_reviews columns (table may not exist yet)
  try {
    const prCols = new Set(
      (database.prepare('PRAGMA table_info(pr_reviews)').all() as { name: string }[]).map(
        (c) => c.name,
      ),
    )
    if (prCols.has('raw_output') && prCols.has('cost_usd')) applied.add(8)
  } catch {
    /* table doesn't exist yet */
  }

  // Check pr_review_findings columns
  try {
    const findingCols = new Set(
      (database.prepare('PRAGMA table_info(pr_review_findings)').all() as { name: string }[]).map(
        (c) => c.name,
      ),
    )
    if (findingCols.has('domain')) applied.add(9)
    if (findingCols.has('merged_from')) applied.add(14)
    if (
      findingCols.has('impact') &&
      findingCols.has('likelihood') &&
      findingCols.has('confidence') &&
      findingCols.has('action')
    ) {
      applied.add(16)
    }
  } catch {
    /* table doesn't exist yet */
  }

  // Check test_explorations columns
  try {
    const explorCols = new Set(
      (database.prepare('PRAGMA table_info(test_explorations)').all() as { name: string }[]).map(
        (c) => c.name,
      ),
    )
    if (explorCols.has('batch_id')) applied.add(10)
  } catch {
    /* table doesn't exist yet */
  }

  // Check projects columns
  try {
    const projectCols = new Set(
      (database.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map(
        (c) => c.name,
      ),
    )
    if (projectCols.has('hidden')) applied.add(15)
  } catch {
    /* table doesn't exist yet */
  }

  return applied
}

function runMigrations(database: Database.Database): void {
  // Create version tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  // Get already-tracked versions
  const tracked = new Set(
    (database.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  )

  // On first run of the migration system, detect which migrations were
  // already applied by the old column-check approach
  if (tracked.size === 0) {
    const preExisting = detectAppliedMigrations(database)
    if (preExisting.size > 0) {
      const insert = database.prepare(
        'INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, ?)',
      )
      for (const v of preExisting) {
        const migration = migrations.find((m) => m.version === v)
        if (migration) {
          insert.run(v, migration.description, Date.now())
          tracked.add(v)
        }
      }
    }
  }

  // Run pending migrations in order
  for (const migration of migrations) {
    if (tracked.has(migration.version)) continue

    database.exec(migration.sql)
    database
      .prepare('INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, ?)')
      .run(migration.version, migration.description, Date.now())
  }
}

export function initDatabase(): Database.Database {
  // Lazy-load electron so this module can be imported in CI tests
  // without triggering a missing 'electron' native module error.
  const { app } = require('electron') as typeof import('electron')
  const dbPath = join(app.getPath('userData'), 'pylon.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create base tables
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
      impact TEXT NOT NULL DEFAULT 'medium',
      likelihood TEXT NOT NULL DEFAULT 'possible',
      confidence TEXT NOT NULL DEFAULT 'medium',
      action TEXT NOT NULL DEFAULT 'consider',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      posted INTEGER NOT NULL DEFAULT 0,
      posted_at INTEGER,
      FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pr_reviews_repo ON pr_reviews(repo_full_name, pr_number);
    CREATE INDEX IF NOT EXISTS idx_pr_review_findings_review ON pr_review_findings(review_id);
  `)

  // PR Cache table
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

  // Normalize any uppercase state values from GitHub API
  db.exec('UPDATE pr_cache SET state = LOWER(state) WHERE state != LOWER(state)')

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

  // Run versioned migrations
  runMigrations(db)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
