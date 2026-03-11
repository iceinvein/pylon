import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { GhCliStatus, GhPrDetail, GhPullRequest, GhRepo, ReviewFinding } from '../shared/types'
import { getDb } from './db'

const execFileAsync = promisify(execFile)

let ghBinaryPath: string | null = null

function getGhPath(): string {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ghBinaryPath'").get() as
    | { value: string }
    | undefined
  return row?.value || ghBinaryPath || 'gh'
}

async function execGh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(getGhPath(), args, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.trim()
}

export async function checkGhStatus(): Promise<GhCliStatus> {
  try {
    const { stdout: whichOut } = await execFileAsync('/usr/bin/which', ['gh']).catch(() => ({
      stdout: '',
    }))
    const detectedPath = whichOut.trim()

    if (!detectedPath && !ghBinaryPath) {
      return {
        available: false,
        authenticated: false,
        binaryPath: null,
        username: null,
        error: 'gh CLI not found. Install from https://cli.github.com',
      }
    }

    ghBinaryPath = detectedPath || ghBinaryPath

    const authOut = await execGh(['auth', 'status', '--hostname', 'github.com'])
    const usernameMatch =
      authOut.match(/Logged in to github\.com.*account\s+(\S+)/i) ||
      authOut.match(/Logged in to github\.com.*as\s+(\S+)/i)
    const username = usernameMatch?.[1] ?? null

    return { available: true, authenticated: true, binaryPath: getGhPath(), username, error: null }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('not logged')) {
      return {
        available: true,
        authenticated: false,
        binaryPath: getGhPath(),
        username: null,
        error: 'Not authenticated. Run: gh auth login',
      }
    }
    return { available: false, authenticated: false, binaryPath: null, username: null, error: msg }
  }
}

export async function setGhPath(path: string): Promise<void> {
  if (!existsSync(path)) {
    throw new Error(`gh binary not found at path: ${path}`)
  }

  try {
    await execFileAsync(path, ['--version'], { timeout: 5_000 })
  } catch {
    throw new Error(`Path does not appear to be a valid gh binary: ${path}`)
  }

  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ghBinaryPath', ?)").run(path)
  ghBinaryPath = path
}

export function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export async function discoverRepos(projectPaths: string[]): Promise<GhRepo[]> {
  const repos: GhRepo[] = []
  for (const projectPath of projectPaths) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', projectPath, 'remote', 'get-url', 'origin'],
        { timeout: 5000 },
      )
      const remoteUrl = stdout.trim()
      if (!remoteUrl) continue
      const parsed = parseGitHubRemote(remoteUrl)
      if (!parsed) continue
      repos.push({
        owner: parsed.owner,
        repo: parsed.repo,
        fullName: `${parsed.owner}/${parsed.repo}`,
        projectPath,
      })
    } catch {
      // Skip non-git or non-GitHub projects
    }
  }
  const seen = new Set<string>()
  return repos.filter((r) => {
    if (seen.has(r.fullName)) return false
    seen.add(r.fullName)
    return true
  })
}

export async function listPrs(repoFullName: string, state = 'open'): Promise<GhPullRequest[]> {
  const json = await execGh([
    'pr',
    'list',
    '--repo',
    repoFullName,
    '--state',
    state,
    '--json',
    'number,title,author,state,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,reviewDecision,isDraft,url',
    '--limit',
    '30',
  ])
  const raw = JSON.parse(json) as Array<Record<string, unknown>>
  return raw.map((pr) => ({
    number: pr.number as number,
    title: pr.title as string,
    author: (pr.author as Record<string, string>)?.login ?? 'unknown',
    state: pr.state as 'open' | 'closed' | 'merged',
    createdAt: pr.createdAt as string,
    updatedAt: pr.updatedAt as string,
    headBranch: pr.headRefName as string,
    baseBranch: pr.baseRefName as string,
    additions: pr.additions as number,
    deletions: pr.deletions as number,
    reviewDecision: (pr.reviewDecision as string) || null,
    isDraft: pr.isDraft as boolean,
    url: pr.url as string,
    repo: { owner: '', repo: '', fullName: repoFullName, projectPath: '' },
  }))
}

