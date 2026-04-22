import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type {
  GhCliStatus,
  GhPrDetail,
  GhPrStateFilter,
  GhPullRequest,
  GhRepo,
  ReviewFinding,
  ReviewFocus,
} from '../shared/types'
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

export async function listPrs(
  repoFullName: string,
  state: GhPrStateFilter = 'open',
): Promise<GhPullRequest[]> {
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

export async function postFindingComment(
  repoFullName: string,
  prNumber: number,
  finding: ReviewFinding,
): Promise<void> {
  await postComment(repoFullName, prNumber, buildConversationCommentBody(finding))
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

const NEXT_STEP: Record<ReviewFinding['severity'], string> = {
  critical: 'Address this before merging, or reply with the context that makes this path safe.',
  warning: 'Verify this path and update the code if the behavior can occur.',
  suggestion: 'Consider folding this in if it matches the direction of the change.',
  nitpick: 'Tidy this when convenient if you touch this area again.',
}

const FOCUS_LABEL: Record<ReviewFocus, string> = {
  security: 'Security',
  bugs: 'Bugs',
  performance: 'Performance',
  style: 'Style',
  architecture: 'Architecture',
  ux: 'UX',
}

type ReviewComment = {
  path: string
  line: number
  side: 'RIGHT'
  body: string
}

export type PreparedReviewPost = {
  body: string
  comments: ReviewComment[]
  inlineFindings: ReviewFinding[]
  summaryFindings: ReviewFinding[]
}

const plural = (n: number, singular: string, plural?: string): string =>
  `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`

function formatLocation(finding: ReviewFinding): string {
  if (!finding.file) return ''
  return `\`${finding.file}${finding.line ? `:${finding.line}` : ''}\``
}

function formatFocus(finding: ReviewFinding): string {
  if (!finding.domain) return ''
  return FOCUS_LABEL[finding.domain] ?? finding.domain
}

export function buildReviewBody(
  findings: ReviewFinding[],
  commitId: string,
  options: { inlineFindings?: ReviewFinding[]; summaryFindings?: ReviewFinding[] } = {},
): string {
  const inlineFindings = options.inlineFindings ?? findings.filter((f) => f.file && f.line !== null)
  const summaryFindings =
    options.summaryFindings ?? findings.filter((f) => !f.file || f.line === null)
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

  if (findings.length > 0) {
    const summaryCount = summaryFindings.length
    const inlineText =
      inlineFindings.length > 0
        ? `Posted ${plural(inlineFindings.length, 'inline thread')}.`
        : 'No inline threads were posted.'
    const summaryText =
      summaryCount > 0
        ? ` ${plural(summaryCount, 'finding')} ${summaryCount === 1 ? 'is' : 'are'} listed in this summary.`
        : ''
    lines.push('', `${inlineText}${summaryText}`)
  }

  const topFindings = [...findings]
    .filter((f) => f.severity === 'critical' || f.severity === 'warning')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 3)

  if (topFindings.length > 0) {
    lines.push('', '### Needs Attention', '')
    for (const f of topFindings) {
      const loc = formatLocation(f)
      const focus = formatFocus(f)
      const meta = [loc, focus].filter(Boolean).join(' · ')
      lines.push(
        `- ${SEVERITY_ICON[f.severity]} **${SEVERITY_LABEL[f.severity]}: ${f.title}**${meta ? ` · ${meta}` : ''}`,
      )
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
      const footer = buildFindingFooter(f)
      lines.push(
        `#### ${SEVERITY_ICON[f.severity]} ${SEVERITY_LABEL[f.severity]}: ${f.title}`,
        '',
        f.description,
        footer || '',
        '',
      )
    }
    lines.push('</details>')
  }

  const unanchoredFindings = summaryFindings.filter((f) => f.file && f.line !== null)
  if (unanchoredFindings.length > 0) {
    lines.push(
      '',
      '<details>',
      `<summary><b>Findings listed in summary</b> (${unanchoredFindings.length})</summary>`,
      '',
    )
    for (const f of unanchoredFindings) {
      const loc = formatLocation(f)
      const footer = buildFindingFooter(f)
      lines.push(
        `#### ${SEVERITY_ICON[f.severity]} ${SEVERITY_LABEL[f.severity]}: ${f.title}${loc ? ` ${loc}` : ''}`,
        '',
        f.description,
        footer || '',
        '',
      )
    }
    lines.push('</details>')
  }

  const footer =
    inlineFindings.length > 0
      ? '*Generated by Pylon. Inline threads contain anchored findings; summary-only items are listed above.*'
      : '*Generated by Pylon. Please verify findings before merging.*'
  lines.push('', '---', footer)

  return lines.join('\n')
}

function normalizeFindingForHash(finding: ReviewFinding): string {
  return JSON.stringify({
    file: finding.file || '',
    line: finding.line ?? null,
    severity: finding.severity,
    title: finding.title.trim(),
    description: finding.description.trim(),
  })
}

export function getFindingMarker(finding: ReviewFinding): string {
  const hash = createHash('sha256')
    .update(normalizeFindingForHash(finding))
    .digest('hex')
    .slice(0, 16)
  const id = finding.id.replace(/[^a-zA-Z0-9_-]/g, '')
  return `<!-- pylon:finding id=${id} hash=${hash} -->`
}

function buildFindingFooter(finding: ReviewFinding): string {
  const focus = formatFocus(finding)
  if (!focus) return ''
  return `<sub>Focus · ${focus}</sub>`
}

function buildInlineCommentBody(finding: ReviewFinding): string {
  const icon = SEVERITY_ICON[finding.severity]
  const label = SEVERITY_LABEL[finding.severity]
  const footer = buildFindingFooter(finding)
  return [
    `### ${icon} ${label}: ${finding.title}`,
    '',
    finding.description,
    '',
    `> **Next step:** ${NEXT_STEP[finding.severity]}`,
    footer ? '' : null,
    footer || null,
    '',
    getFindingMarker(finding),
  ]
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
}

export function buildConversationCommentBody(finding: ReviewFinding): string {
  const icon = SEVERITY_ICON[finding.severity]
  const label = SEVERITY_LABEL[finding.severity]
  const location = formatLocation(finding)
  const focus = formatFocus(finding)
  const metaParts = [
    location ? `Location · ${location}` : '',
    focus ? `Focus · ${focus}` : '',
  ].filter(Boolean)
  const metaLine = metaParts.length > 0 ? `<sub>${metaParts.join(' · ')}</sub>` : ''

  return [
    '## Pylon Finding',
    '',
    `### ${icon} ${label}: ${finding.title}`,
    metaLine ? '' : null,
    metaLine || null,
    '',
    finding.description,
    '',
    `> **Next step:** ${NEXT_STEP[finding.severity]}`,
    '',
    getFindingMarker(finding),
  ]
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
}

function parseReviewableRightLines(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>()
  const chunks = diff.split(/^(?=diff --git )/m)

  for (const chunk of chunks) {
    if (!chunk.startsWith('diff --git ')) continue

    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+)/)
    const plusMatch = chunk.match(/^\+\+\+ b\/(.+)$/m)
    const filePath = plusMatch?.[1] ?? headerMatch?.[2]
    if (!filePath || filePath === '/dev/null') continue

    const lines = result.get(filePath) ?? new Set<number>()
    let newLine: number | null = null

    for (const line of chunk.split('\n')) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (hunk) {
        newLine = Number(hunk[1])
        continue
      }
      if (newLine === null) continue
      if (line.startsWith('diff --git ') || line.startsWith('---') || line.startsWith('+++')) {
        continue
      }
      if (line === '') continue
      if (line.startsWith('\\')) continue
      if (line.startsWith('-')) continue

      lines.add(newLine)
      newLine++
    }

    if (lines.size > 0) result.set(filePath, lines)
  }

  return result
}

