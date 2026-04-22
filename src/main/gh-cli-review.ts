import { createHash } from 'node:crypto'
import type { ReviewFinding, ReviewFocus } from '../shared/types'

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

export function buildInlineCommentBody(finding: ReviewFinding): string {
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
