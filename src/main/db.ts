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
  {
    version: 17,
    description: 'Add suggestion fields to PR review findings',
    sql: `
      ALTER TABLE pr_review_findings ADD COLUMN suggestion_body TEXT;
      ALTER TABLE pr_review_findings ADD COLUMN suggestion_start_line INTEGER;
      ALTER TABLE pr_review_findings ADD COLUMN suggestion_end_line INTEGER;
    `,
  },
  {
    version: 18,
    description: 'Add PR review memory schema for incremental reruns',
    sql: `
      CREATE TABLE IF NOT EXISTS pr_review_series (
        id TEXT PRIMARY KEY,
        repo_full_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        latest_review_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(repo_full_name, pr_number)
      );

      ALTER TABLE pr_reviews ADD COLUMN series_id TEXT;
      ALTER TABLE pr_reviews ADD COLUMN parent_review_id TEXT;
      ALTER TABLE pr_reviews ADD COLUMN review_mode TEXT NOT NULL DEFAULT 'full';
      ALTER TABLE pr_reviews ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE pr_reviews ADD COLUMN base_sha TEXT;
      ALTER TABLE pr_reviews ADD COLUMN head_sha TEXT;
      ALTER TABLE pr_reviews ADD COLUMN merge_base_sha TEXT;
      ALTER TABLE pr_reviews ADD COLUMN compared_from_sha TEXT;
      ALTER TABLE pr_reviews ADD COLUMN compared_to_sha TEXT;
      ALTER TABLE pr_reviews ADD COLUMN review_scope TEXT NOT NULL DEFAULT 'full-pr';
      ALTER TABLE pr_reviews ADD COLUMN summary_json TEXT NOT NULL DEFAULT '{"newCount":0,"persistingCount":0,"resolvedCount":0,"staleCount":0}';
      ALTER TABLE pr_reviews ADD COLUMN incremental_valid INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS pr_review_run_files (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'modified',
        patch_hash TEXT,
        old_path TEXT,
        touched INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pr_review_threads (
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
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (series_id) REFERENCES pr_review_series(id) ON DELETE CASCADE
      );

      ALTER TABLE pr_review_findings ADD COLUMN thread_id TEXT;
      ALTER TABLE pr_review_findings ADD COLUMN status_in_run TEXT NOT NULL DEFAULT 'new';
      ALTER TABLE pr_review_findings ADD COLUMN fingerprint TEXT;
      ALTER TABLE pr_review_findings ADD COLUMN matched_by TEXT;
      ALTER TABLE pr_review_findings ADD COLUMN anchor_json TEXT;
      ALTER TABLE pr_review_findings ADD COLUMN source_review_id TEXT;
      ALTER TABLE pr_review_findings ADD COLUMN carried_forward INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_pr_review_series_repo ON pr_review_series(repo_full_name, pr_number);
      CREATE INDEX IF NOT EXISTS idx_pr_reviews_series ON pr_reviews(series_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pr_review_run_files_review ON pr_review_run_files(review_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_pr_review_threads_series ON pr_review_threads(series_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_review_threads_fingerprint ON pr_review_threads(series_id, fingerprint);
    `,
  },
  {
    version: 19,
    description: 'Add pr_review_finding_posts mapping table for posted GitHub comments',
    sql: `
      CREATE TABLE IF NOT EXISTS pr_review_finding_posts (
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

      CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_thread
        ON pr_review_finding_posts(thread_id, posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_series
        ON pr_review_finding_posts(series_id);
      CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_review
        ON pr_review_finding_posts(review_id);
      CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_finding
        ON pr_review_finding_posts(finding_id);
    `,
  },
  {
    version: 20,
    description: 'Backfill legacy severity values on pr_review_findings to canonical scale',
    sql: `
      UPDATE pr_review_findings SET severity = 'blocker' WHERE severity = 'critical';
      UPDATE pr_review_findings SET severity = 'high'    WHERE severity IN ('warning', 'warn', 'error');
      UPDATE pr_review_findings SET severity = 'medium'  WHERE severity IN ('suggestion', 'consider');
      UPDATE pr_review_findings SET severity = 'low'     WHERE severity IN ('nitpick', 'info', 'note');
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
  const tableExists = (table: string): boolean => {
    try {
      const row = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table) as { name?: string } | undefined
      return row?.name === table
    } catch {
      return false
    }
  }

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
    if (
      prCols.has('series_id') &&
      prCols.has('parent_review_id') &&
      prCols.has('review_mode') &&
      prCols.has('base_sha') &&
      prCols.has('head_sha') &&
      prCols.has('compared_from_sha') &&
      prCols.has('compared_to_sha') &&
      prCols.has('summary_json') &&
      prCols.has('incremental_valid') &&
      tableExists('pr_review_series') &&
      tableExists('pr_review_run_files') &&
      tableExists('pr_review_threads')
    ) {
      applied.add(18)
    }
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
    if (
      findingCols.has('suggestion_body') &&
      findingCols.has('suggestion_start_line') &&
      findingCols.has('suggestion_end_line')
    ) {
      applied.add(17)
    }
    if (
      findingCols.has('thread_id') &&
      findingCols.has('status_in_run') &&
      findingCols.has('fingerprint') &&
      findingCols.has('matched_by') &&
      findingCols.has('anchor_json') &&
      findingCols.has('source_review_id') &&
      findingCols.has('carried_forward')
    ) {
      applied.add(18)
    }
  } catch {
    /* table doesn't exist yet */
  }

  if (tableExists('pr_review_finding_posts')) applied.add(19)

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
    CREATE TABLE IF NOT EXISTS pr_review_series (
      id TEXT PRIMARY KEY,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      latest_review_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(repo_full_name, pr_number)
    );

    CREATE TABLE IF NOT EXISTS pr_reviews (
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
      posted INTEGER NOT NULL DEFAULT 0,
      posted_at INTEGER,
      FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pr_review_run_files (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'modified',
      patch_hash TEXT,
      old_path TEXT,
      touched INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (review_id) REFERENCES pr_reviews(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pr_review_threads (
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
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (series_id) REFERENCES pr_review_series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pr_review_finding_posts (
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

  runMigrations(db)
  createPrReviewIndexes(db)

  return db
}

// Indexes that depend on columns added by migrations (e.g. pr_reviews.series_id
// added in migration 18). Must run after runMigrations so legacy databases have
// the columns available before they are indexed.
function createPrReviewIndexes(database: Database.Database): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_pr_review_series_repo ON pr_review_series(repo_full_name, pr_number);
    CREATE INDEX IF NOT EXISTS idx_pr_reviews_repo ON pr_reviews(repo_full_name, pr_number);
    CREATE INDEX IF NOT EXISTS idx_pr_reviews_series ON pr_reviews(series_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pr_review_findings_review ON pr_review_findings(review_id);
    CREATE INDEX IF NOT EXISTS idx_pr_review_run_files_review ON pr_review_run_files(review_id, file_path);
    CREATE INDEX IF NOT EXISTS idx_pr_review_threads_series ON pr_review_threads(series_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_review_threads_fingerprint ON pr_review_threads(series_id, fingerprint);
    CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_thread
      ON pr_review_finding_posts(thread_id, posted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_series
      ON pr_review_finding_posts(series_id);
    CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_review
      ON pr_review_finding_posts(review_id);
    CREATE INDEX IF NOT EXISTS idx_pr_review_finding_posts_finding
      ON pr_review_finding_posts(finding_id);
  `)
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
