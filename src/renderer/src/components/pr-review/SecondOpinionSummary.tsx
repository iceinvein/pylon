import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { PeerReviewSummaryItem } from '../../../../shared/types'

type Details = {
  updates: number
  additions: number
  items: PeerReviewSummaryItem[]
}

type Summary = {
  message: string
  details?: Details
}

type Props = {
  summary: Summary
  onJumpToFinding: (findingId: string) => void
}

const PROVIDER_LABEL: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
}

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`
}

export function buildSummaryHeader(details: Details, providerLabel: string): string {
  const parts: string[] = []
  if (details.updates > 0) {
    parts.push(`updated ${pluralise(details.updates, 'finding', 'findings')}`)
  }
  if (details.additions > 0) {
    parts.push(`added ${pluralise(details.additions, 'new finding', 'new findings')}`)
  }
  const trailing = parts.length > 0 ? ` - ${parts.join(', ')}` : ''
  return `${providerLabel} second opinion${trailing}`
}

export function groupSummaryItems(items: PeerReviewSummaryItem[]): {
  updates: PeerReviewSummaryItem[]
  additions: PeerReviewSummaryItem[]
} {
  const updates: PeerReviewSummaryItem[] = []
  const additions: PeerReviewSummaryItem[] = []
  for (const item of items) {
    if (item.kind === 'update') updates.push(item)
    else additions.push(item)
  }
  return { updates, additions }
}

export function deriveProviderLabel(message: string): string {
  for (const [key, label] of Object.entries(PROVIDER_LABEL)) {
    if (message.toLowerCase().includes(key)) return label
  }
  return 'Second opinion'
}

export function SecondOpinionSummary({ summary, onJumpToFinding }: Props) {
  const [expanded, setExpanded] = useState(false)
  const details = summary.details

  if (!details || details.items.length === 0) {
    return (
      <div className="border-base-border-subtle border-t px-3 py-2 text-[11px] text-base-text-secondary">
        {summary.message}
      </div>
    )
  }

  const providerLabel = deriveProviderLabel(summary.message)
  const header = buildSummaryHeader(details, providerLabel)
  const { updates, additions } = groupSummaryItems(details.items)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className="border-base-border-subtle border-t text-[11px] text-base-text-secondary">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        title={summary.message}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-base-raised"
      >
        <Chevron size={12} className="shrink-0 text-base-text-faint" />
        <span className="truncate">{header}</span>
      </button>
      {expanded && (
        <div className="space-y-3 border-base-border-subtle border-t px-3 py-2">
          {updates.length > 0 && (
            <section className="space-y-1">
              <p className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                Updated
              </p>
              <ul className="space-y-1">
                {updates.map((item) => (
                  <li key={`u-${item.findingId}`}>
                    <button
                      type="button"
                      onClick={() => onJumpToFinding(item.findingId)}
                      className="block w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-base-raised"
                    >
                      <span className="block font-medium text-base-text text-xs">
                        {item.findingTitle}
                      </span>
                      <span className="block text-[11px] text-base-text-secondary leading-relaxed">
                        {item.reason}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {additions.length > 0 && (
            <section className="space-y-1">
              <p className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                Added
              </p>
              <ul className="space-y-1">
                {additions.map((item) => (
                  <li key={`a-${item.findingId}`}>
                    <button
                      type="button"
                      onClick={() => onJumpToFinding(item.findingId)}
                      className="block w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-base-raised"
                    >
                      <span className="block font-medium text-base-text text-xs">
                        {item.findingTitle}
                      </span>
                      <span className="block text-[11px] text-base-text-secondary leading-relaxed">
                        {item.reason}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
