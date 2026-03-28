import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getDb } from './db'

const execFileAsync = promisify(execFile)

export class DiffService {
  /**
   * Capture the current HEAD hash as the baseline for computing diffs.
   * Returns the hash if captured, or null if already captured or not a git repo.
   */
  async captureGitBaseline(cwd: string, currentHash: string | null): Promise<string | null> {
    if (currentHash !== null) return null

    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd,
        timeout: 5000,
      })
      const hash = stdout.trim()
      return hash || null
    } catch {
      return null
    }
  }

  /**
   * Persist a captured baseline hash to the sessions table.
   */
  persistBaseline(sessionId: string, hash: string): void {
    const db = getDb()
    db.prepare('UPDATE sessions SET git_baseline_hash = ? WHERE id = ?').run(hash, sessionId)
  }

  /**
   * Get the git repo root for correct path resolution.
   * git diff outputs paths relative to this root, not to the session cwd.
   */
  async getGitRoot(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        timeout: 3000,
      })
      return stdout.trim()
    } catch {
      return null
    }
  }

  async getFileDiffs(
    cwd: string,
    gitBaselineHash: string | null,
    filePaths: string[],
  ): Promise<Array<{ filePath: string; status: string; diff: string }>> {
    const results: Array<{ filePath: string; status: string; diff: string }> = []

    for (const filePath of filePaths) {
      try {
        const args = gitBaselineHash
          ? ['diff', gitBaselineHash, '--', filePath]
          : ['diff', 'HEAD', '--', filePath]

        const { stdout } = await execFileAsync('git', args, {
          cwd,
          timeout: 10000,
          maxBuffer: 1024 * 1024 * 5,
        })

        if (stdout.trim()) {
          let status = 'modified'
          if (stdout.includes('new file mode')) status = 'added'
          else if (stdout.includes('deleted file mode')) status = 'deleted'
          else if (stdout.includes('rename from')) status = 'renamed'

          results.push({ filePath, status, diff: stdout })
        } else {
          const syntheticDiff = await this.buildNewFileDiff(filePath)
          results.push({
            filePath,
            status: syntheticDiff ? 'added' : 'modified',
            diff: syntheticDiff ?? '',
          })
        }
      } catch {
        const syntheticDiff = await this.buildNewFileDiff(filePath)
        results.push({
          filePath,
          status: syntheticDiff ? 'added' : 'modified',
          diff: syntheticDiff ?? '',
        })
      }
    }

    return results
  }

  async getFileStatuses(
    cwd: string,
    gitBaselineHash: string | null,
    filePaths: string[],
  ): Promise<Array<{ filePath: string; status: string }>> {
    const gitRoot = await this.getGitRoot(cwd)

    // Step 1: Detect untracked files in batch
    const untrackedFiles = new Set<string>()
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['ls-files', '--others', '--exclude-standard', '--', ...filePaths],
        { cwd, timeout: 5000 },
      )
      for (const line of stdout.trim().split('\n')) {
        if (!line) continue
        const absPath = line.startsWith('/') ? line : join(cwd, line)
        untrackedFiles.add(absPath)
      }
    } catch {
      /* ignore */
    }

    // Step 2: Get tracked file change statuses from diff against baseline
    const trackedStatuses = new Map<string, string>()
    if (gitBaselineHash) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['diff', '--name-status', gitBaselineHash, '--', ...filePaths],
          { cwd, timeout: 5000 },
        )
        this.parseNameStatus(stdout, gitRoot ?? cwd, trackedStatuses)
      } catch {
        /* ignore */
      }
    }

    // Step 3: Also check committed changes since baseline
    if (gitBaselineHash) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['diff', '--name-status', `${gitBaselineHash}..HEAD`, '--', ...filePaths],
          { cwd, timeout: 5000 },
        )
        this.parseNameStatus(stdout, gitRoot ?? cwd, trackedStatuses, true)
      } catch {
        /* ignore */
      }
    }

    // Step 4: Merge results
    const results: Array<{ filePath: string; status: string }> = []
    for (const filePath of filePaths) {
      if (untrackedFiles.has(filePath)) {
        results.push({ filePath, status: 'untracked' })
      } else if (trackedStatuses.has(filePath)) {
        results.push({ filePath, status: trackedStatuses.get(filePath) ?? 'modified' })
      } else {
        results.push({ filePath, status: 'modified' })
      }
    }

    return results
  }

  private parseNameStatus(
    stdout: string,
    resolveRoot: string,
    statuses: Map<string, string>,
    skipExisting = false,
  ): void {
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue
      const [code, ...rest] = line.split('\t')
      const relPath = rest[rest.length - 1]
      if (!relPath) continue

      const absPath = relPath.startsWith('/') ? relPath : join(resolveRoot, relPath)

      if (skipExisting && statuses.has(absPath)) continue

      switch (code?.[0]) {
        case 'A':
          statuses.set(absPath, 'added')
          break
        case 'D':
          statuses.set(absPath, 'deleted')
          break
        case 'R':
          statuses.set(absPath, 'renamed')
          break
        case 'M':
          statuses.set(absPath, 'modified')
          break
        default:
          statuses.set(absPath, 'modified')
      }
    }
  }

  /**
   * Build a synthetic unified diff showing the entire file as added content.
   */
  private async buildNewFileDiff(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      if (!content.trim()) return null

      const lines = content.split('\n')
      const lineCount = lines.length

      const header = [
        `diff --git a/${filePath} b/${filePath}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${filePath}`,
        `@@ -0,0 +1,${lineCount} @@`,
      ]
      const addedLines = lines.map((line) => `+${line}`)

      return [...header, ...addedLines].join('\n')
    } catch {
      return null
    }
  }
}

export const diffService = new DiffService()
