import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { getDb } from './db'

const execFileAsync = promisify(execFile)

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export class GitWorktreeService {
  async checkRepoStatus(folderPath: string): Promise<{ isGitRepo: boolean; isDirty: boolean }> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], {
        cwd: folderPath,
        timeout: 3000,
      })
    } catch {
      return { isGitRepo: false, isDirty: false }
    }

    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: folderPath,
        timeout: 5000,
      })
      return { isGitRepo: true, isDirty: stdout.trim().length > 0 }
    } catch {
      return { isGitRepo: true, isDirty: false }
    }
  }

  async createWorktree(
    repoPath: string,
    sessionId: string,
  ): Promise<{ worktreePath: string; branch: string; originalBranch: string }> {
    const repoName = basename(repoPath)
    const worktreeBase = join(homedir(), '.pylon', 'worktrees', repoName)
    const worktreePath = join(worktreeBase, sessionId)
    const branch = `claude-session-${sessionId.slice(0, 8)}`

    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      {
        cwd: repoPath,
        timeout: 5000,
      },
    )
    const originalBranch = branchOut.trim()

    await mkdir(worktreeBase, { recursive: true })

    // Clean up if path already exists
    if (existsSync(worktreePath)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
          cwd: repoPath,
          timeout: 10000,
        })
      } catch {
        await rm(worktreePath, { recursive: true, force: true })
      }
    }

    await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', branch], {
      cwd: repoPath,
      timeout: 30000,
    })

    return { worktreePath, branch, originalBranch }
  }

  async renameWorktreeBranch(sessionId: string, title: string): Promise<void> {
    const db = getDb()
    const row = db
      .prepare('SELECT worktree_path, worktree_branch, original_cwd FROM sessions WHERE id = ?')
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_cwd: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.original_cwd) return

    const slug = slugify(title)
    if (!slug) return

    let newBranch = `claude/${slug}`

    // Check for collision
    try {
      await execFileAsync('git', ['rev-parse', '--verify', newBranch], {
        cwd: row.original_cwd,
        timeout: 3000,
      })
      // Branch exists — add suffix
      newBranch = `claude/${slug}-${sessionId.slice(0, 4)}`
    } catch {
      // Branch doesn't exist — good
    }

    try {
      await execFileAsync('git', ['branch', '-m', row.worktree_branch, newBranch], {
        cwd: row.worktree_path,
        timeout: 5000,
      })
      db.prepare('UPDATE sessions SET worktree_branch = ? WHERE id = ?').run(newBranch, sessionId)
    } catch {
      // Rename failed — keep original branch name
    }
  }

  async removeWorktree(sessionId: string): Promise<void> {
    const db = getDb()
    const row = db
      .prepare('SELECT worktree_path, worktree_branch, original_cwd FROM sessions WHERE id = ?')
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_cwd: string | null
        }
      | undefined

    if (!row?.worktree_path) return

    // Remove worktree
    if (row.original_cwd && existsSync(row.original_cwd)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', row.worktree_path], {
          cwd: row.original_cwd,
          timeout: 10000,
        })
      } catch {
        // Fallback: delete directory directly
        await rm(row.worktree_path, { recursive: true, force: true }).catch(() => {})
      }

      // Delete branch
      if (row.worktree_branch) {
        try {
          await execFileAsync('git', ['branch', '-D', row.worktree_branch], {
            cwd: row.original_cwd,
            timeout: 5000,
          })
        } catch {
          // Branch may already be deleted
        }
      }
    } else {
      // Original repo gone — just delete directory
      await rm(row.worktree_path, { recursive: true, force: true }).catch(() => {})
    }

    // Clear worktree columns in DB
    db.prepare(
      'UPDATE sessions SET worktree_path = NULL, worktree_branch = NULL, original_branch = NULL WHERE id = ?',
    ).run(sessionId)
  }

  async mergeAndCleanupWorktree(sessionId: string): Promise<{
    success: boolean
    error?: string
    conflictFiles?: string[]
  }> {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT worktree_path, worktree_branch, original_cwd, original_branch FROM sessions WHERE id = ?',
      )
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_cwd: string | null
          original_branch: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.original_cwd) {
      return { success: false, error: 'not-a-worktree' }
    }

    if (!row.original_branch) {
      return { success: false, error: 'branch-not-found' }
    }

    // Check for uncommitted changes in worktree
    try {
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: row.worktree_path,
        timeout: 5000,
      })
      if (statusOut.trim()) {
        return { success: false, error: 'uncommitted-changes' }
      }
    } catch {
      // If we can't check, continue anyway
    }

    // Checkout the original branch in the original repo
    try {
      await execFileAsync('git', ['checkout', row.original_branch], {
        cwd: row.original_cwd,
        timeout: 10000,
      })
    } catch {
      return { success: false, error: `Failed to checkout ${row.original_branch}` }
    }

    // Attempt merge
    try {
      await execFileAsync('git', ['merge', '--no-ff', row.worktree_branch], {
        cwd: row.original_cwd,
        timeout: 30000,
      })
    } catch {
      // Merge failed — likely conflicts. Parse conflict files then abort.
      let conflictFiles: string[] = []
      try {
        const { stdout: conflictOut } = await execFileAsync(
          'git',
          ['diff', '--name-only', '--diff-filter=U'],
          { cwd: row.original_cwd, timeout: 5000 },
        )
        conflictFiles = conflictOut.trim().split('\n').filter(Boolean)
      } catch {
        // Can't get conflict files
      }

      try {
        await execFileAsync('git', ['merge', '--abort'], {
          cwd: row.original_cwd,
          timeout: 5000,
        })
      } catch {
        // Best effort abort
      }

      return { success: false, error: 'conflicts', conflictFiles }
    }

    // Merge succeeded — clean up worktree and branch
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', row.worktree_path], {
        cwd: row.original_cwd,
        timeout: 10000,
      })
    } catch {
      await rm(row.worktree_path, { recursive: true, force: true }).catch(() => {})
    }

    try {
      await execFileAsync('git', ['branch', '-d', row.worktree_branch], {
        cwd: row.original_cwd,
        timeout: 5000,
      })
    } catch {
      // Branch may already be deleted
    }

    // Clear worktree columns in DB
    db.prepare(
      'UPDATE sessions SET worktree_path = NULL, worktree_branch = NULL, original_branch = NULL WHERE id = ?',
    ).run(sessionId)

    return { success: true }
  }

  getWorktreeInfo(sessionId: string): {
    worktreePath: string | null
    worktreeBranch: string | null
    originalBranch: string | null
  } {
    const db = getDb()
    const row = db
      .prepare('SELECT worktree_path, worktree_branch, original_branch FROM sessions WHERE id = ?')
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_branch: string | null
        }
      | undefined

    return {
      worktreePath: row?.worktree_path ?? null,
      worktreeBranch: row?.worktree_branch ?? null,
      originalBranch: row?.original_branch ?? null,
    }
  }
}

export const gitWorktreeService = new GitWorktreeService()
