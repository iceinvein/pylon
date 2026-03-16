import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { log } from '../shared/logger'

const execFileAsync = promisify(execFile)
const logger = log.child('git-ops-service')

export async function executeGitCommands(
  cwd: string,
  commands: string[],
): Promise<{ success: boolean; output: string; error?: string }> {
  const outputs: string[] = []

  for (const cmd of commands) {
    const parts = cmd.split(/\s+/)
    if (parts[0] !== 'git') {
      return {
        success: false,
        output: outputs.join('\n'),
        error: `Refusing non-git command: ${cmd}`,
      }
    }

    try {
      const { stdout, stderr } = await execFileAsync('git', parts.slice(1), {
        cwd,
        timeout: 30000,
      })
      outputs.push(stdout.trim() || stderr.trim() || `(${cmd} completed)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Git command failed:', cmd, message)
      return { success: false, output: outputs.join('\n'), error: message }
    }
  }

  return { success: true, output: outputs.join('\n') }
}

export async function getConflictFiles(
  cwd: string,
): Promise<{ filePath: string; status: string }[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd,
      timeout: 5000,
    })
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => ({ filePath: f, status: 'conflict' }))
  } catch {
    return []
  }
}

export async function readConflictFile(cwd: string, filePath: string): Promise<string> {
  const { join } = await import('node:path')
  const fullPath = join(cwd, filePath)
  return readFile(fullPath, 'utf-8')
}

export async function writeResolvedFile(
  cwd: string,
  filePath: string,
  content: string,
): Promise<void> {
  const { join } = await import('node:path')
  const fullPath = join(cwd, filePath)
  await writeFile(fullPath, content, 'utf-8')
  await execFileAsync('git', ['add', filePath], { cwd, timeout: 5000 })
}

export async function continueOperation(
  cwd: string,
): Promise<{ success: boolean; error?: string }> {
  for (const op of ['rebase', 'merge', 'cherry-pick']) {
    try {
      await execFileAsync('git', [op, '--continue'], { cwd, timeout: 30000 })
      return { success: true }
    } catch {
      // Not in this operation, try next
    }
  }
  return { success: false, error: 'No interrupted operation to continue' }
}
