import type { ReviewFinding } from '../../../shared/types'

const SEVERITY_WEIGHT: Record<ReviewFinding['severity'], number> = {
  blocker: 100,
  high: 85,
  medium: 55,
  low: 20,
}

const ACTION_WEIGHT: Record<ReviewFinding['risk']['action'], number> = {
  'must-fix': 25,
  'should-fix': 15,
  consider: 0,
  optional: -20,
}

const CONFIDENCE_WEIGHT: Record<ReviewFinding['risk']['confidence'], number> = {
  high: 15,
  medium: 0,
  low: -25,
}

const IMPACT_WEIGHT: Record<ReviewFinding['risk']['impact'], number> = {
  critical: 15,
  high: 10,
  medium: 0,
  low: -10,
}

const LIKELIHOOD_WEIGHT: Record<ReviewFinding['risk']['likelihood'], number> = {
  likely: 10,
  possible: 0,
  'edge-case': -12,
  unknown: -18,
}

const UNCERTAINTY_RE = /needs verification|cannot verify|worth validating|not clear from/i
const LOW_VALUE_RE = /harmless|negligible|microseconds?|no action needed|tiny cleanup/i
const PRE_EXISTING_RE = /pre-existing|didn't introduce|not introduced by this PR/i

export type ReviewFindingPresentation = {
  finding: ReviewFinding
  score: number
  tier: 'actionable' | 'suggestion'
  signals: string[]
}

export type ReviewFindingPresentationGroups = {
  actionable: ReviewFindingPresentation[]
  suggestions: ReviewFindingPresentation[]
}

function hasConcreteAction(finding: ReviewFinding): boolean {
  return finding.risk.action === 'must-fix' || finding.risk.action === 'should-fix'
}

function isHighSignalSeverity(finding: ReviewFinding): boolean {
  return finding.severity === 'blocker' || finding.severity === 'high'
}

function anchorKey(finding: ReviewFinding): string | null {
  if (!finding.file || finding.line == null) return null
  return `${finding.file}:${finding.line}`
}

export function reviewFindingQualityScore(finding: ReviewFinding): number {
  let score =
    SEVERITY_WEIGHT[finding.severity] +
    ACTION_WEIGHT[finding.risk.action] +
    CONFIDENCE_WEIGHT[finding.risk.confidence] +
    IMPACT_WEIGHT[finding.risk.impact] +
    LIKELIHOOD_WEIGHT[finding.risk.likelihood]

  if (finding.line != null) score += 8
  if (finding.suggestion) score += 6
  if (finding.mergedFrom && finding.mergedFrom.length > 0) score += 5
  if (UNCERTAINTY_RE.test(finding.description)) score -= 25
  if (LOW_VALUE_RE.test(finding.description)) score -= 35
  if (PRE_EXISTING_RE.test(finding.description)) score -= 35
  if (finding.risk.confidence === 'low') score -= 10
  if (finding.carriedForward) score -= 8
  if (finding.posted) score -= 12

  return score
}

export function findingPresentationSignals(finding: ReviewFinding): string[] {
  const signals: string[] = []
  if (hasConcreteAction(finding)) signals.push(finding.risk.action)
  if (finding.risk.confidence === 'high') signals.push('high confidence')
  if (finding.line != null) signals.push('anchored')
  if (UNCERTAINTY_RE.test(finding.description)) signals.push('needs verification')
  if (LOW_VALUE_RE.test(finding.description)) signals.push('low signal')
  if (PRE_EXISTING_RE.test(finding.description)) signals.push('pre-existing')
  return signals
}

export function shouldShowFindingByDefault(finding: ReviewFinding): boolean {
  if (finding.statusInRun === 'resolved' || finding.statusInRun === 'stale') return false
  if (finding.risk.confidence === 'low') return false
  if (finding.risk.action === 'optional') return false
  if (LOW_VALUE_RE.test(finding.description) || PRE_EXISTING_RE.test(finding.description)) {
    return false
  }
  if (UNCERTAINTY_RE.test(finding.description) && !hasConcreteAction(finding)) return false

  return isHighSignalSeverity(finding) || hasConcreteAction(finding)
}

export function splitFindingsForReview(findings: ReviewFinding[]): ReviewFindingPresentationGroups {
  const ranked = findings
    .map((finding) => ({
      finding,
      score: reviewFindingQualityScore(finding),
      signals: findingPresentationSignals(finding),
      tier: 'suggestion' as const,
    }))
    .sort((a, b) => {
      if (a.finding.posted !== b.finding.posted) return a.finding.posted ? 1 : -1
      if (b.score !== a.score) return b.score - a.score
      return (
        a.finding.file.localeCompare(b.finding.file) ||
        a.finding.title.localeCompare(b.finding.title)
      )
    })

  const seenAnchors = new Set<string>()
  const actionable: ReviewFindingPresentation[] = []
  const suggestions: ReviewFindingPresentation[] = []

  for (const entry of ranked) {
    const key = anchorKey(entry.finding)
    const duplicateAnchor = key ? seenAnchors.has(key) : false
    if (shouldShowFindingByDefault(entry.finding) && !duplicateAnchor) {
      actionable.push({ ...entry, tier: 'actionable' })
      if (key) seenAnchors.add(key)
    } else {
      suggestions.push(entry)
    }
  }

  return { actionable, suggestions }
}

export function defaultVisibleFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return splitFindingsForReview(findings).actionable.map((entry) => entry.finding)
}
