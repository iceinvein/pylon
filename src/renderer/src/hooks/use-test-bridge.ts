import { useEffect } from 'react'
import { useTestStore } from '../store/test-store'

export function useTestBridge() {
  const handleExplorationUpdate = useTestStore((s) => s.handleExplorationUpdate)

  useEffect(() => {
    const unsub = window.api.onExplorationUpdate((data) => {
      handleExplorationUpdate(data as Parameters<typeof handleExplorationUpdate>[0])
    })
    return unsub
  }, [handleExplorationUpdate])
}
