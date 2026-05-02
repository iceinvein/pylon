import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { Database } from 'bun:sqlite'

type FindingRow = {
  repo_full_name: string
  pr_number: number
  pr_title: string | null
  created_at: number
  domain: string | null
  severity: string
  impact: string
  likelihood: string
  confidence: string
  action: string
  file: string
  line: number | null
  title: string
  description: string
  posted: number
  suggestion_body: string | null
}

type ReviewRow = {
  id: string
  repo_full_name: string
  pr_number: number
  pr_title: string | null
  created_at: number
  status: string
  review_mode: string
  review_scope: string
  findings: number
}

type DiffFile = {
  hunkLines: Set<number>
  addedLines: Set<number>
}

const DEFAULT_DB = join(homedir(), 'Library/Application Support/pylon/pylon.db')

function argValue(name: string): string | null {
  const prefix = `${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.0%'
  return `${((part / whole) * 100).toFixed(1)}%`
}

function compact(text: string, max = 150): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, max - 1)}…`
}

function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const k = key(row)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

function printMap(title: string, map: Map<string, number>, limit = 12): void {
  console.log(`\n${title}`)
  for (const [key, count] of [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)) {
    console.log(`  ${key}: ${count}`)
  }
}

function parsePatch(text: string): Map<string, DiffFile> {
  const files = new Map<string, DiffFile>()
  let file: string | null = null
  let newLine = 0

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      file = null
      continue
    }
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length)
      if (!files.has(file)) {
        files.set(file, { hunkLines: new Set<number>(), addedLines: new Set<number>() })
      }
      continue
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      newLine = Number(hunk[1])
      continue
    }

    if (!file || line.startsWith('--- ')) continue
    const entry = files.get(file)
    if (!entry) continue

    if (line.startsWith('+') && !line.startsWith('+++')) {
      entry.hunkLines.add(newLine)
      entry.addedLines.add(newLine)
      newLine++
    } else if (line.startsWith(' ')) {
      entry.hunkLines.add(newLine)
      newLine++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Old-side line: no right-side line number to anchor.
    }
  }

  return files
}

