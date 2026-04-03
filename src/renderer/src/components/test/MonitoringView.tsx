import { useMemo } from 'react'
import { usePersistedWidth } from '../../hooks/use-persisted-width'
import { useTestStore } from '../../store/test-store'
import { ActivityFeed } from './ActivityFeed'
import { AgentTileStrip } from './AgentTileStrip'
import { ConfigBar } from './ConfigBar'
import { FindingsPanel } from './FindingsPanel'

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

export function MonitoringView() {
  const { width: splitWidth, onDragStart } = usePersistedWidth({
    key: 'test-monitor-split',
    defaultWidth: 400,
    min: 250,
    max: 700,
    direction: 'right',
  })

  const selectedProject = useTestStore((s) => s.selectedProject)
  const lastBatchId = useTestStore((s) => s.lastBatchId)
  const explorations = useTestStore((s) => s.explorations)
  const agentMessagesByExploration = useTestStore((s) => s.agentMessagesByExploration)
  const findingsByExploration = useTestStore((s) => s.findingsByExploration)
  const testsByExploration = useTestStore((s) => s.testsByExploration)
  const agentFilter = useTestStore((s) => s.agentFilter)
  const setAgentFilter = useTestStore((s) => s.setAgentFilter)
  const stopExploration = useTestStore((s) => s.stopExploration)
  const setViewMode = useTestStore((s) => s.setViewMode)
  const setSetupStep = useTestStore((s) => s.setSetupStep)
  const enterComparison = useTestStore((s) => s.enterComparison)
  const suggestedGoals = useTestStore((s) => s.suggestedGoals)
  const agentCount = useTestStore((s) => s.agentCount)

  const batchExplorations = useMemo(() => {
    if (!lastBatchId) return explorations
    return explorations.filter((e) => e.batchId === lastBatchId)
  }, [explorations, lastBatchId])

  const anyRunning = batchExplorations.some((e) => e.status === 'running' || e.status === 'pending')

  const hasHistory = useMemo(() => {
    if (!selectedProject || !lastBatchId) return false
    return explorations.some((e) => e.batchId !== lastBatchId && e.cwd === selectedProject)
  }, [explorations, lastBatchId, selectedProject])

  const handleToggleFilter = (id: string) => {
    setAgentFilter(agentFilter === id ? null : id)
  }

  const handleStopAll = () => {
    for (const exp of batchExplorations) {
      if (exp.status === 'running') {
        stopExploration(exp.id)
      }
    }
  }

  const handleNewRun = () => {
    setSetupStep(1)
    setViewMode('setup')
  }

  const handleRunAgain = () => {
    setSetupStep(3)
    setViewMode('setup')
  }

  const handleCompare = () => {
    const previousBatch = explorations.find(
      (e) => e.batchId !== lastBatchId && e.cwd === selectedProject,
    )
    if (previousBatch?.batchId && lastBatchId) {
      const baselineExp = explorations.find((e) => e.batchId === previousBatch.batchId)
      const targetExp = batchExplorations[0]
      if (baselineExp && targetExp) {
        enterComparison(baselineExp.id, targetExp.id)
      }
    }
  }

  const goalCount = suggestedGoals.filter((g) => g.selected).length

  return (
    <div className="flex h-full flex-col">
      <ConfigBar
        projectName={selectedProject ? basename(selectedProject) : ''}
        goalCount={goalCount}
        agentCount={agentCount}
        explorations={batchExplorations}
        hasHistory={hasHistory}
        onStopAll={handleStopAll}
        onNewRun={handleNewRun}
        onRunAgain={handleRunAgain}
        onCompare={handleCompare}
      />

      <AgentTileStrip
        explorations={batchExplorations}
        agentMessages={agentMessagesByExploration}
        agentFilter={agentFilter}
        onToggleFilter={handleToggleFilter}
        onStop={(id) => stopExploration(id)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex shrink-0 flex-col overflow-hidden" style={{ width: splitWidth }}>
          <ActivityFeed
            explorations={batchExplorations}
            agentMessages={agentMessagesByExploration}
            agentFilter={agentFilter}
            isRunning={anyRunning}
          />
        </div>
        <div
          onMouseDown={onDragStart}
          className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-base-border-subtle border-r bg-base-bg transition-colors hover:bg-base-border active:bg-base-text-faint"
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <FindingsPanel
            explorations={batchExplorations}
            findingsByExploration={findingsByExploration}
            testsByExploration={testsByExploration}
            agentFilter={agentFilter}
            cwd={selectedProject ?? ''}
          />
        </div>
      </div>
    </div>
  )
}
