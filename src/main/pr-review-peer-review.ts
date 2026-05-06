import { randomUUID } from 'node:crypto'
import type {
  ReviewFinding,
  ReviewFindingRisk,
  ReviewFindingSeverity,
  ReviewFindingSuggestion,
  ReviewFocus,
} from '../shared/types'
import type { ProviderId } from './providers/types'

type PromptDetail = {
  title: string
  author: string
  headBranch: string
  baseBranch: string
  body: string
  files: ReadonlyArray<{ path: string; additions: number; deletions: number }>
  diff: string
}

type PeerReviewPromptInput = {
  primaryProvider: ProviderId
  peerProvider: ProviderId
  detail: PromptDetail
  findings: ReviewFinding[]
}

export type PeerReviewUpdate = {
  type: 'update'
  id: string
  reason: string
  fields: Partial<
    Pick<ReviewFinding, 'file' | 'line' | 'severity' | 'risk' | 'title' | 'description'>
  > & {
    suggestion?: ReviewFindingSuggestion | null
  }
}

export type PeerReviewAddition = {
  type: 'add'
  reason: string
  finding: Pick<ReviewFinding, 'file' | 'line' | 'severity' | 'risk' | 'title' | 'description'> & {
    domain?: ReviewFocus | null
    suggestion?: ReviewFindingSuggestion
  }
}

export type PeerReviewChange = PeerReviewUpdate | PeerReviewAddition

type DiffHunk = {
  file: string
  oldPath: string | null
  start: number
  end: number
  text: string
}

const VALID_SEVERITIES = new Set<ReviewFindingSeverity>(['blocker', 'high', 'medium', 'low'])
const VALID_IMPACTS = new Set<ReviewFindingRisk['impact']>(['critical', 'high', 'medium', 'low'])
const VALID_LIKELIHOODS = new Set<ReviewFindingRisk['likelihood']>([
  'likely',
  'possible',
  'edge-case',
  'unknown',
])
const VALID_CONFIDENCES = new Set<ReviewFindingRisk['confidence']>(['high', 'medium', 'low'])
const VALID_ACTIONS = new Set<ReviewFindingRisk['action']>([
  'must-fix',
  'should-fix',
  'consider',
  'optional',
])
const VALID_DOMAINS = new Set<ReviewFocus>([
  'security',
  'bugs',
  'performance',
  'code-smells',
  'style',
  'architecture',
  'ux',
])

function normalizeSeverity(raw: unknown): ReviewFindingSeverity | null {
  const value = String(raw ?? '')
    .toLowerCase()
    .trim()
  return VALID_SEVERITIES.has(value as ReviewFindingSeverity)
    ? (value as ReviewFindingSeverity)
    : null
}

function normalizeRisk(raw: unknown): ReviewFindingRisk | null {
  if (!raw || typeof raw !== 'object') return null
  const risk = raw as Record<string, unknown>
  const impact = String(risk.impact ?? '')
    .toLowerCase()
    .trim()
  const likelihood = String(risk.likelihood ?? '')
    .toLowerCase()
    .trim()
  const confidence = String(risk.confidence ?? '')
    .toLowerCase()
    .trim()
  const action = String(risk.action ?? '')
    .toLowerCase()
    .trim()
  if (!VALID_IMPACTS.has(impact as ReviewFindingRisk['impact'])) return null
  if (!VALID_LIKELIHOODS.has(likelihood as ReviewFindingRisk['likelihood'])) return null
  if (!VALID_CONFIDENCES.has(confidence as ReviewFindingRisk['confidence'])) return null
  if (!VALID_ACTIONS.has(action as ReviewFindingRisk['action'])) return null
  return {
    impact: impact as ReviewFindingRisk['impact'],
    likelihood: likelihood as ReviewFindingRisk['likelihood'],
    confidence: confidence as ReviewFindingRisk['confidence'],
    action: action as ReviewFindingRisk['action'],
  }
}

function normalizeSuggestion(raw: unknown): ReviewFindingSuggestion | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const suggestion = raw as Record<string, unknown>
  const body = typeof suggestion.body === 'string' ? suggestion.body.trim() : ''
  const startLine = Number(suggestion.startLine)
  const endLine = Number(suggestion.endLine)
  if (!body || !Number.isFinite(startLine) || !Number.isFinite(endLine)) return undefined
  const start = Math.max(1, Math.trunc(startLine))
  return {
    body,
    startLine: start,
    endLine: Math.max(start, Math.trunc(endLine)),
  }
}

function normalizeDomain(raw: unknown): ReviewFocus | null {
  const value = String(raw ?? '').trim()
  return VALID_DOMAINS.has(value as ReviewFocus) ? (value as ReviewFocus) : null
}

