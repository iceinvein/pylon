import { useEffect, useMemo, useRef } from 'react'
import type { ExplorationAgentMessage, TestExploration } from '../../../../shared/types'
import { type ActivityEntry, formatActivityEntry } from '../../lib/activity-format'
import { getAgentColor } from './AgentTileStrip'

type ActivityFeedProps = {
  explorations: TestExploration[]
  agentMessages: Record<string, ExplorationAgentMessage[]>
  agentFilter: string | null
  isRunning: boolean
}

type FeedEntry = ActivityEntry & {
  explorationId: string
  agentIndex: number
}

export function ActivityFeed({
  explorations,
  agentMessages,
  agentFilter,
  isRunning,
}: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  const feedEntries = useMemo(() => {
    const entries: FeedEntry[] = []
    const filteredExplorations = agentFilter
      ? explorations.filter((e) => e.id === agentFilter)
      : explorations

    for (const exp of filteredExplorations) {
      const agentIndex = explorations.indexOf(exp)
      const msgs = agentMessages[exp.id] ?? []
      for (const msg of msgs) {
        const entry = formatActivityEntry(msg)
        if (entry) {
          entries.push({ ...entry, explorationId: exp.id, agentIndex })
        }
      }
    }

    return entries
  }, [explorations, agentMessages, agentFilter])

  const entryCount = feedEntries.length
  useEffect(() => {
    if (entryCount > 0 && isRunning && !userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [entryCount, isRunning])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    userScrolledUp.current = !isAtBottom
  }

  const actionCount = feedEntries.length
  const filterLabel = agentFilter
    ? explorations.find((e) => e.id === agentFilter)?.goal.slice(0, 25)
    : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-base-border-subtle border-b px-3 py-2">
        <span className="font-semibold text-[11px] text-base-text-secondary uppercase tracking-wider">
          Activity
        </span>
        <span className="text-[11px] text-base-text-faint">
          {actionCount} action{actionCount !== 1 ? 's' : ''}
        </span>
        {filterLabel && (
          <span className="truncate rounded bg-base-border/60 px-1.5 py-0.5 text-[10px] text-base-text-muted">
            Filtered: {filterLabel}…
          </span>
        )}
      </div>
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-2">
        {feedEntries.length === 0 && (
          <p className="py-8 text-center text-base-text-faint text-xs">
            {isRunning ? 'Waiting for agent activity…' : 'No activity recorded'}
          </p>
        )}
        <div className="space-y-0.5">
          {feedEntries.map((entry, i) => (
            <div
              key={`${entry.id}-${i}`}
              className={`flex items-center gap-2 rounded px-1.5 py-0.5 text-xs ${
                entry.highlight === 'finding'
                  ? 'bg-yellow-500/10'
                  : entry.highlight === 'test'
                    ? 'bg-success-muted/30'
                    : ''
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: getAgentColor(entry.agentIndex) }}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  entry.highlight ? 'text-base-text' : 'text-base-text-secondary'
                }`}
              >
                {entry.summary}
              </span>
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
