import { useEffect } from 'react'
import { useGitCommitStore } from '../store/git-commit-store'
import { useGitGraphStore } from '../store/git-graph-store'
import { useGitOpsStore } from '../store/git-ops-store'
import { useSessionStore } from '../store/session-store'
import { useUiStore } from '../store/ui-store'

export function useGitBridge() {
  const activeSessionId = useUiStore((s) => s.activeSessionId)
  const activeSession = useSessionStore((s) =>
    activeSessionId ? s.sessions.get(activeSessionId) : undefined,
  )
  const cwd = activeSession?.cwd ?? ''

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
