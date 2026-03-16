import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CommitGroup, FileStatus } from '../shared/git-types'
import { log } from '../shared/logger'

const execFileAsync = promisify(execFile)
const logger = log.child('git-commit-service')

export async function getWorkingTreeStatus(cwd: string): Promise<FileStatus[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v2'], {
      cwd,
      timeout: 10000,
    })

    const files: FileStatus[] = []
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      if (line.startsWith('1 ') || line.startsWith('2 ')) {
        const parts = line.split(' ')
        const xy = parts[1] ?? ''
        const path = line.split('\t')[0]?.split(' ').pop() ?? ''

        const indexStatus = xy[0]
        const workTreeStatus = xy[1]
        const staged = indexStatus !== '.' && indexStatus !== '?'

        let status: FileStatus['status'] = 'modified'
        const relevantCode = staged ? indexStatus : workTreeStatus
        if (relevantCode === 'A') status = 'added'
        else if (relevantCode === 'D') status = 'deleted'
        else if (relevantCode === 'R') status = 'renamed'

        files.push({ path, status, staged })
      } else if (line.startsWith('? ')) {
        const path = line.slice(2)
        files.push({ path, status: 'untracked', staged: false })
      }
    }

    return files
  } catch (err) {
    logger.error('Failed to get working tree status:', err)
    return []
  }
}

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await execFileAsync('git', ['add', '--', ...paths], { cwd, timeout: 10000 })
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await execFileAsync('git', ['restore', '--staged', '--', ...paths], { cwd, timeout: 10000 })
}

export async function executeCommitGroup(
  cwd: string,
  group: CommitGroup,
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync('git', ['reset', 'HEAD'], { cwd, timeout: 5000 }).catch(() => {})

    const paths = group.files.map((f) => f.path)
    await stageFiles(cwd, paths)

    await execFileAsync('git', ['commit', '-m', group.message], { cwd, timeout: 10000 })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Commit failed:', message)
    return { success: false, error: message }
  }
}

export async function getDiffForAnalysis(cwd: string): Promise<string> {
  // Only analyze staged (checked) files — this respects the user's checkbox selections
  // in the commit tab. Unstaged/untracked files are intentionally excluded.
  try {
    const { stdout: staged } = await execFileAsync('git', ['diff', '--cached'], {
      cwd,
      timeout: 10000,
    })
    return staged.trim()
  } catch {
    return ''
  }
}