function fetchDiff(repo: string, prNumber: number): Map<string, DiffFile> | null {
  try {
    const output = execFileSync('gh', ['pr', 'diff', String(prNumber), '--repo', repo, '--patch'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
    return parsePatch(output)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`  diff fetch failed for ${repo}#${prNumber}: ${compact(msg, 110)}`)
    return null
  }
}

function readDiffFromDir(diffDir: string, repo: string, prNumber: number): Map<string, DiffFile> | null {
  const [owner, name] = repo.split('/')
  const candidates = [
    join(diffDir, `${owner}__${name}__${prNumber}.diff`),
    join(diffDir, `${owner}-${name}-${prNumber}.diff`),
    join(diffDir, `pr-${prNumber}.diff`),
    join(diffDir, `pylon-pr${prNumber}.diff`),
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  return path ? parsePatch(readFileSync(path, 'utf8')) : null
}

const dbPath = argValue('--db') ?? DEFAULT_DB
const since = argValue('--since')
const diffDir = argValue('--diff-dir')
const verifyDiffs = hasFlag('--verify-diffs')

if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`)
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true, create: false })
const sinceClause = since ? 'WHERE r.created_at >= unixepoch(?) * 1000' : ''
const params = since ? [since] : []

const reviews = db
  .query(
    `SELECT r.id, r.repo_full_name, r.pr_number, r.pr_title, r.created_at, r.status,
            r.review_mode, r.review_scope, count(f.id) AS findings
       FROM pr_reviews r
       LEFT JOIN pr_review_findings f ON f.review_id = r.id
       ${sinceClause}
      GROUP BY r.id
      ORDER BY r.created_at`,
  )
  .all(...params) as ReviewRow[]

const findings = db
  .query(
    `SELECT r.repo_full_name, r.pr_number, r.pr_title, r.created_at,
            f.domain, f.severity, f.impact, f.likelihood, f.confidence, f.action,
            f.file, f.line, f.title, f.description, f.posted, f.suggestion_body
       FROM pr_review_findings f
       JOIN pr_reviews r ON r.id = f.review_id
       ${sinceClause}
      ORDER BY r.created_at, f.domain, f.severity`,
  )
  .all(...params) as FindingRow[]

const distinctPrs = new Set(reviews.map((r) => `${r.repo_full_name}#${r.pr_number}`)).size
const canonicalSeverity = findings.filter((f) =>
  ['blocker', 'high', 'medium', 'low'].includes(f.severity),
).length
const labeledDescriptions = findings.filter((f) => f.description.startsWith('Observation:')).length
const uncertain = findings.filter((f) =>
  /needs verification|cannot verify|worth validating/i.test(f.description),
)
const preExisting = findings.filter((f) => /pre-existing|didn't introduce|not introduced/i.test(f.description))
const lowValue = findings.filter((f) => /harmless|negligible|microseconds?|no action needed/i.test(f.description))
const unanchored = findings.filter((f) => f.line === null)
const suggestions = findings.filter((f) => f.suggestion_body)

console.log('PR Review Eval')
console.log(`  DB: ${dbPath}`)
if (since) console.log(`  Since: ${since}`)
console.log(`  Reviews: ${reviews.length}`)
console.log(`  Distinct PRs: ${distinctPrs}`)
console.log(`  Findings: ${findings.length}`)
console.log(`  Canonical severity labels: ${canonicalSeverity}/${findings.length} (${pct(canonicalSeverity, findings.length)})`)
console.log(`  Labeled descriptions: ${labeledDescriptions}/${findings.length} (${pct(labeledDescriptions, findings.length)})`)
console.log(`  Unanchored findings: ${unanchored.length}/${findings.length} (${pct(unanchored.length, findings.length)})`)
console.log(`  Suggestions: ${suggestions.length}/${findings.length} (${pct(suggestions.length, findings.length)})`)
console.log(`  Uncertainty language: ${uncertain.length}/${findings.length} (${pct(uncertain.length, findings.length)})`)
console.log(`  Pre-existing language: ${preExisting.length}/${findings.length} (${pct(preExisting.length, findings.length)})`)
console.log(`  Low-value language: ${lowValue.length}/${findings.length} (${pct(lowValue.length, findings.length)})`)

printMap('Severity', countBy(findings, (f) => f.severity))
printMap('Domain', countBy(findings, (f) => f.domain ?? '(none)'))
printMap('Confidence', countBy(findings, (f) => f.confidence))

console.log('\nReviews With Most Findings')
for (const review of [...reviews].sort((a, b) => b.findings - a.findings).slice(0, 10)) {
  console.log(
    `  ${review.repo_full_name}#${review.pr_number}: ${review.findings} findings — ${compact(review.pr_title ?? '')}`,
  )
}

const sameLineGroups = countBy(
  findings.filter((f) => f.line !== null),
  (f) => `${f.repo_full_name}#${f.pr_number}:${f.file}:${f.line}`,
)
const duplicateAnchors = [...sameLineGroups.entries()].filter(([, count]) => count > 1)
console.log(`\nRepeated file:line anchors: ${duplicateAnchors.length}`)
for (const [anchor, count] of duplicateAnchors.sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${count}x ${anchor}`)
}

function printSamples(title: string, rows: FindingRow[], limit = 5): void {
  if (rows.length === 0) return
  console.log(`\n${title}`)
  for (const f of rows.slice(0, limit)) {
    console.log(
      `  ${f.repo_full_name}#${f.pr_number} ${f.domain ?? 'unknown'}/${f.severity} ${f.file}:${f.line ?? 'general'} — ${f.title}`,
    )
    console.log(`    ${compact(f.description)}`)
  }
}

printSamples('Uncertainty Samples', uncertain)
printSamples('Pre-existing Samples', preExisting)
printSamples('Low-value Samples', lowValue)

if (verifyDiffs || diffDir) {
  console.log('\nDiff Anchor Check')
  const diffCache = new Map<string, Map<string, DiffFile> | null>()
  for (const key of new Set(findings.map((f) => `${f.repo_full_name}#${f.pr_number}`))) {
    const [repo, pr] = key.split('#')
    const prNumber = Number(pr)
    diffCache.set(
      key,
      diffDir ? readDiffFromDir(diffDir, repo, prNumber) : verifyDiffs ? fetchDiff(repo, prNumber) : null,
    )
  }

  let checked = 0
  let inHunk = 0
  let onAddedLine = 0
  const misses: FindingRow[] = []

  for (const f of findings) {
    if (f.line === null) continue
    const diff = diffCache.get(`${f.repo_full_name}#${f.pr_number}`)
    if (!diff) continue
    checked++
    const file = diff.get(f.file)
    if (file?.hunkLines.has(f.line)) inHunk++
    else misses.push(f)
    if (file?.addedLines.has(f.line)) onAddedLine++
  }

  console.log(`  Checked anchored findings: ${checked}`)
  console.log(`  Lines present in diff hunks: ${inHunk}/${checked} (${pct(inHunk, checked)})`)
  console.log(`  Lines are added lines: ${onAddedLine}/${checked} (${pct(onAddedLine, checked)})`)
  printSamples('Anchor Miss Samples', misses)
}
