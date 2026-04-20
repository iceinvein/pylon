import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { GhCliStatus, GhPrDetail, GhPullRequest, GhRepo, ReviewFinding } from '../shared/types'
import { getDb } from './db'
import { assembleDiffFromPatches, parseFilesFromDiff } from './gh-cli-parse'
import { augmentExecutablePath, findKnownGhBinary } from './gh-cli-path'

export { parseFilesFromDiff } from './gh-cli-parse'

const execFileAsync = promisify(execFile)

let ghBinaryPath: string | null = null

function getConfiguredGhPath(): string | null {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ghBinaryPath'").get() as
    | { value: string }
    | undefined
  return row?.value || ghBinaryPath
}

function getGhEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: augmentExecutablePath(process.env.PATH),
  }
}

export async function resolveGhPath(): Promise<string | null> {
  const configuredPath = getConfiguredGhPath()
  if (configuredPath) {
    return configuredPath
  }

  const knownPath = findKnownGhBinary()
  if (knownPath) {
    ghBinaryPath = knownPath
    return knownPath
  }

  const { stdout: whichOut } = await execFileAsync('/usr/bin/which', ['gh'], {
    env: getGhEnv(),
  }).catch(() => ({ stdout: '' }))
  const detectedPath = whichOut.trim()

  if (detectedPath) {
    ghBinaryPath = detectedPath
    return detectedPath
  }

  return null
}

