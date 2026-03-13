import { useEffect } from 'react'
import type { ExplorationUpdate, GoalSuggestionUpdate } from '../../../shared/types'
import { useTestStore } from '../store/test-store'

export function useTestBridge() {
  const handleExplorationUpdate = useTestStore((s) => s.handleExplorationUpdate)
  const handleGoalSuggestion = useTestStore((s) => s.handleGoalSuggestion)

  useEffect(() => {
    const unsub = window.api.onExplorationUpdate((data) => {
      handleExplorationUpdate(data as ExplorationUpdate)
    })
    return unsub
  }, [handleExplorationUpdate])

  useEffect(() => {
    const unsub = window.api.onGoalSuggestion((data) => {
      handleGoalSuggestion(data as GoalSuggestionUpdate)
    })
    return unsub
  }, [handleGoalSuggestion])
}
