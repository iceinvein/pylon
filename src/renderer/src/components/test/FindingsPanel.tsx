import { Bug } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import type { FindingSeverity, TestExploration, TestFinding } from '../../../../shared/types'
import { useTestStore } from '../../store/test-store'
import { getAgentColor } from './AgentTileStrip'
import { FindingCard } from './FindingCard'

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

const SEVERITY_PILL_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-[var(--color-error)]/20 text-[var(--color-error)] border-[var(--color-error)]/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-[var(--color-info)]/20 text-[var(--color-info)] border-[var(--color-info)]/30',
  info: 'bg-[var(--color-base-text-muted)]/20 text-[var(--color-base-text-secondary)] border-[var(--color-base-text-muted)]/30',
}

type FindingsPanelProps = {
  explorations: TestExploration[]
  findingsByExploration: Record<string, TestFinding[]>
  testsByExploration: Record<string, string[]>
  agentFilter: string | null
  cwd: string
}

export function FindingsPanel({
  explorations,
  findingsByExploration,
  testsByExploration,
  agentFilter,
  cwd,
}: FindingsPanelProps) {
  const severityFilter = useTestStore((s) => s.severityFilter)
  const setSeverityFilter = useTestStore((s) => s.setSeverityFilter)
  const clearSeverityFilter = useTestStore((s) => s.clearSeverityFilter)

  const allFindings = useMemo(() => {
    const result: Array<{
      finding: TestFinding
      agentIndex: number
      goalText: string
      agentColor: string
      testPaths: string[]
    }> = []

    const filteredExplorations = agentFilter
      ? explorations.filter((e) => e.id === agentFilter)
      : explorations

    for (const exp of filteredExplorations) {
      const agentIndex = explorations.indexOf(exp)
      const findings = findingsByExploration[exp.id] ?? []
      const tests = testsByExploration[exp.id] ?? []
      const goalText = exp.goal.length > 40 ? `${exp.goal.slice(0, 40)}…` : exp.goal

      for (const f of findings) {
        result.push({
          finding: f,
          agentIndex,
          goalText,
          agentColor: getAgentColor(agentIndex),
          testPaths: tests,
        })
      }
    }

    return result
  }, [explorations, findingsByExploration, testsByExploration, agentFilter])

  const filteredFindings = useMemo(() => {
    if (!severityFilter) return allFindings
    return allFindings.filter((f) => severityFilter.includes(f.finding.severity))
  }, [allFindings, severityFilter])

  const counts = useMemo(() => {
    const c: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const f of allFindings) {
      c[f.finding.severity]++
    }
    return c
  }, [allFindings])

  const totalCount = allFindings.length

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-base-border-subtle border-b px-3 py-2">
        <button
          type="button"
          onClick={clearSeverityFilter}
          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
            !severityFilter
              ? 'border-base-border bg-base-border/50 text-base-text'
              : 'border-base-border-subtle text-base-text-muted hover:text-base-text'
          }`}
        >
          All ({totalCount})
        </button>
        {SEVERITIES.map((sev) => {
          if (counts[sev] === 0) return null
          const isActive = severityFilter?.includes(sev) ?? false
          return (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-full border px-2 py-0.5 text-xs capitalize transition-colors ${
                isActive
                  ? SEVERITY_PILL_COLORS[sev]
                  : 'border-base-border-subtle text-base-text-muted hover:text-base-text'
              }`}
            >
              {sev} ({counts[sev]})
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filteredFindings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bug className="mb-2 h-8 w-8 text-base-text-faint" />
            <p className="text-base-text-muted text-xs">
              {totalCount === 0
                ? 'No findings yet — agents are exploring'
                : 'No findings match the current filter'}
            </p>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {filteredFindings.map(({ finding, agentColor, goalText, testPaths }) => (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <FindingCard
                  finding={finding}
                  agentColor={agentColor}
                  goalText={goalText}
                  linkedTestPath={testPaths[0] ?? null}
                  cwd={cwd}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>
    </div>
  )
}
