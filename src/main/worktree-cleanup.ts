import { existsSync } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { log } from '../shared/logger'

const logger = log.child('worktree-cleanup')

const DEFAULT_WORKTREE_BASE = join(homedir(), '.pylon', 'worktrees')

type WorktreeUsage = {
  count: number
  sizeBytes: number
}

type CleanupResult = {
  removed: number
  freedBytes: number
}

/** Recursively compute total size of a directory in bytes. */
async function dirSize(dirPath: string): Promise<number> {
  let total = 0
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    if (entry.isSymbolicLink()) {
      // Skip symlinks to avoid cycles
    } else if (entry.isDirectory()) {
      total += await dirSize(full)
    } else {
      const s = await stat(full)
      total += s.size
    }
  }
  return total
}

/** Get list of all worktree session directories grouped by repo. */
async function listWorktreeDirs(
  basePath: string,
): Promise<Array<{ repo: string; session: string; path: string; mtimeMs: number }>> {
  if (!existsSync(basePath)) return []

  const repos = await readdir(basePath, { withFileTypes: true })
  const results: Array<{ repo: string; session: string; path: string; mtimeMs: number }> = []

  for (const repo of repos) {
    if (!repo.isDirectory()) continue
    const repoPath = join(basePath, repo.name)
    const sessions = await readdir(repoPath, { withFileTypes: true })
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const sessionPath = join(repoPath, session.name)
      const s = await stat(sessionPath)
      results.push({
        repo: repo.name,
        session: session.name,
        path: sessionPath,
        mtimeMs: s.mtimeMs,
      })
    }
  }

  return results
}

/** Scan ~/.pylon/worktrees/ and return count + total size. */
export async function getWorktreeUsage(basePath = DEFAULT_WORKTREE_BASE): Promise<WorktreeUsage> {
  if (!existsSync(basePath)) return { count: 0, sizeBytes: 0 }

  const dirs = await listWorktreeDirs(basePath)
  let sizeBytes = 0
  for (const dir of dirs) {
    try {
      sizeBytes += await dirSize(dir.path)
    } catch {
      // If we can't read a directory, skip it
    }
  }

  return { count: dirs.length, sizeBytes }
}

/** Remove a single worktree directory via force-remove. */
async function removeWorktreeDir(worktreePath: string): Promise<number> {
  const size = await dirSize(worktreePath).catch(() => 0)
  await rm(worktreePath, { recursive: true, force: true })
  return size
}

/** Remove ALL worktree directories under basePath. */
export async function cleanupAllWorktrees(
  basePath = DEFAULT_WORKTREE_BASE,
): Promise<CleanupResult> {
  const dirs = await listWorktreeDirs(basePath)
  let removed = 0
  let freedBytes = 0

  for (const dir of dirs) {
    try {
      const size = await removeWorktreeDir(dir.path)
      freedBytes += size
      removed++
    } catch (err) {
      logger.warn(`Failed to remove worktree ${dir.path}:`, err)
    }
  }

  await cleanEmptyRepoDirs(basePath)

  logger.info(`Cleaned up ${removed} worktrees, freed ${freedBytes} bytes`)
  return { removed, freedBytes }
}

/** Remove worktree directories older than maxAgeDays. */
export async function cleanupStaleWorktrees(
  maxAgeDays: number,
  basePath = DEFAULT_WORKTREE_BASE,
): Promise<CleanupResult> {
  const dirs = await listWorktreeDirs(basePath)
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  let removed = 0
  let freedBytes = 0

  for (const dir of dirs) {
    if (dir.mtimeMs < cutoff) {
      try {
        const size = await removeWorktreeDir(dir.path)
        freedBytes += size
        removed++
      } catch (err) {
        logger.warn(`Failed to remove stale worktree ${dir.path}:`, err)
      }
    }
  }

  if (removed > 0) {
    await cleanEmptyRepoDirs(basePath)
    logger.info(
      `Auto-cleaned ${removed} stale worktrees (>${maxAgeDays}d), freed ${freedBytes} bytes`,
    )
  }

  return { removed, freedBytes }
}

/** Remove empty repo directories after cleanup. */
async function cleanEmptyRepoDirs(basePath: string): Promise<void> {
  if (!existsSync(basePath)) return
  const repos = await readdir(basePath, { withFileTypes: true })
  for (const repo of repos) {
    if (!repo.isDirectory()) continue
    const repoPath = join(basePath, repo.name)
    const contents = await readdir(repoPath)
    if (contents.length === 0) {
      await rm(repoPath, { recursive: true, force: true })
    }
  }
}
