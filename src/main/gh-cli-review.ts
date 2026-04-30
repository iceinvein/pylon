import { createHash } from 'node:crypto'
import { formatReviewFindingDescriptionMarkdown } from '../shared/review-finding-description'
import type { ReviewFinding, ReviewFocus } from '../shared/types'

const SEVERITY_RANK: Record<ReviewFinding['severity'], number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const SEVERITY_ICON: Record<ReviewFinding['severity'], string> = {
  blocker: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
}

const SEVERITY_LABEL: Record<ReviewFinding['severity'], string> = {
  blocker: 'Blocker',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const FOCUS_LABEL: Record<ReviewFocus, string> = {
  security: 'Security',
  bugs: 'Bugs',
  performance: 'Performance',
  'code-smells': 'Code Smells',
  style: 'Style',
  architecture: 'Architecture',
  ux: 'UX',
}

type ReviewComment = {
  path: string
  line: number
  side: 'RIGHT'
  start_line?: number
  start_side?: 'RIGHT'
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

function formatRiskParts(finding: ReviewFinding): string[] {
  return [
    `Impact · ${finding.risk.impact}`,
    `Likelihood · ${finding.risk.likelihood}`,
    `Confidence · ${finding.risk.confidence}`,
  ]
}

function buildMetaLine(parts: Array<string | false | null | undefined>): string | null {
  const filtered = parts.filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  )
  if (filtered.length === 0) return null
  return `<sub>${filtered.join(' · ')}</sub>`
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
    blocker: 0,
    high: 0,
    medium: 0,
    low: 0,
  }
  for (const f of findings) counts[f.severity]++

  const fileCount = new Set(inlineFindings.map((f) => f.file)).size
  const shortSha = commitId ? commitId.slice(0, 7) : ''

  let verdict: string
  if (counts.blocker > 0) {
    verdict = `⚠️ **${plural(counts.blocker, 'blocking issue')}**`
  } else if (counts.high > 0) {
    verdict = `⚠️ **${plural(counts.high, 'high-risk item')} to review**`
  } else if (findings.length > 0) {
    verdict = `💡 **${plural(findings.length, 'finding')}**`
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
    .filter((f) => f.severity === 'blocker' || f.severity === 'high')
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
      `<summary><b>Risk breakdown</b> (${plural(findings.length, 'finding')})</summary>`,
      '',
      '| Severity | Count |',
      '|---|---|',
    )
    for (const sev of ['blocker', 'high', 'medium', 'low'] as const) {
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
      const focus = formatFocus(f)
      const metaLine = buildMetaLine([...formatRiskParts(f), focus ? `Focus · ${focus}` : null])
      const mergedFrom = buildMergedFromLine(f)
      lines.push(
        `#### ${SEVERITY_ICON[f.severity]} ${SEVERITY_LABEL[f.severity]}: ${f.title}`,
        ...(metaLine ? [metaLine] : []),
        '',
        formatReviewFindingDescriptionMarkdown(f.description),
        ...(mergedFrom ? ['', mergedFrom] : []),
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
      const focus = formatFocus(f)
      const metaLine = buildMetaLine([...formatRiskParts(f), focus ? `Focus · ${focus}` : null])
      const mergedFrom = buildMergedFromLine(f)
      lines.push(
        `#### ${SEVERITY_ICON[f.severity]} ${SEVERITY_LABEL[f.severity]}: ${f.title}${loc ? ` ${loc}` : ''}`,
        ...(metaLine ? [metaLine] : []),
        '',
        formatReviewFindingDescriptionMarkdown(f.description),
        ...(mergedFrom ? ['', mergedFrom] : []),
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
    risk: finding.risk,
    title: finding.title.trim(),
    description: finding.description.trim(),
    suggestion: finding.suggestion ?? null,
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

function buildMergedFromLine(finding: ReviewFinding): string | null {
  if (!finding.mergedFrom || finding.mergedFrom.length === 0) return null
  return `<sub>Also flagged by · ${finding.mergedFrom.map((entry) => entry.domain).join(', ')}</sub>`
}

function buildSuggestionBlock(finding: ReviewFinding): string | null {
  const body = finding.suggestion?.body.trim()
  if (!body) return null
  return ['```suggestion', body, '```'].join('\n')
}

export function buildInlineCommentBody(
  finding: ReviewFinding,
  options: { includeSuggestion?: boolean } = {},
): string {
  const icon = SEVERITY_ICON[finding.severity]
  const label = SEVERITY_LABEL[finding.severity]
  const focus = formatFocus(finding)
  const metaLine = buildMetaLine([...formatRiskParts(finding), focus ? `Focus · ${focus}` : null])
  const mergedFrom = buildMergedFromLine(finding)
  const suggestion = options.includeSuggestion ? buildSuggestionBlock(finding) : null
  return [
    `### ${icon} ${label}: ${finding.title}`,
    metaLine ? '' : null,
    metaLine,
    '',
    formatReviewFindingDescriptionMarkdown(finding.description),
    suggestion ? '' : null,
    suggestion,
    mergedFrom ? '' : null,
    mergedFrom,
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
  const mergedFrom = buildMergedFromLine(finding)
  const suggestion = buildSuggestionBlock(finding)
  const metaLine = buildMetaLine([
    location ? `Location · ${location}` : null,
    focus ? `Focus · ${focus}` : null,
    ...formatRiskParts(finding),
  ])

  return [
    '## Pylon Finding',
    '',
    `### ${icon} ${label}: ${finding.title}`,
    metaLine ? '' : null,
    metaLine,
    '',
    formatReviewFindingDescriptionMarkdown(finding.description),
    suggestion ? '' : null,
    suggestion,
    mergedFrom ? '' : null,
    mergedFrom,
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

function getSuggestionRange(
  finding: ReviewFinding,
  reviewableLines: Map<string, Set<number>>,
): { line: number; startLine?: number; supportsSuggestion: boolean } | null {
  if (!finding.file || finding.line === null) return null

  const fileLines = reviewableLines.get(finding.file)
  if (!fileLines?.has(finding.line)) return null

  const suggestion = finding.suggestion
  if (!suggestion) {
    return { line: finding.line, supportsSuggestion: false }
  }

  const startLine = suggestion.startLine
  const endLine = suggestion.endLine
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine > endLine) {
    return { line: finding.line, supportsSuggestion: false }
  }
  for (let line = startLine; line <= endLine; line++) {
    if (!fileLines.has(line)) {
      return { line: finding.line, supportsSuggestion: false }
    }
  }
  return endLine > startLine
    ? { line: endLine, startLine, supportsSuggestion: true }
    : { line: endLine, supportsSuggestion: true }
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
    const range = getSuggestionRange(finding, reviewableLines)
    if (!range) {
      summaryFindings.push(finding)
      continue
    }
    inlineFindings.push(finding)
  }

  return {
    body: buildReviewBody(findings, commitId, { inlineFindings, summaryFindings }),
    comments: inlineFindings.map((f) => {
      const range = getSuggestionRange(f, reviewableLines)
      return {
        path: f.file,
        line: range?.line ?? (f.line as number),
        side: 'RIGHT' as const,
        ...(range?.startLine ? { start_line: range.startLine, start_side: 'RIGHT' as const } : {}),
        body: buildInlineCommentBody(f, { includeSuggestion: Boolean(range?.supportsSuggestion) }),
      }
    }),
    inlineFindings,
    summaryFindings,
  }
}