export async function getPrDetail(repoFullName: string, prNumber: number): Promise<GhPrDetail> {
  const [json, diff] = await Promise.all([
    execGh([
      'pr',
      'view',
      String(prNumber),
      '--repo',
      repoFullName,
      '--json',
      'number,title,body,author,state,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,reviewDecision,isDraft,url,files',
    ]),
    execGh(['pr', 'diff', String(prNumber), '--repo', repoFullName]),
  ])

  const pr = JSON.parse(json) as Record<string, unknown>
  const files = ((pr.files as Array<Record<string, unknown>>) ?? []).map((f) => ({
    path: f.path as string,
    additions: f.additions as number,
    deletions: f.deletions as number,
  }))

  return {
    number: pr.number as number,
    title: pr.title as string,
    body: pr.body as string,
    author: (pr.author as Record<string, string>)?.login ?? 'unknown',
    state: pr.state as 'open' | 'closed' | 'merged',
    createdAt: pr.createdAt as string,
    updatedAt: pr.updatedAt as string,
    headBranch: pr.headRefName as string,
    baseBranch: pr.baseRefName as string,
    additions: pr.additions as number,
    deletions: pr.deletions as number,
    reviewDecision: (pr.reviewDecision as string) || null,
    isDraft: pr.isDraft as boolean,
    url: pr.url as string,
    files,
    diff,
    repo: { owner: '', repo: '', fullName: repoFullName, projectPath: '' },
  }
}

export async function postComment(
  repoFullName: string,
  prNumber: number,
  body: string,
): Promise<void> {
  await execGh(['pr', 'comment', String(prNumber), '--repo', repoFullName, '--body', body])
}

export async function postReview(
  repoFullName: string,
  prNumber: number,
  findings: ReviewFinding[],
  commitId: string,
): Promise<void> {
  const inlineFindings = findings.filter((f) => f.file && f.line !== null)
  const generalFindings = findings.filter((f) => !f.file || f.line === null)

  let reviewBody = '## PR Review Summary\n\n'
  if (generalFindings.length > 0) {
    for (const f of generalFindings) {
      const icon =
        f.severity === 'critical'
          ? '🔴'
          : f.severity === 'warning'
            ? '🟡'
            : f.severity === 'suggestion'
              ? '🔵'
              : '⚪'
      reviewBody += `${icon} **${f.title}**\n${f.description}\n\n`
    }
  } else {
    reviewBody += `${inlineFindings.length} inline comment(s) posted.\n`
  }
  reviewBody += '\n---\n*Reviewed by Pylon*'

  const comments = inlineFindings.map((f) => ({
    path: f.file,
    line: f.line,
    body: `**${f.severity.toUpperCase()}:** ${f.title}\n\n${f.description}`,
  }))

  const payload = JSON.stringify({
    body: reviewBody,
    event: 'COMMENT',
    ...(commitId ? { commit_id: commitId } : {}),
    comments,
  })

  const [owner, repo] = repoFullName.split('/')
  const tmpPath = join(tmpdir(), `pylon-review-${Date.now()}.json`)
  await writeFile(tmpPath, payload)

  try {
    await execFileAsync(
      getGhPath(),
      [
        'api',
        `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        '--method',
        'POST',
        '--input',
        tmpPath,
      ],
      { timeout: 30_000 },
    )
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

export async function getHeadCommitSha(repoFullName: string, prNumber: number): Promise<string> {
  const json = await execGh([
    'pr',
    'view',
    String(prNumber),
    '--repo',
    repoFullName,
    '--json',
    'headRefOid',
  ])
  const parsed = JSON.parse(json)
  return parsed.headRefOid as string
}

export async function createPullRequest(
  repoFullName: string,
  headBranch: string,
  baseBranch: string,
  title: string,
  body: string,
): Promise<{ url: string; number: number }> {
  // gh pr create outputs the PR URL to stdout
  const prUrl = await execGh([
    'pr',
    'create',
    '--repo',
    repoFullName,
    '--head',
    headBranch,
    '--base',
    baseBranch,
    '--title',
    title,
    '--body',
    body,
  ])

  // Extract PR number from URL (e.g., https://github.com/owner/repo/pull/42)
  const numberMatch = prUrl.match(/\/pull\/(\d+)/)
  const prNumber = numberMatch ? parseInt(numberMatch[1], 10) : 0

  return { url: prUrl.trim(), number: prNumber }
}