export async function execGh(args: string[], cwd?: string): Promise<string> {
  const ghPath = (await resolveGhPath()) ?? 'gh'
  const { stdout } = await execFileAsync(ghPath, args, {
    cwd,
    env: getGhEnv(),
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.trim()
}

export async function checkGhStatus(): Promise<GhCliStatus> {
  try {
    const detectedPath = await resolveGhPath()
    if (!detectedPath) {
      return {
        available: false,
        authenticated: false,
        binaryPath: null,
        username: null,
        error: 'gh CLI not found. Install from https://cli.github.com',
      }
    }

    const authOut = await execGh(['auth', 'status', '--hostname', 'github.com'])
    const usernameMatch =
      authOut.match(/Logged in to github\.com.*account\s+(\S+)/i) ||
      authOut.match(/Logged in to github\.com.*as\s+(\S+)/i)
    const username = usernameMatch?.[1] ?? null

    return { available: true, authenticated: true, binaryPath: detectedPath, username, error: null }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('not logged')) {
      const detectedPath = await resolveGhPath()
      return {
        available: true,
        authenticated: false,
        binaryPath: detectedPath,
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
    state: String(pr.state).toLowerCase() as 'open' | 'closed' | 'merged',
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
  // Fetch PR metadata (always works regardless of diff size)
  const json = await execGh([
    'pr',
    'view',
    String(prNumber),
    '--repo',
    repoFullName,
    '--json',
    'number,title,body,author,state,createdAt,updatedAt,headRefName,baseRefName,additions,deletions,reviewDecision,isDraft,url',
  ])
  const pr = JSON.parse(json) as Record<string, unknown>

  // Fetch full diff — may fail with HTTP 406 for PRs exceeding 20,000 lines.
  let diff: string | null = null
  try {
    diff = await execGh(['pr', 'diff', String(prNumber), '--repo', repoFullName])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('too_large') || msg.includes('406')) {
      // Expected for very large PRs — we'll reconstruct from per-file patches below
    } else {
      throw err
    }
  }

  // Use paginated REST API for the complete file list — gh pr view --json files
  // uses GraphQL which silently caps at ~100 files without auto-pagination.
  // We also keep the raw entries so we can reconstruct the diff from patches
  // when `gh pr diff` failed due to size limits.
  let files: Array<{ path: string; additions: number; deletions: number }>
  let filesRaw: Array<Record<string, unknown>> | null = null
  try {
    const filesJson = await execGh([
      'api',
      `repos/${repoFullName}/pulls/${prNumber}/files`,
      '--paginate',
    ])
    filesRaw = JSON.parse(filesJson) as Array<Record<string, unknown>>
    files = filesRaw.map((f) => ({
      path: (f.filename as string) ?? '',
      additions: (f.additions as number) ?? 0,
      deletions: (f.deletions as number) ?? 0,
    }))
  } catch {
    // Fallback: derive file list from the diff itself (only works if diff succeeded)
    files = diff ? parseFilesFromDiff(diff) : []
  }

  // If the full diff was too large, reconstruct it from per-file patches.
  // The REST /files endpoint returns individual patches that aren't subject to
  // the same 20k-line limit (each file's patch is returned independently).
  if (diff === null && filesRaw) {
    diff = assembleDiffFromPatches(filesRaw)
  }

  return {
    number: pr.number as number,
    title: pr.title as string,
    body: pr.body as string,
    author: (pr.author as Record<string, string>)?.login ?? 'unknown',
    state: String(pr.state).toLowerCase() as 'open' | 'closed' | 'merged',
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
    diff: diff ?? '',
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

const SEVERITY_RANK: Record<ReviewFinding['severity'], number> = {
  critical: 0,
  warning: 1,
  suggestion: 2,
  nitpick: 3,
}

const SEVERITY_ICON: Record<ReviewFinding['severity'], string> = {
  critical: '🔴',
  warning: '🟡',
  suggestion: '🔵',
  nitpick: '⚪',
}

const SEVERITY_LABEL: Record<ReviewFinding['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  suggestion: 'Suggestion',
  nitpick: 'Nitpick',
}

const plural = (n: number, singular: string, plural?: string): string =>
  `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`

export function buildReviewBody(findings: ReviewFinding[], commitId: string): string {
  const inlineFindings = findings.filter((f) => f.file && f.line !== null)
  const generalFindings = findings.filter((f) => !f.file || f.line === null)

  const counts: Record<ReviewFinding['severity'], number> = {
    critical: 0,
    warning: 0,
    suggestion: 0,
    nitpick: 0,
  }
  for (const f of findings) counts[f.severity]++

  const fileCount = new Set(inlineFindings.map((f) => f.file)).size
  const shortSha = commitId ? commitId.slice(0, 7) : ''

  let verdict: string
  if (counts.critical > 0) {
    verdict = `⚠️ **${plural(counts.critical, 'blocking issue')}**`
  } else if (counts.warning > 0) {
    verdict = `⚠️ **${plural(counts.warning, 'item')} to review**`
  } else if (findings.length > 0) {
    verdict = `💡 **${plural(findings.length, 'suggestion')}**`
  } else {
    verdict = '✅ **No issues found.**'
  }

  const scope = findings.length > 0 && fileCount > 0 ? ` across ${plural(fileCount, 'file')}.` : ''
  const sha = shortSha ? ` Reviewed at \`${shortSha}\`.` : ''
  const header = `${verdict}${scope}${sha}`.replace(/\s+$/, '')

  const lines: string[] = ['## Pylon Review', '', header]

  const topFindings = [...findings]
    .filter((f) => f.severity === 'critical' || f.severity === 'warning')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 3)

  if (topFindings.length > 0) {
    lines.push('', '### Top findings', '')
    for (const f of topFindings) {
      const loc = f.file ? ` · \`${f.file}${f.line ? `:${f.line}` : ''}\`` : ''
      lines.push(`- ${SEVERITY_ICON[f.severity]} **${f.title}**${loc}`)
    }
  }

  if (findings.length > 0) {
    lines.push(
      '',
      '<details>',
      `<summary><b>Severity breakdown</b> (${plural(findings.length, 'finding')})</summary>`,
      '',
      '| Severity | Count |',
      '|---|---|',
    )
    for (const sev of ['critical', 'warning', 'suggestion', 'nitpick'] as const) {
      if (counts[sev] > 0) {
        lines.push(`| ${SEVERITY_ICON[sev]} ${SEVERITY_LABEL[sev]} | ${counts[sev]} |`)
      }
    }
    lines.push('', '</details>')
  }

  if (generalFindings.length > 0) {
    lines.push(
      '',
      '<details>',
      `<summary><b>General notes</b> (${generalFindings.length})</summary>`,
      '',
    )
    for (const f of generalFindings) {
      lines.push(`**${f.title}.** ${f.description}`, '')
    }
    lines.push('</details>')
  }

  const footer =
    inlineFindings.length > 0
      ? '*Reviewed by Pylon. Resolve or reply on inline threads to address findings.*'
      : '*Reviewed by Pylon.*'
  lines.push('', '---', footer)

  return lines.join('\n')
}

export async function postReview(
  repoFullName: string,
  prNumber: number,
  findings: ReviewFinding[],
  commitId: string,
): Promise<void> {
  const inlineFindings = findings.filter((f) => f.file && f.line !== null)
  const reviewBody = buildReviewBody(findings, commitId)

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
    await execGh(
      [
        'api',
        `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        '--method',
        'POST',
        '--input',
        tmpPath,
      ],
      undefined,
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