export function prepareReviewPost(
  findings: ReviewFinding[],
  commitId: string,
  diff: string,
): PreparedReviewPost {
  const reviewableLines = parseReviewableRightLines(diff)
  const inlineFindings: ReviewFinding[] = []
  const summaryFindings: ReviewFinding[] = []

  for (const finding of findings) {
    if (!finding.file || finding.line === null) {
      summaryFindings.push(finding)
      continue
    }

    const fileLines = reviewableLines.get(finding.file)
    if (fileLines?.has(finding.line)) {
      inlineFindings.push(finding)
    } else {
      summaryFindings.push(finding)
    }
  }

  return {
    body: buildReviewBody(findings, commitId, { inlineFindings, summaryFindings }),
    comments: inlineFindings.map((f) => ({
      path: f.file,
      line: f.line as number,
      side: 'RIGHT' as const,
      body: buildInlineCommentBody(f),
    })),
    inlineFindings,
    summaryFindings,
  }
}

export async function postReview(
  repoFullName: string,
  prNumber: number,
  findings: ReviewFinding[],
  commitId: string,
): Promise<void> {
  const detail = await getPrDetail(repoFullName, prNumber).catch(() => null)
  const prepared = prepareReviewPost(findings, commitId, detail?.diff ?? '')

  const payload = JSON.stringify({
    body: prepared.body,
    event: 'COMMENT',
    ...(commitId ? { commit_id: commitId } : {}),
    comments: prepared.comments,
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
