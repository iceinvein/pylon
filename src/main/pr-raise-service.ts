import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { log } from '../shared/logger'
import type {
  PrRaiseCommitInfo,
  PrRaiseDescription,
  PrRaiseFileInfo,
  PrRaiseInfo,
  PrRaiseRequest,
  PrRaiseResult,
} from '../shared/types'
import { getDb } from './db'

const logger = log.child('pr-raise-service')

const execFileAsync = promisify(execFile)

export class PrRaiseService {
  async getRaisePrInfo(sessionId: string): Promise<PrRaiseInfo> {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT worktree_path, worktree_branch, git_baseline_hash, original_cwd, original_branch FROM sessions WHERE id = ?',
      )
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          git_baseline_hash: string | null
          original_cwd: string | null
          original_branch: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.git_baseline_hash) {
      throw new Error('Session is not a worktree session or has no changes')
    }

    const cwd = row.worktree_path
    const baseline = row.git_baseline_hash

    // Run git commands in parallel
    const [diffResult, nameStatusResult, logResult, numstatResult] = await Promise.all([
      execFileAsync('git', ['diff', `${baseline}..HEAD`], { cwd, maxBuffer: 10 * 1024 * 1024 }),
      execFileAsync('git', ['diff', '--name-status', `${baseline}..HEAD`], { cwd }),
      execFileAsync('git', ['log', `${baseline}..HEAD`, '--format=%H%x1e%s%x1e%aI'], { cwd }),
      execFileAsync('git', ['diff', '--numstat', `${baseline}..HEAD`], { cwd }),
    ])

    // Parse file list with status
    const files: PrRaiseFileInfo[] = []
    const numstatLines = numstatResult.stdout.trim().split('\n').filter(Boolean)
    const numstatMap = new Map<string, { ins: number; del: number }>()
    for (const line of numstatLines) {
      const [ins, del, ...pathParts] = line.split('\t')
      const filePath = pathParts.join('\t')
      numstatMap.set(filePath, {
        ins: ins === '-' ? 0 : parseInt(ins, 10),
        del: del === '-' ? 0 : parseInt(del, 10),
      })
    }

    for (const line of nameStatusResult.stdout.trim().split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t')
      const filePath = pathParts[pathParts.length - 1]
      const stat = numstatMap.get(filePath) ?? numstatMap.get(pathParts.join('\t'))
      files.push({
        path: filePath,
        status: status.startsWith('R')
          ? 'renamed'
          : status === 'A'
            ? 'added'
            : status === 'D'
              ? 'deleted'
              : 'modified',
        insertions: stat?.ins ?? 0,
        deletions: stat?.del ?? 0,
      })
    }

    // Parse commits
    const commits: PrRaiseCommitInfo[] = logResult.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, message, timestamp] = line.split('\x1e')
        return { hash, message, timestamp }
      })

    // Compute stats
    const stats = {
      insertions: files.reduce((sum, f) => sum + f.insertions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      filesChanged: files.length,
    }

    // Detect remote
    let remote = 'origin'
    try {
      await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd })
    } catch {
      const { stdout } = await execFileAsync('git', ['remote'], { cwd })
      const firstRemote = stdout.trim().split('\n')[0]
      if (firstRemote) remote = firstRemote
    }

    // Detect repo full name
    let repoFullName = ''
    try {
      const { execGh } = await import('./gh-cli')
      repoFullName = await execGh(
        ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
        cwd,
      )
    } catch {
      const { parseGitHubRemote } = await import('./gh-cli')
      try {
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', remote], { cwd })
        const parsed = parseGitHubRemote(stdout.trim())
        if (parsed) repoFullName = `${parsed.owner}/${parsed.repo}`
      } catch {
        /* ignore */
      }
    }

    // Detect default base branch
    let baseBranch = 'main'
    try {
      const { execGh } = await import('./gh-cli')
      baseBranch =
        (await execGh(
          ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
          cwd,
        )) || 'main'
    } catch {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', 'origin/main'], { cwd })
        baseBranch = 'main'
      } catch {
        try {
          await execFileAsync('git', ['rev-parse', '--verify', 'origin/master'], { cwd })
          baseBranch = 'master'
        } catch {
          baseBranch = row.original_branch ?? 'main'
        }
      }
    }

    return {
      diff: diffResult.stdout,
      files,
      commits,
      stats,
      headBranch: row.worktree_branch,
      baseBranch,
      remote,
      repoFullName,
    }
  }

  async generatePrDescription(
    sessionId: string,
    queryAi: (userPrompt: string, systemPrompt: string) => Promise<string>,
  ): Promise<PrRaiseDescription> {
    const db = getDb()

    const messages = db
      .prepare(
        'SELECT sdk_message FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT 50',
      )
      .all(sessionId) as { sdk_message: string }[]

    const conversationSummary = messages
      .map((m) => {
        try {
          const parsed = JSON.parse(m.sdk_message)
          if (parsed.type === 'user' && typeof parsed.content === 'string') {
            return `User: ${parsed.content.slice(0, 500)}`
          }
          return null
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .slice(0, 10)
      .join('\n')

    const info = await this.getRaisePrInfo(sessionId)
    const fileList = info.files
      .map((f) => `${f.status} ${f.path} (+${f.insertions}/-${f.deletions})`)
      .join('\n')

    const session = db.prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as
      | { title: string }
      | undefined
    const sessionTitle = session?.title ?? 'Untitled'

    const diffPreview =
      info.diff.length > 8000 ? `${info.diff.slice(0, 8000)}\n... (diff truncated)` : info.diff

    const systemPrompt = `You generate pull request titles and descriptions.

Respond with ONLY a JSON object in this exact format (no markdown fences):
{"title": "feat: short descriptive title", "body": "## Summary\\n- bullet points\\n\\n## Test Plan\\n- [ ] verification steps"}

Rules:
- Title should follow conventional commit format (feat:, fix:, refactor:, etc.)
- Title should be under 72 characters
- Body should have ## Summary with bullet points and ## Test Plan with checkboxes
- Only include ## Breaking Changes section if there are breaking changes
- Be specific about what changed and why`

    const userPrompt = `Generate a pull request title and description for the following changes.

Session title: ${sessionTitle}

Conversation context:
${conversationSummary}

Files changed (${info.stats.filesChanged} files, +${info.stats.insertions}/-${info.stats.deletions}):
${fileList}

Diff (may be truncated):
${diffPreview}`

    try {
      const text = await queryAi(userPrompt, systemPrompt)
      const cleaned = text
        .replace(/^\s*```(?:json)?\s*/, '')
        .replace(/\s*```\s*$/, '')
        .trim()
      const parsed = JSON.parse(cleaned) as { title?: string; body?: string }
      return { title: parsed.title ?? sessionTitle, body: parsed.body ?? '' }
    } catch (err) {
      logger.error('generatePrDescription failed:', err)
      return {
        title: sessionTitle,
        body: `## Summary\n\nChanges from Pylon session.\n\n### Files changed\n${fileList}`,
      }
    }
  }

  async raisePr(request: PrRaiseRequest): Promise<PrRaiseResult> {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT worktree_path, worktree_branch, git_baseline_hash FROM sessions WHERE id = ?',
      )
      .get(request.sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          git_baseline_hash: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.git_baseline_hash) {
      return { success: false, error: 'Session is not a worktree session or has no changes' }
    }

    const cwd = row.worktree_path
    const branch = row.worktree_branch

    try {
      // Handle squash if requested
      if (request.squash) {
        await execFileAsync('git', ['update-ref', `refs/pylon/pre-squash/${branch}`, 'HEAD'], {
          cwd,
        })
        try {
          await execFileAsync('git', ['reset', '--soft', row.git_baseline_hash], { cwd })
          await execFileAsync('git', ['commit', '-m', request.title], { cwd })
        } catch (squashErr) {
          await execFileAsync('git', ['reset', '--hard', `refs/pylon/pre-squash/${branch}`], {
            cwd,
          })
          throw squashErr
        }
      }

      // Detect remote
      let remote = 'origin'
      try {
        await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd })
      } catch {
        const { stdout } = await execFileAsync('git', ['remote'], { cwd })
        remote = stdout.trim().split('\n')[0] || 'origin'
      }

      // Push branch
      await execFileAsync('git', ['push', '-u', remote, branch], { cwd, timeout: 60_000 })

      // Detect repo full name
      let repoFullName = ''
      try {
        const { execGh } = await import('./gh-cli')
        repoFullName = await execGh(
          ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
          cwd,
        )
      } catch {
        const { parseGitHubRemote } = await import('./gh-cli')
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', remote], { cwd })
        const parsed = parseGitHubRemote(stdout.trim())
        if (parsed) repoFullName = `${parsed.owner}/${parsed.repo}`
      }

      if (!repoFullName) {
        return {
          success: false,
          error: 'Could not determine repository. Check git remote configuration.',
        }
      }

      // Create PR
      const { createPullRequest } = await import('./gh-cli')
      const result = await createPullRequest(
        repoFullName,
        branch,
        request.baseBranch,
        request.title,
        request.body,
      )

      return { success: true, prUrl: result.url, prNumber: result.number }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('raisePr failed:', err)
      return { success: false, error: msg }
    }
  }
}

export const prRaiseService = new PrRaiseService()
