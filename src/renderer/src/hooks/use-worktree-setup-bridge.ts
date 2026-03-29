import { useEffect } from 'react'
import type { SetupCompleteEvent, SetupProgressEvent } from '../../../shared/types'
import { useWorktreeSetupStore } from '../store/worktree-setup-store'

export function useWorktreeSetupBridge(): void {
  const setProgress = useWorktreeSetupStore((s) => s.setProgress)
  const setResult = useWorktreeSetupStore((s) => s.setResult)

  useEffect(() => {
    const unsubProgress = window.api.onWorktreeSetupProgress((data) => {
      setProgress(data as SetupProgressEvent)
    })
    const unsubComplete = window.api.onWorktreeSetupComplete((data) => {
      setResult(data as SetupCompleteEvent)
    })

    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [setProgress, setResult])
}