function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  const lines = diff.split('\n')
  let file = ''
  let oldPath: string | null = null
  let current: { start: number; nextLine: number; lines: string[] } | null = null

  function flush(): void {
    if (!current || !file) return
    hunks.push({
      file,
      oldPath,
      start: current.start,
      end: Math.max(current.start, current.nextLine - 1),
      text: current.lines.join('\n'),
    })
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush()
      current = null
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      oldPath = match?.[1] ?? null
      file = match?.[2] ?? ''
      continue
    }

    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length)
      continue
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hunkMatch) {
      flush()
      const start = Number(hunkMatch[1])
      current = { start, nextLine: start, lines: [line] }
      continue
    }

    if (!current) continue
    current.lines.push(line)
    if (line.startsWith('-') && !line.startsWith('---')) continue
    current.nextLine += 1
  }

  flush()
  return hunks
}

export function buildPeerReviewDiffExcerpt(diff: string, findings: ReviewFinding[]): string {
  const hunks = parseDiffHunks(diff)
  if (hunks.length === 0 || findings.length === 0) return '(no matching diff hunks)'

  const selected = new Map<string, DiffHunk>()
  for (const finding of findings) {
    const match =
      finding.line == null
        ? hunks.find((hunk) => hunk.file === finding.file || hunk.oldPath === finding.file)
        : hunks.find(
            (hunk) =>
              (hunk.file === finding.file || hunk.oldPath === finding.file) &&
              finding.line != null &&
              hunk.start <= finding.line &&
              hunk.end >= finding.line,
          )
    if (!match) continue
    selected.set(`${match.file}:${match.start}:${match.end}`, match)
  }

  if (selected.size === 0) return '(no matching diff hunks)'

  return Array.from(selected.values())
    .map((hunk) => `### ${hunk.file}:${hunk.start}-${hunk.end}\n\`\`\`diff\n${hunk.text}\n\`\`\``)
    .join('\n\n')
}

export function buildPeerReviewPrompt(input: PeerReviewPromptInput): {
  systemPrompt: string
  userPrompt: string
} {
  const compactFindings = input.findings.map((finding) => ({
    id: finding.id,
    file: finding.file,
    line: finding.line,
    severity: finding.severity,
    risk: finding.risk,
    domain: finding.domain,
    title: finding.title,
    description: finding.description,
    suggestion: finding.suggestion,
  }))
  const diffExcerpt = buildPeerReviewDiffExcerpt(input.detail.diff, input.findings)

  const systemPrompt = `You are the second-opinion reviewer for a PR review. ${input.primaryProvider} produced the findings; ${input.peerProvider} is auditing that review.

Do not run a broad PR review. Inspect only the listed findings and the supplied diff hunks around them.
Return no changes unless a finding has a material issue or a directly adjacent issue is clearly visible while validating it.
Do not rewrite for tone, preference, or completeness. Do not emit confirmations.
Use "update" only when an existing finding is materially wrong, under/overstates risk, has a wrong anchor, or is missing a crucial correction.
Use "add" only for a clear, actionable issue visible in the provided hunks that is absent from the current findings.
Do not drop findings in this pass. If nothing needs changing, return an empty array.`

  const userPrompt = `Review this review, not the full PR.

## PR
- Title: ${input.detail.title}
- Author: ${input.detail.author}
- Branch: ${input.detail.headBranch} -> ${input.detail.baseBranch}
- Files changed: ${input.detail.files.length}

## Current Findings
\`\`\`json
${JSON.stringify(compactFindings, null, 2)}
\`\`\`

## Diff Hunks For Those Findings
${diffExcerpt}

## Output Format
Output a JSON array inside a fenced code block tagged \`review-peer-review\`.

Allowed entries:
- Update an existing finding:
  { "type": "update", "id": "<existing finding id>", "reason": "material reason", "fields": { "severity": "medium", "risk": { "impact": "medium", "likelihood": "possible", "confidence": "high", "action": "consider" }, "line": 42, "title": "...", "description": "...", "suggestion": null } }
- Add a missing adjacent issue:
  { "type": "add", "reason": "why the original review missed a real issue", "finding": { "file": "src/app.ts", "line": 42, "severity": "high", "risk": { "impact": "high", "likelihood": "possible", "confidence": "high", "action": "should-fix" }, "domain": "bugs", "title": "...", "description": "Observation: ...\\n\\nWhy it matters: ...\\n\\nSuggested direction: ..." } }

Rules:
- Output [] when the existing review is acceptable.
- Do not include unchanged findings.
- Do not add issues outside the supplied hunks.
- Do not use "add" to express a general opinion about review quality.

\`\`\`review-peer-review
[]
\`\`\``

  return { systemPrompt, userPrompt }
}

