import { useEffect } from 'react'
import { useGitCommitStore } from '../store/git-commit-store'
import { useGitGraphStore } from '../store/git-graph-store'
import { useGitOpsStore } from '../store/git-ops-store'
import { useTabStore } from '../store/tab-store'

export function useGitBridge() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const cwd = activeTab?.cwd ?? ''

  const fetchGraph = useGitGraphStore((s) => s.fetchGraph)
  const fetchBranches = useGitGraphStore((s) => s.fetchBranches)
  const fetchStatus = useGitCommitStore((s) => s.fetchStatus)
  const setConflicts = useGitOpsStore((s) => s.setConflicts)

  // Listen for git graph updated events (fired after any git mutation)
  useEffect(() => {
    if (!cwd) return

    const unsub = window.api.onGitGraphUpdated(() => {
      fetchGraph(cwd)
      fetchBranches(cwd)
      fetchStatus(cwd)
    })

    return unsub
  }, [cwd, fetchGraph, fetchBranches, fetchStatus])

  // Listen for conflict detected events
  useEffect(() => {
    if (!cwd) return

    const unsub = window.api.onGitOpsConflictDetected((data: unknown) => {
      const conflicts = data as import('../../../shared/git-types').ConflictResolution[]
      setConflicts(conflicts)
    })

    return unsub
  }, [cwd, setConflicts])
}
