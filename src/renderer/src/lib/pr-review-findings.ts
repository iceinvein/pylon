import type { ReviewFinding, ReviewFindingStatusInRun } from '../../../shared/types'

export const REVIEW_FINDING_STATUS_LABELS: Record<ReviewFindingStatusInRun, string> = {
  new: 'New',
  persisting: 'Persisting',
  resolved: 'Resolved',
  stale: 'Stale',
  needs_revalidation: 'Needs Revalidation',
}

export const REVIEW_FINDING_STATUS_STYLES: Record<ReviewFindingStatusInRun, string> = {
  new: 'bg-warning/15 text-warning',
  persisting: 'bg-[var(--color-risk-high)]/15 text-[var(--color-risk-high)]',
  resolved: 'bg-success/15 text-success',
  stale: 'bg-base-border text-base-text-muted',
  needs_revalidation: 'bg-info/15 text-info',
}

export function isPostableFinding(finding: ReviewFinding): boolean {
  return (
    !finding.posted && !finding.postUrl && !finding.carriedForward && finding.statusInRun === 'new'
  )
}

export function isVisibleLatestRunFinding(finding: ReviewFinding): boolean {
  return finding.statusInRun !== 'resolved' && finding.statusInRun !== 'stale'
}