function parsePeerReviewBlock(text: string): unknown[] {
  const fenceRegex = /`{3,}review-peer-review\s*\n([\s\S]*?)`{3,}/g
  let block: string | null = null
  let match = fenceRegex.exec(text)
  while (match !== null) {
    block = match[1].trim()
    match = fenceRegex.exec(text)
  }
  if (!block) {
    const bare = text.match(/\[\s*[\s\S]*\]/)
    if (bare) block = bare[0]
  }
  if (!block) return []
  try {
    const parsed = JSON.parse(block)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parsePeerReviewChanges(
  text: string,
  existingFindingIds: Set<string>,
): PeerReviewChange[] {
  const rows = parsePeerReviewBlock(text)
  const changes: PeerReviewChange[] = []

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const type = row.type
    const reason = typeof row.reason === 'string' ? row.reason.trim() : ''
    if (!reason) continue

    if (type === 'update') {
      const id = typeof row.id === 'string' ? row.id : ''
      if (!existingFindingIds.has(id)) continue
      const rawFields =
        row.fields && typeof row.fields === 'object' ? (row.fields as Record<string, unknown>) : {}
      const fields: PeerReviewUpdate['fields'] = {}
      if (typeof rawFields.file === 'string' && rawFields.file.trim()) {
        fields.file = rawFields.file.trim()
      }
      if (rawFields.line === null) fields.line = null
      else if (rawFields.line !== undefined && Number.isFinite(Number(rawFields.line))) {
        fields.line = Math.max(1, Math.trunc(Number(rawFields.line)))
      }
      const severity = normalizeSeverity(rawFields.severity)
      if (severity) fields.severity = severity
      const risk = normalizeRisk(rawFields.risk)
      if (risk) fields.risk = risk
      if (typeof rawFields.title === 'string' && rawFields.title.trim()) {
        fields.title = rawFields.title.trim()
      }
      if (typeof rawFields.description === 'string' && rawFields.description.trim()) {
        fields.description = rawFields.description.trim()
      }
      if (rawFields.suggestion === null) {
        fields.suggestion = null
      } else {
        const suggestion = normalizeSuggestion(rawFields.suggestion)
        if (suggestion) fields.suggestion = suggestion
      }
      if (Object.keys(fields).length === 0) continue
      changes.push({ type: 'update', id, reason, fields })
      continue
    }

    if (type === 'add') {
      const rawFinding =
        row.finding && typeof row.finding === 'object'
          ? (row.finding as Record<string, unknown>)
          : row
      const file = typeof rawFinding.file === 'string' ? rawFinding.file.trim() : ''
      const title = typeof rawFinding.title === 'string' ? rawFinding.title.trim() : ''
      const description =
        typeof rawFinding.description === 'string' ? rawFinding.description.trim() : ''
      const severity = normalizeSeverity(rawFinding.severity)
      const risk = normalizeRisk(rawFinding.risk)
      if (!file || !title || !description || !severity || !risk) continue
      const line =
        rawFinding.line === null || rawFinding.line === undefined
          ? null
          : Number.isFinite(Number(rawFinding.line))
            ? Math.max(1, Math.trunc(Number(rawFinding.line)))
            : null
      const suggestion = normalizeSuggestion(rawFinding.suggestion)
      changes.push({
        type: 'add',
        reason,
        finding: {
          file,
          line,
          severity,
          risk,
          title,
          description,
          domain: normalizeDomain(rawFinding.domain),
          ...(suggestion ? { suggestion } : {}),
        },
      })
    }
  }

  return changes
}

export function applyPeerReviewChanges(
  findings: ReviewFinding[],
  changes: PeerReviewChange[],
): ReviewFinding[] {
  if (changes.length === 0) return findings
  const byId = new Map(findings.map((finding) => [finding.id, finding]))
  const updated = findings.map((finding) => {
    const patches = changes.filter((change): change is PeerReviewUpdate => {
      return change.type === 'update' && change.id === finding.id
    })
    if (patches.length === 0) return finding

    const next: ReviewFinding = {
      ...finding,
      risk: { ...finding.risk },
      mergedFrom: finding.mergedFrom ? [...finding.mergedFrom] : undefined,
    }
    for (const patch of patches) {
      const { fields } = patch
      if (fields.file !== undefined) next.file = fields.file
      if (fields.line !== undefined) next.line = fields.line
      if (fields.severity !== undefined) next.severity = fields.severity
      if (fields.risk) next.risk = { ...next.risk, ...fields.risk }
      if (fields.title !== undefined) next.title = fields.title
      if (fields.description !== undefined) next.description = fields.description
      if (fields.suggestion === null) delete next.suggestion
      else if (fields.suggestion) next.suggestion = fields.suggestion
      next.mergedFrom = [...(next.mergedFrom ?? []), { domain: 'peer-review', title: patch.reason }]
    }
    return next
  })

  const additions = changes
    .filter((change): change is PeerReviewAddition => change.type === 'add')
    .filter((change) => {
      return !Array.from(byId.values()).some(
        (finding) =>
          finding.file === change.finding.file &&
          finding.line === change.finding.line &&
          finding.title.toLowerCase().trim() === change.finding.title.toLowerCase().trim(),
      )
    })
    .map(
      (change): ReviewFinding => ({
        id: randomUUID(),
        file: change.finding.file,
        line: change.finding.line,
        severity: change.finding.severity,
        risk: change.finding.risk,
        title: change.finding.title,
        description: change.finding.description,
        domain: change.finding.domain ?? null,
        posted: false,
        postUrl: null,
        threadId: null,
        statusInRun: 'new',
        carriedForward: false,
        sourceReviewId: null,
        suggestion: change.finding.suggestion,
        mergedFrom: [{ domain: 'peer-review', title: change.reason }],
      }),
    )

  return [...updated, ...additions]
}
