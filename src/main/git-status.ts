import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { log } from '../shared/logger'
import type {
  GitBranchStatus,
  GitFetchCompareCommit,
  GitFetchComparison,
  GitPullResult,
} from '../shared/types'

const execFileAsync = promisify(execFile)
const logger = log.child('git-status')

/** Parse `git rev-list --left-right --count HEAD...@{upstream}` output */
export function parseRevListOutput(stdout: string): { ahead: number; behind: number } {
  const trimmed = stdout.trim()
  if (!trimmed) return { ahead: 0, behind: 0 }
  const [ahead, behind] = trimmed.split('\t').map(Number)
  return { ahead: ahead || 0, behind: behind || 0 }
}

/** Parse `git log --oneline` output into commit objects */
export function parseLogOneline(stdout: string): GitFetchCompareCommit[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  return trimmed.split('\n').map((line) => {
    const spaceIdx = line.indexOf(' ')
    return {
      hash: line.slice(0, spaceIdx),
      message: line.slice(spaceIdx + 1),
    }
  })
}

export async function getBranchStatus(cwd: string): Promise<GitBranchStatus> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd, timeout: 3000 })
  } catch {
    return { branch: null, ahead: 0, behind: 0, hasUpstream: false, isGitRepo: false }
  }

  let branch: string | null = null
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      timeout: 3000,
    })
    branch = stdout.trim()
    if (branch === 'HEAD') branch = '(detached)'
  } catch {
    return { branch: null, ahead: 0, behind: 0, hasUpstream: false, isGitRepo: true }
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { cwd, timeout: 5000 },
    )
    const { ahead, behind } = parseRevListOutput(stdout)
    return { branch, ahead, behind, hasUpstream: true, isGitRepo: true }
  } catch {
    return { branch, ahead: 0, behind: 0, hasUpstream: false, isGitRepo: true }
  }
}

export async function fetchAndCompare(cwd: string): Promise<GitFetchComparison> {
  const status = await getBranchStatus(cwd)
  const branch = status.branch ?? 'unknown'

  try {
    await execFileAsync('git', ['fetch', 'origin'], { cwd, timeout: 30000 })
  } catch (err) {
    logger.warn('git fetch failed:', err)
  }

  let ahead = 0
  let behind = 0
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { cwd, timeout: 5000 },
    )
    const parsed = parseRevListOutput(stdout)
    ahead = parsed.ahead
    behind = parsed.behind
  } catch {
    // No upstream
  }

  let aheadCommits: GitFetchCompareCommit[] = []
  if (ahead > 0) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '@{upstream}..HEAD', '--oneline', '--no-decorate'],
        { cwd, timeout: 5000 },
      )
      aheadCommits = parseLogOneline(stdout)
    } catch {
      // ignore
    }
  }

  let behindCommits: GitFetchCompareCommit[] = []
  if (behind > 0) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', 'HEAD..@{upstream}', '--oneline', '--no-decorate'],
        { cwd, timeout: 5000 },
      )
      behindCommits = parseLogOneline(stdout)
    } catch {
      // ignore
    }
  }

  let filesChanged = 0
  if (behind > 0) {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD...@{upstream}'], {
        cwd,
        timeout: 5000,
      })
      const lines = stdout.trim().split('\n')
      const summaryLine = lines[lines.length - 1] ?? ''
      const match = summaryLine.match(/(\d+)\s+files?\s+changed/)
      if (match) filesChanged = Number.parseInt(match[1], 10)
    } catch {
      // ignore
    }
  }

  return { branch, ahead, behind, aheadCommits, behindCommits, filesChanged }
}

export async function pullBranch(cwd: string): Promise<GitPullResult> {
  try {
    await execFileAsync('git', ['pull'], { cwd, timeout: 60000 })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('git pull failed:', message)
    if (message.includes('CONFLICT') || message.includes('Automatic merge failed')) {
      try {
        await execFileAsync('git', ['merge', '--abort'], { cwd, timeout: 5000 })
      } catch {
        // ignore abort failure
      }
      return {
        success: false,
        error: 'Merge conflicts detected. Please pull and resolve conflicts in your terminal.',
      }
    }
    return { success: false, error: message }
  }
}
