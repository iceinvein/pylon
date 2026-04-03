import { useMemo } from 'react'
import type { ExplorationAgentMessage, TestExploration } from '../../../../shared/types'
import { formatActivityEntry } from '../../lib/activity-format'
import { AgentTile } from './AgentTile'

const AGENT_COLORS = [
  '#4ecca3', // teal
  '#d4845a', // terracotta
  '#c4a35a', // gold
  '#7b93db', // periwinkle
  '#c77dba', // mauve
]

export function getAgentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

type AgentTileStripProps = {
  explorations: TestExploration[]
  agentMessages: Record<string, ExplorationAgentMessage[]>
  agentFilter: string | null
  onToggleFilter: (id: string) => void
  onStop: (id: string) => void
}

export function AgentTileStrip({
  explorations,
  agentMessages,
  agentFilter,
  onToggleFilter,
  onStop,
}: AgentTileStripProps) {
  const latestActions = useMemo(() => {
    const map: Record<string, ReturnType<typeof formatActivityEntry>> = {}
    for (const exp of explorations) {
      const msgs = agentMessages[exp.id] ?? []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const entry = formatActivityEntry(msgs[i])
        if (entry) {
          map[exp.id] = entry
          break
        }
      }
    }
    return map
  }, [explorations, agentMessages])

  if (explorations.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto border-base-border-subtle border-b px-4 py-2">
      {explorations.map((exp, i) => (
        <AgentTile
          key={exp.id}
          explorationId={exp.id}
          goal={exp.goal}
          status={exp.status}
          findingsCount={exp.findingsCount}
          latestAction={latestActions[exp.id] ?? null}
          color={getAgentColor(i)}
          isFiltered={agentFilter === exp.id}
          onToggleFilter={onToggleFilter}
          onStop={onStop}
        />
      ))}
    </div>
  )
}
